/**
 * Exact in-flight concurrency cap (#4) — the Durable Object upgrade the rate
 * limiter's doc block promised. KV windows bound *rate* (audits per minute);
 * this bounds *concurrency* (audits running right now), so a burst that fits
 * the per-minute budgets still can't pile N simultaneous tree-walks onto the
 * shared git token. One DO instance (`idFromName("global")`) is the single
 * point of truth; the worker acquires a slot before auditing and releases it
 * after, and treats the gate as advisory — if the DO errors or the binding is
 * absent, the audit proceeds (defense-in-depth, not a single point of failure;
 * the KV breaker still stands).
 */

/** Concurrent audits allowed before shedding with 429. Tune here. */
export const MAX_IN_FLIGHT = 6;

/**
 * A slot held longer than this is presumed leaked (the worker died between
 * acquire and release) and is reclaimed. Generously above the worst honest
 * audit: the fetch layer caps each request at 10s and the whole walk is
 * bounded, so a two-minute-old slot is not a running audit.
 */
export const STALE_MS = 120_000;

/**
 * The slot ledger, pure and clock-injected so it unit-tests without a DO
 * runtime. In-memory only: a Durable Object is single-threaded, so this is
 * exact while the object lives, and an eviction resets to "all slots free" —
 * the harmless direction.
 */
export class ConcurrencySlots {
  private readonly held = new Map<string, number>();
  private seq = 0;

  constructor(
    private readonly maxInFlight: number = MAX_IN_FLIGHT,
    private readonly staleMs: number = STALE_MS,
  ) {}

  /** Reclaim slots whose holder never released (crashed worker). */
  private sweep(now: number): void {
    for (const [token, at] of this.held) {
      if (now - at > this.staleMs) this.held.delete(token);
    }
  }

  /** A slot token when one is free, `null` when the cap is reached. */
  acquire(now: number): string | null {
    this.sweep(now);
    if (this.held.size >= this.maxInFlight) return null;
    const token = `s${++this.seq}`;
    this.held.set(token, now);
    return token;
  }

  /** Idempotent — releasing an unknown or already-released token is a no-op. */
  release(token: string): void {
    this.held.delete(token);
  }

  get inFlight(): number {
    return this.held.size;
  }
}

/**
 * The Durable Object wrapper: POST /acquire → `{ token }` (200) or 429 when
 * full; POST /release `{ token }` → 200. Anything else 404. State is the
 * in-memory ledger above — no storage API, nothing persisted.
 */
export class ConcurrencyGate {
  private readonly slots = new ConcurrencySlots();

  async fetch(req: Request): Promise<Response> {
    const path = new URL(req.url).pathname;
    if (req.method === "POST" && path === "/acquire") {
      const token = this.slots.acquire(Date.now());
      if (token === null) {
        return new Response(JSON.stringify({ error: "At capacity" }), { status: 429 });
      }
      return new Response(JSON.stringify({ token }), { status: 200 });
    }
    if (req.method === "POST" && path === "/release") {
      const body = (await req.json().catch(() => ({}))) as { token?: string };
      if (body.token) this.slots.release(body.token);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response(null, { status: 404 });
  }
}
