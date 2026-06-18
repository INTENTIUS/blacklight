# Clean-room E2E: install Blacklight from npm (published @intentius/chant), boot
# the worker on workerd in fixture mode, and run the audit pipeline end-to-end —
# no host state, no network at audit time. Build context is the repo root.
FROM node:22-slim

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-fund --no-audit \
  && npm install --no-fund --no-audit --save-dev wrangler@4 @cloudflare/workers-types

COPY src ./src
COPY wrangler.toml ./
COPY e2e/check.mjs ./e2e/check.mjs

# Boot the worker in fixture mode, wait for it, run the E2E assertions.
CMD set -e; \
  npx wrangler dev --var BLACKLIGHT_FIXTURE:1 --port 8787 --ip 0.0.0.0 --local > /tmp/dev.log 2>&1 & \
  for i in $(seq 1 60); do curl -sf http://localhost:8787/ >/dev/null 2>&1 && break; sleep 1; done; \
  BASE=http://localhost:8787 node e2e/check.mjs
