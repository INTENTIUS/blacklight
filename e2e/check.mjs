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

const diff = r.quickWins.find((q) => q.diff)?.diff ?? "";
assert(diff.includes("contents: read"), "quick-win diff carries a real fix");

console.log("\nE2E PASS — full audit pipeline ran end-to-end on the worker.");
