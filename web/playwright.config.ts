import { defineConfig } from "@playwright/test";

/**
 * Browser E2E: drive the real SPA in headless Chromium against the worker in
 * fixture mode (offline, deterministic). Playwright boots both servers — the
 * worker (workerd, fixture) and the Vite dev server (which proxies /audit to it).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  use: { baseURL: "http://localhost:5173", headless: true },
  webServer: [
    {
      command: "npx wrangler dev --var BLACKLIGHT_FIXTURE:1 --port 8787 --local",
      cwd: "..",
      url: "http://localhost:8787/",
      reuseExistingServer: true,
      timeout: 90_000,
    },
    {
      command: "npm run dev -- --port 5173 --strictPort",
      url: "http://localhost:5173",
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
