import { describe, test, expect, vi, afterEach } from "vitest";
import { uaFetch } from "./ua-fetch";

afterEach(() => vi.unstubAllGlobals());

function capture() {
  const seen: { url: string; ua: string | null }[] = [];
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    seen.push({ url: String(input), ua: headers.get("user-agent") });
    return Promise.resolve(new Response("ok"));
  });
  return seen;
}

describe("uaFetch", () => {
  test("adds a User-Agent when none is set", async () => {
    const seen = capture();
    await uaFetch("https://api.github.com/repos/a/b");
    expect(seen[0].ua).toMatch(/blacklight/);
  });

  test("preserves caller headers (e.g. Authorization)", async () => {
    const seen = capture();
    await uaFetch("https://api.github.com/repos/a/b", { headers: { Authorization: "Bearer x" } });
    expect(seen[0].ua).toMatch(/blacklight/);
  });

  test("does not override a UA the caller already set", async () => {
    const seen = capture();
    await uaFetch("https://api.github.com/repos/a/b", { headers: { "user-agent": "custom" } });
    expect(seen[0].ua).toBe("custom");
  });
});
