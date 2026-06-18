/**
 * GitHub's API rejects requests with no User-Agent (403), and workerd's fetch
 * sends none by default — so every live audit 403s unless we set one. Identify
 * the service to GitHub as a good citizen (they ask clients to), and let chant's
 * own headers win if they ever set a UA themselves.
 */
const UA = "blacklight-audit (+https://blacklight.intentius.workers.dev)";

export const uaFetch: typeof fetch = (input, init = {}) => {
  const headers = new Headers(init.headers);
  if (!headers.has("user-agent")) headers.set("user-agent", UA);
  return fetch(input, { ...init, headers });
};
