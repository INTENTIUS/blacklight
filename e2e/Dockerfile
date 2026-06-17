# Clean-room E2E: install Blacklight from scratch, boot the worker on workerd in
# fixture mode, and run the audit pipeline end-to-end — no host state, no network.
#
# Build context is e2e/context/ (staged by run.sh): the blacklight repo plus
# vendored chant tarballs (npm pack), so the file: dev deps are replaced by a
# real registry-style install. This doubles as the publish/clean-install check.
FROM node:22-slim

WORKDIR /app
COPY . ./

# Install the vendored @intentius tarballs + dev tooling, clean room.
RUN npm install --no-fund --no-audit ./vendor/*.tgz \
  && npm install --no-fund --no-audit --save-dev wrangler@4 @cloudflare/workers-types

# Boot the worker in fixture mode, wait for it, run the E2E assertions.
CMD set -e; \
  npx wrangler dev --var BLACKLIGHT_FIXTURE:1 --port 8787 --ip 0.0.0.0 --local > /tmp/dev.log 2>&1 & \
  for i in $(seq 1 60); do curl -sf http://localhost:8787/ >/dev/null 2>&1 && break; sleep 1; done; \
  BASE=http://localhost:8787 node e2e/check.mjs
