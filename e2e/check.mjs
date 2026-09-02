/**
 * E2E assertion: drive the running worker (fixture mode) and verify the full
 * audit pipeline produced a correct, renderable report. No network — the worker
 * serves the baked fixture. Exits non-zero on any failed expectation.
 */
const base = process.env.BASE ?? "http://localhost:8787";

function assert(cond, msg) {
  if (!cond) {
    console.error("✘ " + msg);
    process.exit(1);
  }
  console.log("✓ " + msg);
}

// #19: every deploy path carries the SPA (wrangler.toml [build]/[assets]), so
// the worker must serve it at / — a JSON body here means assets were dropped.
const home = await fetch(`${base}/`);
assert(home.ok, `GET / returned ${home.status}`);
const homeBody = await home.text();
assert(homeBody.includes("<!doctype html>") || homeBody.includes("<div id=\"app\">"), "GET / serves the SPA, not a bare worker");

const res = await fetch(`${base}/audit`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ url: "https://github.com/demo/fixture" }),
});
assert(res.ok, `POST /audit returned ${res.status}`);
const r = await res.json();

assert(r.counts.total > 0, `produced findings (${r.counts.total})`);
assert(r.counts.security > 0, `found security issues (${r.counts.security})`);

const filesAudited = [
  ...r.quickWins.map((q) => q.file),
  ...r.reportOnly.map((f) => f.file),
  ...r.needsReview.flatMap((c) => c.rules.flatMap((x) => x.findings.map((f) => f.file))),
];
assert(filesAudited.some((f) => f.includes(".github/workflows")), "audited a GitHub workflow");
assert(filesAudited.some((f) => f.endsWith("deploy.yaml")), "audited a k8s manifest");
assert(filesAudited.some((f) => f === "Dockerfile"), "audited a Dockerfile");
// Since chant 0.54 core routes fountain natively: the standalone
// fountain.dev/v1 manifest is parsed back into the entity graph and the FTN
// rules fire on audit — the fixture's credential-shaped env var trips FTN012.
assert(filesAudited.some((f) => f === "agents/env.yaml"), "audited a standalone fountain manifest (native route since chant 0.54)");
// The lexicon-independent nginx family (chant 0.54, #1979) runs on the
// hosted path — the fixture's nginx/default.conf enables directory listing.
assert(filesAudited.some((f) => f === "nginx/default.conf"), "audited an nginx config (NGX*)");

const diff = r.quickWins.find((q) => q.diff)?.diff ?? "";
assert(diff.includes("contents: read"), "quick-win diff carries a real fix");

console.log("\nE2E PASS — full audit pipeline ran end-to-end on the worker.");
