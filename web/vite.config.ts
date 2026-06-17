import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [preact()],
  // Dev: proxy the audit API to the local worker (wrangler dev on :8787).
  server: { proxy: { "/audit": "http://localhost:8787" } },
});
