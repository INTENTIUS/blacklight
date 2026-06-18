#!/usr/bin/env bash
# Hermetic Docker E2E for Blacklight.
#
# Clean-room install from npm (@intentius/chant@^0.8.0), boots the worker on
# workerd in fixture mode, and asserts the full audit pipeline end-to-end. No
# host state, no network at audit time. Doubles as the published-install check.
#
# Usage: e2e/run.sh  (needs Docker; on-demand, not gating CI)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "→ docker build (installs Blacklight from npm)"
docker build -q -t blacklight-e2e -f "$ROOT/e2e/Dockerfile" "$ROOT"

echo "→ docker run"
docker run --rm blacklight-e2e
