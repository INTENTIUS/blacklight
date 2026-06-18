# blacklight

Paste a repo URL, see the misconfigurations hiding in your infra. A hosted
[chant audit](https://intentius.io/chant/cli/audit/) — Cloudflare Worker + Pages.

Live at **[blacklight.intentius.workers.dev](https://blacklight.intentius.workers.dev)**.

- **Worker** (`src/handler.ts`): `POST /audit { url }` → fetch the repo tree →
  detect lexicons → run the security/correctness/best-practice checks →
  return the report (with quick-win fix diffs). Stateless about your code.
- **SPA** (`web/`): paste-a-URL UI, tier-first report (quick wins → needs review
  → report-only) with category filters and copyable fix diffs.

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

Deployment is via **GitHub Actions** (`.github/workflows/deploy.yml`), matching
the all-CI/CD-in-Actions setup — *not* Cloudflare Workers Builds (disable its
auto-deploy if connected, to avoid double-deploys). On push to `main` it builds
the SPA and runs `wrangler deploy --assets ./web/dist`. It's **gated** so it
stays inert until you opt in:

1. Repo **variable** `DEPLOY` = `true`.
2. A GitHub **environment** named `production` holding the secrets:
   `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

Then, in the Worker's settings, add the optional runtime config (all off by
default): `GIT_TOKEN` (secret), `TURNSTILE_SECRET` (secret), and a KV namespace
bound as `STATS` — see below.

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
- Flip `DEPLOY=true` + add the `production` environment secrets, then deploy.
