import type { Report, RuleMeta } from "./types";

function authority(meta: RuleMeta): string {
  return meta.authority?.length ? ` (per ${meta.authority.map((a) => `${a.name}: ${a.url}`).join("; ")})` : "";
}

const LEXICON_NAMES: Record<string, string> = {
  github: "GitHub Actions",
  gitlab: "GitLab CI",
  forgejo: "Forgejo CI",
  k8s: "Kubernetes",
  docker: "Docker",
  aws: "AWS CloudFormation",
  azure: "Azure ARM Templates",
  gcp: "Google Cloud",
  helm: "Helm",
  temporal: "Temporal",
};

const RULE_PREFIXES: Array<[string, string]> = [
  ["GHA", "github"],
  ["WGL", "gitlab"],
  ["WFJ", "forgejo"],
  ["WK8", "k8s"],
  ["DKRC", "docker"],
  ["DKRD", "docker"],
  ["AWS", "aws"],
  ["AZR", "azure"],
  ["WGC", "gcp"],
  ["WHM", "helm"],
  ["ARGO", "temporal"],
];

function lexiconFromRuleId(id: string): string {
  for (const [prefix, lexicon] of RULE_PREFIXES) {
    if (id.startsWith(prefix)) return lexicon;
  }
  return "other";
}

/** A compact rule set the user can paste into an LLM system prompt or context
 * window so the assistant flags the same issues in future code. */
export function reportToLLMContext(r: Report): string {
  const ruleMap = new Map<string, { meta: RuleMeta; lexicon: string }>();

  for (const qw of r.quickWins) {
    for (const meta of qw.addressed) {
      if (!ruleMap.has(meta.id)) ruleMap.set(meta.id, { meta, lexicon: lexiconFromRuleId(meta.id) });
    }
    for (const f of qw.needsInput) {
      if (!ruleMap.has(f.meta.id)) ruleMap.set(f.meta.id, { meta: f.meta, lexicon: f.lexicon });
    }
  }
  for (const cl of r.needsReview) {
    for (const { meta, findings } of cl.rules) {
      if (!ruleMap.has(meta.id)) {
        ruleMap.set(meta.id, { meta, lexicon: findings[0]?.lexicon ?? lexiconFromRuleId(meta.id) });
      }
    }
  }
  for (const f of r.reportOnly) {
    if (!ruleMap.has(f.meta.id)) ruleMap.set(f.meta.id, { meta: f.meta, lexicon: f.lexicon });
  }

  if (!ruleMap.size) return "";

  const byLexicon = new Map<string, Map<string, RuleMeta[]>>();
  for (const { meta, lexicon } of ruleMap.values()) {
    if (!byLexicon.has(lexicon)) byLexicon.set(lexicon, new Map());
    const byCat = byLexicon.get(lexicon)!;
    if (!byCat.has(meta.category)) byCat.set(meta.category, []);
    byCat.get(meta.category)!.push(meta);
  }

  const CAT_LABELS: Record<string, string> = {
    security: "Security",
    correctness: "Correctness",
    "best-practice": "Best practice",
  };

  const out: string[] = [
    "# Audit rules — add to your LLM context to prevent regressions",
    "",
    `The following rules were violated in ${r.target}.`,
    "Paste this block into your AI coding assistant's system prompt or context window",
    "so it flags these issues before they reach a PR.",
    "",
  ];

  for (const [lexicon, byCat] of byLexicon) {
    out.push(`## ${LEXICON_NAMES[lexicon] ?? lexicon}`, "");
    for (const cat of ["security", "correctness", "best-practice"]) {
      const rules = byCat.get(cat);
      if (!rules?.length) continue;
      out.push(`### ${CAT_LABELS[cat]}`, "");
      for (const meta of rules) {
        const auth = meta.authority?.length ? ` [${meta.authority.map((a) => a.name).join(", ")}]` : "";
        out.push(`- **${meta.title}** (\`${meta.id}\`): ${meta.remediation}${auth}`);
      }
      out.push("");
    }
  }

  return out.join("\n");
}

/** A complete, human-readable Markdown report covering every finding in every
 * tier — what you'd paste into an issue or hand to a reviewer. */
export function reportToMarkdown(r: Report): string {
  const c = r.counts;
  const out: string[] = [];
  out.push(`# blacklight audit — ${r.target}`, "");
  out.push(`${c.total} findings across ${r.scanned} files: ${c.security} security, ${c.correctness} correctness, ${c.bestPractice} best-practice.`);
  out.push(`Tiers: ${c.quickWin} quick wins, ${c.needsReview} needs review, ${c.reportOnly} report-only.`, "");

  if (r.quickWins.length) {
    out.push(`## Quick wins (${c.quickWin}) — ready to apply`, "");
    for (const f of r.quickWins) {
      out.push(`### \`${f.file}\``);
      for (const m of f.addressed) out.push(`- **${m.id}** ${m.title}${authority(m)}`);
      for (const n of f.needsInput) out.push(`- **${n.checkId}** (needs a value) — ${n.meta.remediation}`);
      if (f.diff) out.push("", "```diff", f.diff, "```");
      out.push("");
    }
  }

  if (r.needsReview.length) {
    out.push(`## Needs review (${c.needsReview}) — judgement / agent`, "");
    for (const cl of r.needsReview) {
      out.push(`### ${cl.name}`);
      for (const { meta, findings } of cl.rules) {
        out.push(`- **${meta.id}** — ${meta.title}. ${meta.remediation}${authority(meta)}`);
        for (const fi of findings) out.push(`  - \`${fi.file}\`${fi.entity ? ` (${fi.entity})` : ""} — ${fi.message}`);
      }
      out.push("");
    }
  }

  if (r.reportOnly.length) {
    out.push(`## Report-only (${c.reportOnly}) — hygiene`, "");
    out.push("| Rule | Title | File | Detail |", "| --- | --- | --- | --- |");
    for (const f of r.reportOnly) {
      out.push(`| ${f.checkId} | ${f.meta.title} | \`${f.file}\` | ${f.message.replace(/\|/g, "\\|")} |`);
    }
    out.push("");
  }

  out.push("---", `Generated by blacklight — https://blacklight.intentius.io`);
  return out.join("\n");
}

function slug(target: string): string {
  return target.replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "report";
}

function trigger(name: string, type: string, body: string): void {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadMarkdown(r: Report): void {
  trigger(`blacklight-${slug(r.target)}.md`, "text/markdown", reportToMarkdown(r));
}

export function downloadJson(r: Report): void {
  trigger(`blacklight-${slug(r.target)}.json`, "application/json", JSON.stringify(r, null, 2));
}

export function downloadLLMContext(r: Report): void {
  trigger(`blacklight-${slug(r.target)}-llm-context.md`, "text/markdown", reportToLLMContext(r));
}
