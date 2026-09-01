import { describe, test, expect } from "vitest";
import { ConcurrencySlots, ConcurrencyGate, MAX_IN_FLIGHT, STALE_MS } from "./gate";

describe("ConcurrencySlots (#4)", () => {
  test("hands out slots up to the cap, then refuses", () => {
    const slots = new ConcurrencySlots(2);
    const a = slots.acquire(0);
    const b = slots.acquire(0);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a).not.toBe(b);
    expect(slots.acquire(0)).toBeNull();
    expect(slots.inFlight).toBe(2);
  });

  test("release frees a slot for the next acquire", () => {
    const slots = new ConcurrencySlots(1);
    const a = slots.acquire(0)!;
    expect(slots.acquire(0)).toBeNull();
    slots.release(a);
    expect(slots.acquire(0)).not.toBeNull();
  });

  test("release is idempotent and ignores unknown tokens", () => {
    const slots = new ConcurrencySlots(1);
    const a = slots.acquire(0)!;
    slots.release(a);
    slots.release(a);
    slots.release("never-issued");
    expect(slots.inFlight).toBe(0);
  });

  test("a leaked slot (worker died before releasing) is reclaimed after STALE_MS", () => {
    const slots = new ConcurrencySlots(1, 1000);
    slots.acquire(0);
    // Still held inside the window…
    expect(slots.acquire(500)).toBeNull();
    // …reclaimed past it, so the gate never wedges shut.
    expect(slots.acquire(1501)).not.toBeNull();
  });

  test("defaults are the documented knobs", () => {
    expect(MAX_IN_FLIGHT).toBeGreaterThan(0);
    expect(STALE_MS).toBeGreaterThan(60_000);
  });
});

describe("ConcurrencyGate DO surface", () => {
  const acquire = (gate: ConcurrencyGate) => gate.fetch(new Request("https://gate/acquire", { method: "POST" }));
  const release = (gate: ConcurrencyGate, token: string) =>
    gate.fetch(new Request("https://gate/release", { method: "POST", body: JSON.stringify({ token }) }));

  test("acquire returns a token; at capacity it sheds with 429; release reopens", async () => {
    const gate = new ConcurrencyGate();
    const tokens: string[] = [];
    for (let i = 0; i < MAX_IN_FLIGHT; i++) {
      const res = await acquire(gate);
      expect(res.status).toBe(200);
      tokens.push(((await res.json()) as { token: string }).token);
    }
    expect((await acquire(gate)).status).toBe(429);

    expect((await release(gate, tokens[0])).status).toBe(200);
    expect((await acquire(gate)).status).toBe(200);
  });

  test("release with a garbage body is a tolerated no-op", async () => {
    const gate = new ConcurrencyGate();
    const res = await gate.fetch(new Request("https://gate/release", { method: "POST", body: "not json" }));
    expect(res.status).toBe(200);
  });

  test("unknown routes 404", async () => {
    const gate = new ConcurrencyGate();
    expect((await gate.fetch(new Request("https://gate/acquire", { method: "GET" }))).status).toBe(404);
    expect((await gate.fetch(new Request("https://gate/other", { method: "POST" }))).status).toBe(404);
  });
});
