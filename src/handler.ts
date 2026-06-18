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
import { checkLimits } from "./limit";
import { verifyTurnstile } from "./turnstile";
import { bumpStats, readStats } from "./stats";
import { uaFetch } from "./ua-fetch";

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
  /** Anonymous audit counter + rate-limit windows (KV). Rate limiting is on when bound. */
  STATS?: KVNamespace;
  /** Turnstile secret — when set, every audit requires a valid challenge token. */
  TURNSTILE_SECRET?: string;
  /** Comma-separated allowed origins for cross-origin calls. Unset = same-origin
   *  only (the SPA is served by this Worker, so no CORS is needed by default). */
  ALLOWED_ORIGIN?: string;
  /** Test-only: "1" serves a baked fixture repo (hermetic E2E, no network). */
  BLACKLIGHT_FIXTURE?: string;
}

/**
 * CORS headers — empty unless ALLOWED_ORIGIN is configured and the request's
 * Origin matches (or `*`). The SPA is same-origin, so by default we send no CORS
 * headers, which means other sites' browsers can't call /audit. (#2)
 */
function corsHeaders(env: Env, req: Request): Record<string, string> {
  const allowed = env.ALLOWED_ORIGIN;
  if (!allowed) return {};
  const origin = req.headers.get("origin") ?? "";
  const match = allowed === "*" ? "*" : allowed.split(",").map((s) => s.trim()).includes(origin) ? origin : "";
  if (!match) return {};
  return {
    "access-control-allow-origin": match,
    "access-control-allow-methods": "POST, GET, OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "origin",
  };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const cors = corsHeaders(env, req);
    const json = (body: unknown, status = 200, extra: Record<string, string> = {}): Response =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...cors, ...extra } });

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method === "GET" && url.pathname === "/") {
      return json({ ok: true, service: "blacklight", audit: "POST /audit { url }" });
    }
    if (req.method === "GET" && url.pathname === "/stats") {
      return json(env.STATS ? await readStats(env.STATS) : { audits: 0, findings: 0 });
    }
    if (req.method !== "POST" || url.pathname !== "/audit") return json({ error: "Not found" }, 404);

    let target: string;
    let turnstileToken: string | undefined;
    try {
      const body = await req.json<{ url?: string; turnstileToken?: string }>();
      target = body.url ?? "";
      turnstileToken = body.turnstileToken;
    } catch {
      return json({ error: "Body must be JSON: { \"url\": \"https://…\" }" }, 400);
    }
    if (!target) return json({ error: "Missing url" }, 400);

    const ip = req.headers.get("cf-connecting-ip") ?? "unknown";

    // Bot/abuse gate — only enforced when a secret is configured (dev/fixture stay open).
    if (env.TURNSTILE_SECRET) {
      const ok = await verifyTurnstile(env.TURNSTILE_SECRET, turnstileToken, ip);
      if (!ok) {
        console.warn(`reject reason=turnstile ip=${ip}`);
        return json({ error: "Verification required." }, 403);
      }
    }

    // Per-IP + global rate limiting — only when a KV store is bound.
    if (env.STATS) {
      const rl = await checkLimits(env.STATS, ip, Date.now());
      if (!rl.ok) {
        console.warn(`reject reason=rate:${rl.reason} ip=${ip}`);
        return json({ error: "Rate limit exceeded. Try again shortly." }, 429, { "retry-after": String(rl.retryAfterSec ?? 60) });
      }
    }

    try {
      const fetchImpl = env.BLACKLIGHT_FIXTURE === "1" ? (await import("./fixture")).fixtureFetch() : uaFetch;
      const files = await fetchRepoFiles(target, { token: env.GIT_TOKEN, fetchImpl });
      const inputs = classifyFiles(files, DETECTORS);
      const findings = await auditFiles(inputs, { checksProvider });
      // The model (not the flat JSON) carries the quick-win fix diffs the UI leads with.
      const model = buildReportModel(findings, { files: inputs.map((i) => ({ path: i.path, content: i.content })) });
      if (env.STATS) {
        try {
          await bumpStats(env.STATS, findings.length);
        } catch {
          // counting is best-effort; never fail an audit over it
        }
      }
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
