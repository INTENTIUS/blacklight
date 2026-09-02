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
  // Standalone fountain manifest. Since chant 0.54 core routes fountain
  // natively (the 0.44-era pin — "audited as k8s" — surfaced exactly as its
  // comment predicted): the document is parsed back into the entity graph and
  // the FTN rules fire on audit. The credential-shaped env var makes FTN012
  // fire, so the e2e can positively pin the native route.
  "agents/env.yaml": "apiVersion: fountain.dev/v1\nkind: Environment\nmetadata:\n  name: dev\nspec:\n  image: ubuntu:24.04\n  env_vars:\n    AWS_SECRET_ACCESS_KEY: not-a-real-key\n",
  // nginx config (chant 0.54, NGX* — #1979): directory listing on, so the
  // hosted path proves the lexicon-independent nginx family fires end to end.
  "nginx/default.conf": "server {\n  listen 80;\n  location /files {\n    autoindex on;\n  }\n}\n",
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
