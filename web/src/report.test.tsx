import { describe, test, expect } from "vitest";
import { renderToString } from "preact-render-to-string";
import { ReportView } from "./report";
import { App } from "./app";
import { SAMPLE } from "./sample";

describe("ReportView (tier-first)", () => {
  const html = renderToString(<ReportView report={SAMPLE} />);

  test("leads with quick wins and shows the fix diff", () => {
    expect(html).toContain("Quick wins");
    expect(html).toContain("GHA033");
    // the diff body is rendered
    expect(html).toContain("permissions: write-all");
    expect(html).toContain("contents: read");
  });

  test("surfaces the authority citation", () => {
    expect(html).toContain("OSSF Scorecard — Token-Permissions");
  });

  test("has needs-review and report-only sections", () => {
    expect(html).toContain("Needs review");
    expect(html).toContain("GHA036");
    expect(html).toContain("Report-only");
    expect(html).toContain("WK8101");
  });

  test("headline tallies by category", () => {
    expect(html).toContain("2 security");
    expect(html).toContain("1 correctness");
    expect(html).toContain("best-practice");
  });

  test("links findings back to the rule reference", () => {
    expect(html).toContain("audit-rules/#gha033");
  });

  test("shows tier counts and download buttons", () => {
    expect(html).toContain("quick wins");
    expect(html).toContain("report-only");
    expect(html).toContain("Markdown");
    expect(html).toContain("JSON");
  });

  test("report-only tier is open so every finding is visible", () => {
    // the <details> for report-only carries `open`
    expect(html).toMatch(/<details[^>]*\bopen\b[^>]*>[\s\S]*Report-only/);
  });
});

describe("App", () => {
  test("idle state shows the input, trust strip, and samples", () => {
    const html = renderToString(<App />);
    expect(html).toContain("blacklight");
    expect(html).toContain("we never store your code");
    expect(html).toContain("actions/checkout");
  });

  test("footer credits chant audit with a link to the docs", () => {
    const html = renderToString(<App />);
    expect(html).toContain("powered by");
    expect(html).toContain("intentius.io/chant/cli/audit");
  });
});
