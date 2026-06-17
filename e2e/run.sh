#!/usr/bin/env bash
# Hermetic Docker E2E for Blacklight.
#
# Packs the local chant packages into tarballs (replacing the file: dev deps —
# also a clean-install / publish check), stages a build context, then builds and
# runs a container that boots the worker on workerd in fixture mode and asserts
# the full audit pipeline end-to-end. No network, no token.
#
# Usage: e2e/run.sh   (needs Docker; on-demand, not gating CI)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHANT="${CHANT_DIR:-/Users/alex/Documents/checkouts/intentius/chant}"
CTX="$ROOT/e2e/context"

echo "→ staging clean-room context at $CTX"
rm -rf "$CTX"; mkdir -p "$CTX/vendor"

echo "→ packing chant packages (npm pack)"
for pkg in packages/core lexicons/aws lexicons/azure lexicons/docker lexicons/forgejo \
           lexicons/gcp lexicons/github lexicons/gitlab lexicons/helm lexicons/k8s; do
  (cd "$CHANT/$pkg" && npm pack --ignore-scripts --pack-destination "$CTX/vendor" >/dev/null)
done

echo "→ staging blacklight worker + e2e"
cp -r "$ROOT/src" "$ROOT/wrangler.toml" "$CTX/"
mkdir -p "$CTX/e2e"; cp "$ROOT/e2e/check.mjs" "$CTX/e2e/"
# Drop the file: @intentius dev deps; the Dockerfile installs the vendored tarballs.
node -e '
  const p = require("'"$ROOT"'/package.json");
  for (const k of Object.keys(p.dependencies || {})) if (k.startsWith("@intentius")) delete p.dependencies[k];
  delete p.devDependencies;
  require("fs").writeFileSync("'"$CTX"'/package.json", JSON.stringify(p, null, 2));
'

echo "→ docker build"
docker build -q -t blacklight-e2e -f "$ROOT/e2e/Dockerfile" "$CTX"

echo "→ docker run"
docker run --rm blacklight-e2e
