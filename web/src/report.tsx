import { useState } from "preact/hooks";
import type { Category, GuidanceCluster, QuickWinFile, Report, RuleMeta, Finding } from "./types";
import { ruleDocUrl } from "./types";
import { downloadMarkdown, downloadJson } from "./download";

const CATS: Category[] = ["security", "correctness", "best-practice"];

function RuleLink({ id }: { id: string }) {
  return <a class="rule" href={ruleDocUrl(id)} target="_blank" rel="noreferrer">{id}</a>;
}

function Authority({ meta }: { meta: RuleMeta }) {
  if (!meta.authority?.length) return null;
  return (
    <span class="authority">
      {" per "}
      {meta.authority.map((a, i) => (
        <>
          {i > 0 && ", "}
          <a href={a.url} target="_blank" rel="noreferrer">{a.name}</a>
        </>
      ))}
    </span>
  );
}

function Diff({ diff, onCopy }: { diff: string; onCopy: () => void }) {
  return (
    <div class="diffwrap">
      <button class="copy" onClick={onCopy}>copy fix</button>
      <pre class="diff">
        {diff.split("\n").map((l) => {
          const cls = l.startsWith("@@") ? "hunk" : l.startsWith("+") ? "add" : l.startsWith("-") ? "del" : "ctx";
          return <span class={`l ${cls}`}>{l || " "}{"\n"}</span>;
        })}
      </pre>
    </div>
  );
}

function QuickWins({ files }: { files: QuickWinFile[] }) {
  if (!files.length) return null;
  const copy = (t: string) => void navigator.clipboard?.writeText(t);
  return (
    <section class="tier">
      <h2>⚡ Quick wins <span class="muted">ready to apply</span></h2>
      {files.map((f) => (
        <div class="card">
          <div class="card-head"><code>{f.file}</code></div>
          {f.addressed.map((m) => (
            <div class="addr"><RuleLink id={m.id} /> {m.title}<Authority meta={m} /></div>
          ))}
          {f.diff && <Diff diff={f.diff} onCopy={() => copy(f.diff!)} />}
          {f.needsInput.length > 0 && (
            <div class="needs">
              <strong>Needs a value to auto-patch:</strong>
              <ul>{f.needsInput.map((n) => <li><RuleLink id={n.checkId} /> — {n.meta.remediation}</li>)}</ul>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

function NeedsReview({ clusters }: { clusters: GuidanceCluster[] }) {
  if (!clusters.length) return null;
  const n = clusters.reduce((s, c) => s + c.rules.length, 0);
  return (
    <details class="tier" open>
      <summary>🔶 Needs review <span class="muted">judgement / agent — {n}</span></summary>
      {clusters.map((c) => (
        <div class="cluster">
          <h3>{c.url ? <a href={c.url} target="_blank" rel="noreferrer">{c.name}</a> : c.name}</h3>
          {c.rules.map(({ meta, findings }) => (
            <div class="rule-row">
              <div><span class={`sev ${findings[0].severity}`} /><RuleLink id={meta.id} /> — {meta.title}. <span class="muted">{meta.remediation}</span><Authority meta={meta} /></div>
              <ul>{findings.map((f) => <li><code>{f.file}</code>{f.entity ? ` (${f.entity})` : ""} — {f.message}</li>)}</ul>
            </div>
          ))}
        </div>
      ))}
    </details>
  );
}

function ReportOnly({ findings }: { findings: Finding[] }) {
  if (!findings.length) return null;
  return (
    <details class="tier" open>
      <summary>📋 Report-only <span class="muted">hygiene — {findings.length}</span></summary>
      <table>
        <thead><tr><th>Rule</th><th>Title</th><th>File</th><th>Detail</th></tr></thead>
        <tbody>
          {findings.map((f) => (
            <tr><td><RuleLink id={f.checkId} /></td><td>{f.meta.title}</td><td><code>{f.file}</code></td><td>{f.message}</td></tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** Tier-first result view: quick-wins → needs-review → report-only, with a
 * category headline + filter. CLI reports share this spine. */
export function ReportView({ report }: { report: Report }) {
  const [cat, setCat] = useState<Category | "all">("all");
  const c = report.counts;
  const m = (meta: RuleMeta) => cat === "all" || meta.category === cat;

  const quickWins = report.quickWins
    .map((f) => ({ ...f, addressed: f.addressed.filter(m), needsInput: f.needsInput.filter((n) => m(n.meta)) }))
    .filter((f) => f.addressed.length || f.needsInput.length);
  const needsReview = report.needsReview
    .map((cl) => ({ ...cl, rules: cl.rules.filter((r) => m(r.meta)) }))
    .filter((cl) => cl.rules.length);
  const reportOnly = report.reportOnly.filter((f) => m(f.meta));

  return (
    <div class="report">
      <div class="head">
        <div class="target"><code>{report.target}</code> <span class="muted">· {report.scanned} files</span></div>
        <div class="headline">
          {c.total} finding{c.total === 1 ? "" : "s"} —{" "}
          <span class="cat-security">{c.security} security</span>, {c.correctness} correctness, {c.bestPractice} best-practice
        </div>
        <div class="tiers-line muted">
          {c.quickWin} quick wins · {c.needsReview} needs review · {c.reportOnly} report-only
        </div>
        <div class="head-actions">
          <div class="chips">
            <button class={cat === "all" ? "chip on" : "chip"} onClick={() => setCat("all")}>all {c.total}</button>
            {CATS.map((k) => (
              <button class={cat === k ? "chip on" : "chip"} onClick={() => setCat(k)}>
                {k} {k === "security" ? c.security : k === "correctness" ? c.correctness : c.bestPractice}
              </button>
            ))}
          </div>
          <div class="downloads">
            <button class="dl" onClick={() => downloadMarkdown(report)}>⬇ Markdown</button>
            <button class="dl" onClick={() => downloadJson(report)}>⬇ JSON</button>
          </div>
        </div>
      </div>
      <QuickWins files={quickWins} />
      <NeedsReview clusters={needsReview} />
      <ReportOnly findings={reportOnly} />
    </div>
  );
}
