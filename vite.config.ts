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
    environmentOptions: { jsdom: { url: "http://localhost/" } },
  },
});
