import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

const releaseQa = process.env.FLOW_RELEASE_QA === "1";
const appOrigin = "http://127.0.0.1:5173";
const macChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const executablePath = process.env.FLOW_CHROME_EXECUTABLE ?? (existsSync(macChrome) ? macChrome : undefined);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: !releaseQa,
  workers: releaseQa ? 1 : undefined,
  retries: 0,
  reporter: releaseQa
    ? [
        ["line"],
        ["html", { outputFolder: "artifacts/release-qa/playwright-report", open: "never" }],
        ["json", { outputFile: "artifacts/release-qa/playwright-results.json" }],
      ]
    : "list",
  outputDir: releaseQa ? "artifacts/release-qa/playwright-results" : "test-results",
  use: {
    baseURL: appOrigin,
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: releaseQa
      ? "npm run preview -- --host 127.0.0.1 --port 5173 --strictPort"
      : "npm run dev -- --host 127.0.0.1 --port 5173 --strictPort",
    url: appOrigin,
    reuseExistingServer: !releaseQa,
  },
  projects: [
    {
      // Performance evidence must start in a fresh Chromium process. Running
      // it after 41 functional journeys measures accumulated runner/trace GC,
      // not Flow's transition. Thresholds and the 20 real cycles stay intact.
      name: "chromium-motion",
      testMatch: /motion-stress\.spec\.ts/,
      testIgnore: /visual-reward-(motion|performance)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium",
      testIgnore: [/motion-stress\.spec\.ts/, /dev-strictmode\.spec\.ts/, /visual-reward-(motion|performance)\.spec\.ts/],
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
