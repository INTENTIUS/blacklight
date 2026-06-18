import { describe, test, expect } from "vitest";
import { bumpStats, readStats, type StatsStore } from "./stats";

function fakeStore(): StatsStore {
  const m = new Map<string, string>();
  return { get: async (k) => m.get(k) ?? null, put: async (k, v) => void m.set(k, v) };
}

describe("stats", () => {
  test("starts at zero", async () => {
    expect(await readStats(fakeStore())).toEqual({ audits: 0, findings: 0 });
  });

  test("accumulates audits and findings", async () => {
    const s = fakeStore();
    await bumpStats(s, 5);
    await bumpStats(s, 3);
    expect(await readStats(s)).toEqual({ audits: 2, findings: 8 });
  });

  test("treats a clean audit (0 findings) as an audit", async () => {
    const s = fakeStore();
    await bumpStats(s, 0);
    expect(await readStats(s)).toEqual({ audits: 1, findings: 0 });
  });

  test("never goes negative on a bad count", async () => {
    const s = fakeStore();
    await bumpStats(s, -10 as number);
    expect((await readStats(s)).findings).toBe(0);
  });
});
