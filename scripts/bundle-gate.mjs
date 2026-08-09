/**
 * Bundle-size gate (#20). The Worker bundles chant + ten lexicons and sits
 * around 1.9 MiB gzip of Cloudflare's 3 MiB cap; growth is monotonic, so the
 * first failure must be at review time, not deploy time. Run after
 * `wrangler deploy --dry-run --outdir dist`.
 *
 *   node scripts/bundle-gate.mjs [path-to-bundle]   (default dist/handler.js)
 *
 * Exits 1 above the fail line; prints a GitHub warning above the watchline.
 */
import { readFileSync } from "fs";
import { gzipSync } from "zlib";

const FAIL_MIB = 2.6;
const WARN_MIB = 2.3;

const path = process.argv[2] ?? "dist/handler.js";
const gz = gzipSync(readFileSync(path)).length;
const mib = gz / (1 << 20);

console.log(
  `worker bundle: ${mib.toFixed(2)} MiB gzip (${gz} bytes) — warn > ${WARN_MIB}, fail > ${FAIL_MIB}, Cloudflare cap 3 MiB`,
);

if (mib > FAIL_MIB) {
  console.error(`::error::worker bundle ${mib.toFixed(2)} MiB gzip exceeds the ${FAIL_MIB} MiB gate — trim it before Cloudflare's 3 MiB cap rejects the deploy`);
  process.exit(1);
}
if (mib > WARN_MIB) {
  console.warn(`::warning::worker bundle ${mib.toFixed(2)} MiB gzip is past the ${WARN_MIB} MiB watchline — headroom to the ${FAIL_MIB} MiB gate is shrinking`);
}
