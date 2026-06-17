import { describe, test, expect } from "vitest";
import { checkLimits, type RateStore, type Limits } from "./limit";

function fakeStore(): RateStore {
  const m = new Map<string, string>();
  return {
    get: async (k) => m.get(k) ?? null,
    put: async (k, v) => void m.set(k, v),
  };
}

const LIMITS: Limits = { perIpMinute: 2, perIpDay: 5, globalMinute: 100 };
const t0 = 1_700_000_000_000; // fixed "now"

describe("checkLimits", () => {
  test("allows up to the per-IP minute budget, then 429s", async () => {
    const s = fakeStore();
    expect((await checkLimits(s, "1.1.1.1", t0, LIMITS)).ok).toBe(true);
    expect((await checkLimits(s, "1.1.1.1", t0, LIMITS)).ok).toBe(true);
    const third = await checkLimits(s, "1.1.1.1", t0, LIMITS);
    expect(third.ok).toBe(false);
    expect(third.reason).toBe("ip-minute");
    expect(third.retryAfterSec).toBeGreaterThan(0);
  });

  test("the minute window resets", async () => {
    const s = fakeStore();
    await checkLimits(s, "2.2.2.2", t0, LIMITS);
    await checkLimits(s, "2.2.2.2", t0, LIMITS);
    expect((await checkLimits(s, "2.2.2.2", t0, LIMITS)).ok).toBe(false);
    // next minute
    expect((await checkLimits(s, "2.2.2.2", t0 + 60_000, LIMITS)).ok).toBe(true);
  });

  test("a different IP has its own budget", async () => {
    const s = fakeStore();
    await checkLimits(s, "3.3.3.3", t0, LIMITS);
    await checkLimits(s, "3.3.3.3", t0, LIMITS);
    expect((await checkLimits(s, "4.4.4.4", t0, LIMITS)).ok).toBe(true);
  });

  test("the global per-minute breaker sheds load across IPs", async () => {
    const s = fakeStore();
    const tight: Limits = { perIpMinute: 100, perIpDay: 1000, globalMinute: 3 };
    expect((await checkLimits(s, "a", t0, tight)).ok).toBe(true);
    expect((await checkLimits(s, "b", t0, tight)).ok).toBe(true);
    expect((await checkLimits(s, "c", t0, tight)).ok).toBe(true);
    const shed = await checkLimits(s, "d", t0, tight);
    expect(shed.ok).toBe(false);
    expect(shed.reason).toBe("global-minute");
  });

  test("the per-day budget caps sustained use", async () => {
    const s = fakeStore();
    const daily: Limits = { perIpMinute: 100, perIpDay: 3, globalMinute: 1000 };
    // spread across minutes so the minute window never trips
    for (let i = 0; i < 3; i++) expect((await checkLimits(s, "z", t0 + i * 60_000, daily)).ok).toBe(true);
    const over = await checkLimits(s, "z", t0 + 3 * 60_000, daily);
    expect(over.ok).toBe(false);
    expect(over.reason).toBe("ip-day");
  });
});
