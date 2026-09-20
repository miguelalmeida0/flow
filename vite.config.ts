import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    watch: {
      ignored: ["**/artifacts/**", "**/playwright-report/**", "**/test-results/**"],
    },
  },
  test: {
    // Test fixtures use Berlin civil time; never a production timezone default.
    env: { TZ: "Europe/Berlin" },
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
    include: ["src/**/*.test.{ts,tsx}"],
    // Tier B (real local-model) verification files spawn a real companion
    // subprocess and call the real Ollama runtime — genuinely useful, but
    // they don't belong in the default fast/deterministic suite (`npm test`
    // / `npm run check`): they're slow (network + inference latency), and
    // on a machine without Ollama running they'd otherwise add noisy
    // skipped-test output to every run. Excluded from discovery here;
    // run them explicitly (see each file's own header comment for the
    // exact command) or via `npm run test:real-model`.
    exclude: [
      "**/node_modules/**", "**/dist/**", "**/cypress/**", "**/.{idea,git,cache,output,temp}/**",
      "**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*",
      "src/kernel/llm/realModel.e2e.test.ts", "src/kernel/llm/acceptanceCorpus.realModel.test.ts",
    ],
    environmentOptions: { jsdom: { url: "http://localhost/" } },
  },
});
