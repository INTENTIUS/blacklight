/**
 * Rate limiting (#357). Fixed-window counters in KV — per-IP (minute + day) plus
 * a global per-minute breaker that sheds load with 429 before the shared git
 * token or the container is exhausted. KV get+put isn't atomic, so a burst can
 * slip a few over the line; that's fine for abuse control (a Durable Object is
 * the upgrade if exact limits are ever needed).
 */

/** Minimal KV surface — real `KVNamespace` satisfies it; tests pass a fake. */
export interface RateStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

export interface Limits {
  perIpMinute: number;
  perIpDay: number;
  globalMinute: number;
}

export const DEFAULT_LIMITS: Limits = { perIpMinute: 5, perIpDay: 100, globalMinute: 60 };

export interface LimitResult {
  ok: boolean;
  /** Which budget was exceeded (for logging by reason, no PII). */
  reason?: "ip-minute" | "ip-day" | "global-minute";
  retryAfterSec?: number;
}

async function bump(store: RateStore, key: string, ttlSec: number): Promise<number> {
  const n = Number((await store.get(key)) ?? "0") + 1;
  await store.put(key, String(n), { expirationTtl: ttlSec });
  return n;
}

/**
 * Check (and increment) all windows for this request. `now` is injectable for
 * deterministic tests. Returns the first budget exceeded; on a miss, nothing is
 * over-counted beyond the natural window.
 */
export async function checkLimits(store: RateStore, ip: string, now: number, limits: Limits = DEFAULT_LIMITS): Promise<LimitResult> {
  const minute = Math.floor(now / 60_000);
  const day = Math.floor(now / 86_400_000);
  const secsToNextMinute = 60 - Math.floor((now % 60_000) / 1000);

  const ipMin = await bump(store, `rl:ip:${ip}:m:${minute}`, 120);
  if (ipMin > limits.perIpMinute) return { ok: false, reason: "ip-minute", retryAfterSec: secsToNextMinute };

  const ipDay = await bump(store, `rl:ip:${ip}:d:${day}`, 172_800);
  if (ipDay > limits.perIpDay) return { ok: false, reason: "ip-day", retryAfterSec: 3600 };

  const glob = await bump(store, `rl:global:m:${minute}`, 120);
  if (glob > limits.globalMinute) return { ok: false, reason: "global-minute", retryAfterSec: secsToNextMinute };

  return { ok: true };
}
