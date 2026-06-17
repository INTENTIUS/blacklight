import type { Report } from "./types";

/** A representative report for tests and offline UI work. */
export const SAMPLE: Report = {
  target: "https://github.com/acme/widgets",
  scanned: 7,
  counts: {
    total: 4,
    quickWin: 1,
    needsReview: 1,
    reportOnly: 2,
    errors: 1,
    warnings: 2,
    infos: 1,
    security: 2,
    correctness: 1,
    bestPractice: 1,
  },
  quickWins: [
    {
      file: ".github/workflows/ci.yml",
      diff: "@@ -1,3 +1,4 @@\n on: push\n-permissions: write-all\n+permissions:\n+  contents: read\n jobs:",
      addressed: [
        {
          id: "GHA033",
          title: "Blanket write-all permissions",
          category: "security",
          tier: "merge-worthy",
          fixKind: "deterministic",
          remediation: "Replace write-all with the scopes the jobs need.",
          authority: [{ name: "OSSF Scorecard — Token-Permissions", url: "https://github.com/ossf/scorecard" }],
        },
      ],
      needsInput: [],
    },
  ],
  needsReview: [
    {
      name: "Untrusted input",
      url: "https://example.com/injection",
      rules: [
        {
          meta: {
            id: "GHA036",
            title: "Untrusted input interpolated into run:",
            category: "security",
            tier: "merge-worthy",
            fixKind: "guidance",
            remediation: "Pass untrusted values via env and reference \"$VAR\".",
            authority: [{ name: "GitHub — script injections", url: "https://docs.github.com" }],
          },
          findings: [
            { checkId: "GHA036", severity: "error", message: "uses github.event.issue.title", file: ".github/workflows/ci.yml", lexicon: "github", meta: { id: "GHA036", title: "Untrusted input interpolated into run:", category: "security", tier: "merge-worthy", fixKind: "guidance", remediation: "" } },
          ],
        },
      ],
    },
  ],
  reportOnly: [
    { checkId: "GHA022", severity: "info", message: "no timeout-minutes", file: ".github/workflows/ci.yml", lexicon: "github", meta: { id: "GHA022", title: "Job without timeout-minutes", category: "best-practice", tier: "report-only", fixKind: "guidance", remediation: "Add timeout-minutes." } },
    { checkId: "WK8101", severity: "warning", message: "selector mismatch", file: "k8s/deploy.yaml", lexicon: "k8s", meta: { id: "WK8101", title: "Deployment selector does not match template labels", category: "correctness", tier: "report-only", fixKind: "guidance", remediation: "Align selector and labels." } },
  ],
};
