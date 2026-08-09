# blacklight

Paste a repo URL, see the misconfigurations hiding in your infra.

Blacklight is a hosted [chant audit](https://intentius.io/chant/cli/audit/). Point
it at a public repo on GitHub, GitLab, or Codeberg and it reads your CI workflows,
Kubernetes manifests, Dockerfiles, Helm charts, and cloud templates, runs a few
hundred security and correctness checks against them, and hands you a report that
leads with the fixes you can apply right now, as ready-made diffs. It never stores
your code, and you don't need an account.

Live at **[blacklight.intentius.io](https://blacklight.intentius.io)** (redirects
to the canonical `blacklight.intentius.workers.dev`).

## Quickstart

The fastest way is the site: open
[blacklight.intentius.io](https://blacklight.intentius.io), paste a repo URL, hit
audit. You'll get a tier-first report in a few seconds: quick wins with copyable
diffs, findings that need a human, and hygiene notes. Download it as Markdown,
JSON, or an LLM-context block for your coding assistant.

The same audit is one curl away:

```sh
curl -s -X POST https://blacklight.intentius.workers.dev/audit \
  -H 'content-type: application/json' \
  -d '{"url": "https://github.com/owner/repo"}'
```

## For AI agents

This section is self-contained: everything an agent needs to call blacklight and
act on the result.

**Endpoint**: `POST https://blacklight.intentius.workers.dev/audit` with a JSON
body of `{"url": "<https repo URL on github.com, gitlab.com, or codeberg.org>"}`.
No auth. Success is `200` with the report JSON below.

**Errors**: `400` for anything wrong with the target (non-allowlisted host,
unparseable URL, repo too large for the caps) with `{"error": "<reason>"}`;
`403` when the Turnstile bot gate is enabled and no valid token was sent (the
API path may require solving a challenge in the browser); `429` when rate
limited, with a `retry-after` header in seconds; `502` for upstream fetch
failures. Treat non-200 as "no report", not as findings.

**Response shape**:

```jsonc
{
  "target": "https://github.com/owner/repo",
  "scanned": 41,                  // files fetched and classified
  "counts": {
    "total": 55,
    "quickWin": 3,                // deterministic fixes, diffs included
    "needsReview": 24,            // merge-worthy but needs judgement
    "reportOnly": 28,             // hygiene, not merge-blocking
    "errors": 1, "warnings": 47, "infos": 7,
    "security": 24, "correctness": 0, "bestPractice": 31
  },
  "quickWins": [                  // per-file combined patches
    { "file": ".github/workflows/ci.yml",
      "diff": "--- a/...",        // unified diff, apply with git apply
      "addressed": [ /* RuleMeta of the rules the diff fixes */ ],
      "needsInput": [ /* deterministic but blocked on a value, e.g. a SHA */ ] }
  ],
  "needsReview": [                // clusters grouped by cited authority
    { "name": "OSSF Scorecard — Token-Permissions", "url": "https://...",
      "rules": [ { "meta": { /* RuleMeta */ }, "findings": [ /* Finding */ ] } ] }
  ],
  "reportOnly": [ /* Finding */ ]
}
```

**A Finding** carries `checkId` (rule id like `GHA033`, `WK8203`, `WAW018`),
`severity` (`error` | `warning` | `info`), `message`, `file`, optional `entity`
(e.g. the job or resource name), `lexicon` (which ruleset produced it), and
`meta`. **RuleMeta** carries `id`, `title`, `tier`, `fixKind`, `category`,
`remediation` (one-line fix guidance), and optional `authority` citations
(name + URL of the external standard backing the rule).

**Interpreting tiers for gating**: `tier: "merge-worthy"` findings are the ones
worth blocking or fixing before merge; `tier: "report-only"` is hygiene. Within
merge-worthy, `fixKind: "deterministic"` means the fix is mechanical (quick-win
diffs cover these); `fixKind: "guidance"` means a human or agent should review.
A reasonable CI gate: fail on any merge-worthy finding, apply quick-win diffs
automatically, surface the rest. `category` says what kind of problem it is
(`security` | `correctness` | `best-practice`) independent of fix confidence.
Each rule is documented at
`https://intentius.io/chant/lint-rules/audit-rules/#<id-lowercase>`.

**Also available**: `GET /` returns service metadata, `GET /stats` returns
anonymous totals `{"audits": n, "findings": n}`.

## What it covers

One audit runs the rule catalogs of ten chant lexicons over whatever it finds in
the repo:

| Files | Ruleset (rule-id prefix) |
| --- | --- |
| `.github/workflows/*.yml` | GitHub Actions (`GHA`) |
| `.gitlab-ci.yml` | GitLab CI (`WGL`) |
| `.forgejo/workflows/*.yml` | Forgejo/Gitea Actions (`WFJ`, plus the GitHub tier) |
| Kubernetes manifests | k8s, Argo CD, Flux (`WK8`, `ARGO`, `FLUX`) |
| Dockerfiles, Compose files | Docker (`DKRD`) |
| CloudFormation templates | AWS (`WAW`, `COR`, `EXT`) |
| ARM templates | Azure (`AZR`) |
| Config Connector YAML | Google Cloud (`WGC`) |
| Helm charts (as a bundle) | Helm (`WHM`) |
| fountain.dev/v1 manifests | scanned; see note |

A note on fountain: blacklight ships the fountain lexicon and its `FTN` rule
catalog, and standalone `fountain.dev/v1` YAML is fetched and scanned. At chant
0.44 the classifier routes those documents through the Kubernetes ruleset
(they're valid `apiVersion`/`kind` documents), and fountain's own FTN checks read
chant's typed model, so they fire on `chant build` rather than on standalone
YAML. When chant routes fountain natively, blacklight picks it up without
changes.

## Develop

```
just install        # worker + web deps
just up             # local stack (fixture mode) → http://localhost:5173
just down
just check          # tsc + tests + edge bundle
just e2e            # hermetic Docker E2E (clean-room, offline)
just e2e-browser    # Playwright browser E2E
```

Fixture mode (`BLACKLIGHT_FIXTURE=1`) serves a baked multi-lexicon repo for any
URL, so the whole stack runs offline with no token.

## Deploy

One Worker serves **both** the SPA and the `/audit` API via Cloudflare **Static
Assets** — no separate Pages project, same origin (so the SPA calls `/audit`
relative; no `VITE_API_BASE` and no cross-origin CORS). Assets stay out of the
base `wrangler.toml` so `wrangler dev` / CI don't need a built `web/dist`; the
deploy passes `--assets ./web/dist`.

Continuous deploys run through **Cloudflare Workers Builds** on push to `main`.
Manual deploys are `just deploy` (builds the SPA, then
`wrangler deploy --assets ./web/dist`; needs `wrangler whoami` to show an
authenticated account).

Optional runtime config in the Worker's settings (all off by default):
`GIT_TOKEN` (secret), `TURNSTILE_SECRET` (secret), and a KV namespace bound as
`STATS` — see below.

## Security & abuse controls (#357)

All edge-side; the audit engine adds the SSRF base (chant `fetch.ts`).

- **SSRF**: only `github.com` / `gitlab.com` / `codeberg.org` are fetched, over
  https, with URLs built from the parsed `owner/repo` — never a user-controlled
  host/port/scheme. Redirects are refused. This blocks pointing the server at
  internal / loopback / metadata addresses. (`src/ssrf.test.ts`)
- **Resource caps** (inherited from the engine): max files, per-file bytes,
  total bytes, per-request timeout.
- **Rate limiting** (`src/limit.ts`): per-IP per-minute + per-day, and a global
  per-minute breaker that sheds with `429` before the shared git token or the
  container is exhausted. Active only when a `STATS` KV namespace is bound.
  Tune the defaults in `DEFAULT_LIMITS`.
- **Bot gate** (`src/turnstile.ts`): when `TURNSTILE_SECRET` is set, every audit
  requires a valid Cloudflare Turnstile token (verified server-side, fail-closed).
  The SPA renders the widget when `VITE_TURNSTILE_SITEKEY` is set.
- **CORS**: same-origin by default (the SPA is served by this Worker), so other
  sites' browsers can't call `/audit`. Set `ALLOWED_ORIGIN` only if the SPA is
  ever hosted on a different origin.
- **Observability**: rejected requests are logged by reason (`turnstile`,
  `rate:ip-minute`, …) with the IP — no repo URL, no findings, no other PII.

Both gates are **off by default** (no KV bound, no secret) so dev / fixture /
E2E stay open. Enable for production:

```
wrangler kv namespace create STATS        # bind as STATS in wrangler.toml
wrangler secret put TURNSTILE_SECRET
wrangler secret put GIT_TOKEN              # lifts host rate limits; resolves pin diffs
# web build: VITE_TURNSTILE_SITEKEY=<sitekey>
```

### Still open before public launch
- Global *concurrency* breaker is per-minute (KV); a Durable Object would give
  exact in-flight concurrency limits if needed (#4).
