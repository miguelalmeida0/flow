import { defineConfig } from "vitest/config";

/**
 * Server-side (Node, not jsdom) test config for server/desktop-bridge —
 * these test the companion HTTP service directly (createServer, capability
 * validation, allowlists, audit trail) and don't need a browser environment.
 * Kept out of the default `src/**` jsdom suite (vite.config.ts) rather than
 * mixed in, so this stays a fast, deterministic, always-on part of `npm run
 * check`-style regression runs instead of an orphaned file nothing invokes.
 * Run with: npm run test:server
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["server/**/*.test.mjs"],
  },
});
