/**
 * Cloudflare Turnstile verification (#357) — the bot/abuse gate. The frontend
 * solves a challenge and sends the token; we verify it server-side before
 * running any audit. Only enforced when TURNSTILE_SECRET is configured, so local
 * dev / fixture runs stay open.
 */
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(
  secret: string,
  token: string | undefined,
  ip: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!token) return false; // no token => fail closed
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  if (ip) body.append("remoteip", ip);
  try {
    const res = await fetchImpl(SITEVERIFY, { method: "POST", body });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false; // network/parse failure => fail closed
  }
}
