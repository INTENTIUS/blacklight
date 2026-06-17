/**
 * Blacklight — the hosted chant audit. Paste a repo URL, see the
 * misconfigurations hiding in your infra.
 *
 * The Worker is a thin, stateless wrapper over chant's audit engine:
 *   fetchRepoFiles (tree-walk, all lexicons) → classifyFiles → auditFiles → buildReportJson
 *
 * Everything it imports is edge-clean: the per-lexicon `detect` modules (#426)
 * for content detection, and the post-synth check barrels (#409) for the checks.
 * No plugin, no filesystem, no TypeScript compiler in the bundle.
 *
 * Nothing about the audited repo is stored — only an anonymous count (#357).
 */
import { fetchRepoFiles, FetchError } from "@intentius/chant/audit/fetch";
import { classifyFiles, type DetectPlugin } from "@intentius/chant/audit/discover";
import { auditFiles, type AuditLexicon } from "@intentius/chant/audit/core";
import { buildReportModel } from "@intentius/chant/audit/report-model";
import type { PostSynthCheck } from "@intentius/chant/lint/post-synth";

import { detectTemplate as detectK8s } from "@intentius/chant-lexicon-k8s/detect";
import { detectTemplate as detectDocker } from "@intentius/chant-lexicon-docker/detect";
import { detectTemplate as detectAws } from "@intentius/chant-lexicon-aws/detect";
import { detectTemplate as detectAzure } from "@intentius/chant-lexicon-azure/detect";
import { detectTemplate as detectGcp } from "@intentius/chant-lexicon-gcp/detect";
import { detectTemplate as detectHelm } from "@intentius/chant-lexicon-helm/detect";

import { postSynthChecks as githubChecks } from "@intentius/chant-lexicon-github/lint/post-synth";
import { postSynthChecks as gitlabChecks } from "@intentius/chant-lexicon-gitlab/lint/post-synth";
import { postSynthChecks as forgejoChecks } from "@intentius/chant-lexicon-forgejo/lint/post-synth";
import { postSynthChecks as k8sChecks } from "@intentius/chant-lexicon-k8s/lint/post-synth";
import { postSynthChecks as dockerChecks } from "@intentius/chant-lexicon-docker/lint/post-synth";
import { postSynthChecks as awsChecks } from "@intentius/chant-lexicon-aws/lint/post-synth";
import { postSynthChecks as azureChecks } from "@intentius/chant-lexicon-azure/lint/post-synth";
import { postSynthChecks as gcpChecks } from "@intentius/chant-lexicon-gcp/lint/post-synth";
import { postSynthChecks as helmChecks } from "@intentius/chant-lexicon-helm/lint/post-synth";

/** Detectors for classifyFiles. CI lexicons are path-detected (name only); the
 * rest carry the edge-safe detectTemplate. */
const DETECTORS: DetectPlugin[] = [
  { name: "github" },
  { name: "gitlab" },
  { name: "forgejo" },
  { name: "k8s", detectTemplate: detectK8s },
  { name: "docker", detectTemplate: detectDocker },
  { name: "aws", detectTemplate: detectAws },
  { name: "azure", detectTemplate: detectAzure },
  { name: "gcp", detectTemplate: detectGcp },
  { name: "helm", detectTemplate: detectHelm },
];

/** Post-synth checks per lexicon (mirrors core's defaultChecksProvider). Forgejo
 * is GitHub-dialect, so it runs both tiers. */
const CHECKS: Record<string, PostSynthCheck[]> = {
  github: githubChecks,
  gitlab: gitlabChecks,
  forgejo: [...forgejoChecks, ...githubChecks],
  k8s: k8sChecks,
  docker: dockerChecks,
  aws: awsChecks,
  azure: azureChecks,
  gcp: gcpChecks,
  helm: helmChecks,
};
const checksProvider = async (lexicon: AuditLexicon): Promise<PostSynthCheck[]> => CHECKS[lexicon] ?? [];

interface Env {
  /** Server-side git token (secret). */
  GIT_TOKEN?: string;
  /** Anonymous audit counter — wired in #357. */
  STATS?: KVNamespace;
  /** Test-only: "1" serves a baked fixture repo (hermetic E2E, no network). */
  BLACKLIGHT_FIXTURE?: string;
}

const CORS = {
  "access-control-allow-origin": "*", // TODO(#357): lock to the Pages origin
  "access-control-allow-methods": "POST, GET, OPTIONS",
  "access-control-allow-headers": "content-type",
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...CORS } });

/** Best-effort anonymous tally — no repo identity, ever. Real impl lands with #357. */
async function bumpCount(env: Env): Promise<void> {
  if (!env.STATS) return;
  try {
    const n = Number((await env.STATS.get("audits")) ?? "0") + 1;
    await env.STATS.put("audits", String(n));
  } catch {
    // counting is best-effort; never fail an audit over it
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (req.method === "GET" && url.pathname === "/") {
      return json({ ok: true, service: "blacklight", audit: "POST /audit { url }" });
    }
    if (req.method !== "POST" || url.pathname !== "/audit") return json({ error: "Not found" }, 404);

    let target: string;
    try {
      target = (await req.json<{ url?: string }>()).url ?? "";
    } catch {
      return json({ error: "Body must be JSON: { \"url\": \"https://…\" }" }, 400);
    }
    if (!target) return json({ error: "Missing url" }, 400);

    try {
      const fetchImpl = env.BLACKLIGHT_FIXTURE === "1" ? (await import("./fixture")).fixtureFetch() : undefined;
      const files = await fetchRepoFiles(target, { token: env.GIT_TOKEN, fetchImpl });
      const inputs = classifyFiles(files, DETECTORS);
      const findings = await auditFiles(inputs, { checksProvider });
      // The model (not the flat JSON) carries the quick-win fix diffs the UI leads with.
      const model = buildReportModel(findings, { files: inputs.map((i) => ({ path: i.path, content: i.content })) });
      await bumpCount(env);
      return json({
        target,
        counts: model.counts,
        quickWins: model.quickWins,
        needsReview: model.needsReview,
        reportOnly: model.reportOnly,
        scanned: files.length,
      });
    } catch (err) {
      // Allowlist / parse / cap failures are user-facing 4xx; anything else 502.
      const msg = err instanceof Error ? err.message : String(err);
      const status = err instanceof FetchError ? 400 : 502;
      return json({ error: msg }, status);
    }
  },
};
