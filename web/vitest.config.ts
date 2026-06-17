import { defineConfig } from "vitest/config";

// Unit/render tests only — Playwright specs (e2e/*.spec.ts) run via `npm run e2e:browser`.
export default defineConfig({
  test: { include: ["src/**/*.test.{ts,tsx}"] },
});
