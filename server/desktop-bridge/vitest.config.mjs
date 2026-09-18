// Scoped Vitest config for the desktop-bridge server tests.
//
// The repo root `vite.config.ts` restricts `test.include` to
// `src/**/*.test.{ts,tsx}` (a jsdom app-test config), so plain
// `npx vitest run server/desktop-bridge` against the ROOT config finds no
// test files. Rather than touch vite.config.ts (out of scope for this
// change), this file gives the server directory its own minimal Node-env
// Vitest config. Run with:
//
//   npx vitest run --config server/desktop-bridge/vitest.config.mjs
//
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["server/desktop-bridge/**/*.test.mjs"],
    css: false,
  },
});
