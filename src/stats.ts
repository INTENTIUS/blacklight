/**
 * Anonymous aggregate stats (#3) — total audits + total findings surfaced. KV
 * only; **never** a repo URL, the findings themselves, or anything identifying.
 * Best-effort (non-atomic, like the rate limiter) — a counter, not an accountant.
 */

/** Minimal KV surface — real `KVNamespace` satisfies it; tests pass a fake. */
export interface StatsStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

export interface Stats {
  audits: number;
  findings: number;
}

async function read(store: StatsStore, key: string): Promise<number> {
  return Number((await store.get(key)) ?? "0") || 0;
}

/** Record one completed audit and the number of findings it surfaced. */
export async function bumpStats(store: StatsStore, findings: number): Promise<void> {
  const audits = (await read(store, "audits")) + 1;
  const total = (await read(store, "findings")) + Math.max(0, findings | 0);
  await store.put("audits", String(audits));
  await store.put("findings", String(total));
}

export async function readStats(store: StatsStore): Promise<Stats> {
  return { audits: await read(store, "audits"), findings: await read(store, "findings") };
}
