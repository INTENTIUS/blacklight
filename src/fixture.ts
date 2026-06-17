/**
 * Test-only: a baked multi-lexicon repo + a `fetchImpl` that serves it through
 * the GitHub tree+contents API shape. Enabled only when BLACKLIGHT_FIXTURE=1, so
 * the E2E runs fully offline (no network, no token) against the real engine.
 * The SSRF allowlist still applies — the sentinel URL is a real github.com URL;
 * this fetchImpl just intercepts it.
 */
export const FIXTURE_FILES: Record<string, string> = {
  ".github/workflows/ci.yml": "on: push\npermissions: write-all\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: echo ${{ github.event.issue.title }}\n",
  "k8s/deploy.yaml": "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\nspec:\n  template:\n    spec:\n      containers:\n        - name: c\n          image: nginx:latest\n          securityContext:\n            privileged: true\n",
  "Dockerfile": "FROM ubuntu\nRUN apt-get update\n",
  "cfn/template.json": '{"AWSTemplateFormatVersion":"2010-09-09","Resources":{"B":{"Type":"AWS::S3::Bucket"}}}\n',
};

/** A GitHub-shaped mock fetch over an in-memory file set. */
export function fixtureFetch(files: Record<string, string> = FIXTURE_FILES): typeof fetch {
  const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));
  return (async (input: string | URL | Request) => {
    const u = String(input);
    if (u.includes("/git/trees/")) {
      const tree = Object.keys(files).map((path) => ({ path, type: "blob", size: files[path].length }));
      return new Response(JSON.stringify({ tree }), { status: 200 });
    }
    const cm = u.match(/\/contents\/(.+?)\?/);
    if (cm) {
      const path = decodeURIComponent(cm[1]);
      if (files[path] === undefined) return new Response("not found", { status: 404 });
      return new Response(JSON.stringify({ path, type: "file", content: b64(files[path]), encoding: "base64" }), { status: 200 });
    }
    if (/\/repos\/[^/]+\/[^/]+(\?|$)/.test(u)) return new Response(JSON.stringify({ default_branch: "main" }), { status: 200 });
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
}
