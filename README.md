# blacklight

Paste a repo URL, see the misconfigurations hiding in your infra. A hosted
[chant audit](https://intentius.io/chant/cli/audit/) — Cloudflare Worker + Pages.

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
- Lock CORS to the Pages origin (currently `*`).
- Global *concurrency* breaker is per-minute (KV); a Durable Object would give
  exact in-flight concurrency limits if needed.
- Publish chant to npm so deps come from the registry, not `file:`.
