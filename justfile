# Blacklight — hosted chant audit. Dev / build / test / E2E tasks.
# `just` with no target lists everything.

default:
    @just --list

# Install worker + web dependencies.
install:
    npm install
    npm --prefix web install

# Bring the local stack up (worker fixture + Vite) for preview → http://localhost:5173
up:
    #!/usr/bin/env bash
    set -euo pipefail
    just down
    sleep 1
    nohup npx wrangler dev --var BLACKLIGHT_FIXTURE:1 --port 8787 --local >/tmp/blacklight-worker.log 2>&1 &
    nohup npm --prefix web run dev -- --port 5173 --strictPort >/tmp/blacklight-vite.log 2>&1 &
    for i in $(seq 1 45); do curl -sf http://localhost:5173/ >/dev/null 2>&1 && break; sleep 1; done
    echo "Blacklight up → http://localhost:5173  (worker :8787, fixture mode)"
    echo "logs: /tmp/blacklight-worker.log /tmp/blacklight-vite.log · stop: just down"

# Tear the local stack down.
down:
    #!/usr/bin/env bash
    pkill -f "wrangler dev" 2>/dev/null || true
    pkill -f "workerd" 2>/dev/null || true
    pkill -f "vite" 2>/dev/null || true
    echo "Blacklight stopped."

# Edge-bundle the worker (dry-run) — the real compile gate (esbuild, no tsc of chant source).
bundle:
    npx wrangler deploy --dry-run --outdir dist

# Typecheck the SPA (the worker is validated by `just bundle`).
tsc:
    npm --prefix web run tsc

# Unit / render tests (SPA).
test:
    npm --prefix web test

# Build the static SPA.
build:
    npm --prefix web run build

# Hermetic Docker E2E: clean-room install + worker on workerd + full pipeline, offline. (needs Docker)
e2e:
    bash e2e/run.sh

# Browser E2E: headless Chromium drives the SPA against the fixture worker.
e2e-browser:
    npm --prefix web run e2e:browser

# Everything CI-relevant right now (no Docker / no browser download).
check: tsc test bundle

# Deploy worker + SPA. Needs Cloudflare auth; publish chant first (file: deps -> npm).
deploy:
    npx wrangler deploy
    npm --prefix web run build
    @echo "TODO: wrangler pages deploy web/dist (after domain wiring)"
