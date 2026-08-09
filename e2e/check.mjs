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
// chant 0.44 has no fountain content route in classifyFiles: a standalone
// fountain.dev/v1 manifest matches the k8s detector and is audited under k8s.
// This pins that behavior; it changes when core routes fountain natively.
assert(filesAudited.some((f) => f === "agents/env.yaml"), "scanned a standalone fountain manifest (as k8s at chant 0.44)");

const diff = r.quickWins.find((q) => q.diff)?.diff ?? "";
assert(diff.includes("contents: read"), "quick-win diff carries a real fix");

console.log("\nE2E PASS — full audit pipeline ran end-to-end on the worker.");
