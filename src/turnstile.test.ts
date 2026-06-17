import { describe, test, expect } from "vitest";
import { verifyTurnstile } from "./turnstile";

const ok = (success: boolean) =>
  (async () => new Response(JSON.stringify({ success }), { status: 200 })) as unknown as typeof fetch;

describe("verifyTurnstile", () => {
  test("fails closed when no token is supplied (no network call)", async () => {
    let called = false;
    const spy = (async () => {
      called = true;
      return new Response("{}");
    }) as unknown as typeof fetch;
    expect(await verifyTurnstile("secret", undefined, "1.1.1.1", spy)).toBe(false);
    expect(called).toBe(false);
  });

  test("passes when siteverify reports success", async () => {
    expect(await verifyTurnstile("secret", "tok", "1.1.1.1", ok(true))).toBe(true);
  });

  test("fails when siteverify reports failure", async () => {
    expect(await verifyTurnstile("secret", "tok", "1.1.1.1", ok(false))).toBe(false);
  });

  test("fails closed on a network error", async () => {
    const boom = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    expect(await verifyTurnstile("secret", "tok", undefined, boom)).toBe(false);
  });
});
