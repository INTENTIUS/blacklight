import { defineConfig } from "vitest/config";
// Worker unit tests (limit/turnstile/ssrf). The SPA has its own suite under web/.
export default defineConfig({ test: { include: ["src/**/*.test.ts"] } });
