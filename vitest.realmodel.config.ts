import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Tier B (real local-model) verification config — the two files this
 * targets are deliberately excluded from the default `vite.config.ts` test
 * run (see its comment) since they spawn a real companion subprocess and
 * call the real Ollama runtime. Run with:
 *   npx vitest run --config vitest.realmodel.config.ts
 * or `npm run test:real-model`.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    env: { TZ: "Europe/Berlin" },
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
    include: ["src/kernel/llm/realModel.e2e.test.ts", "src/kernel/llm/acceptanceCorpus.realModel.test.ts"],
    testTimeout: 60_000,
    environmentOptions: { jsdom: { url: "http://localhost/" } },
  },
});
