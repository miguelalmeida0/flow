import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
import { selectMotionEvidenceDirectory } from "./scripts/motion-evidence-scope.mjs";

const origin = "http://127.0.0.1:5176";
const macChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const executablePath = process.env.FLOW_CHROME_EXECUTABLE ?? (existsSync(macChrome) ? macChrome : undefined);
const compositorCdpPort = process.env.FLOW_MOTION_CDP_PORT ?? "9223";
const motionEvidence = selectMotionEvidenceDirectory();
process.env.FLOW_MOTION_EVIDENCE_DIR = motionEvidence.relativePath;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /visual-reward-(motion|performance)\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: [
    ["line"],
    ["html", { outputFolder: `${motionEvidence.relativePath}/playwright-report`, open: "never" }],
    ["json", { outputFile: `${motionEvidence.relativePath}/playwright-results.json` }],
  ],
  outputDir: `${motionEvidence.relativePath}/playwright-results`,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: origin,
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
    trace: "on",
    screenshot: "only-on-failure",
    // Video capture changes compositor scheduling and would contaminate the
    // rAF/long-task stress audit. The portfolio test creates its own recorded
    // context; measurement tests remain traceable without recording overhead.
    video: "off",
  },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 5176 --strictPort",
    url: origin,
    reuseExistingServer: false,
  },
  projects: [
    {
      name: "visual-reward-performance",
      testMatch: /visual-reward-performance\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], trace: "off" },
    },
    {
      name: "visual-reward-chromium",
      testMatch: /visual-reward-motion\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        trace: "on",
        launchOptions: {
          ...(executablePath ? { executablePath } : {}),
          args: [`--remote-debugging-port=${compositorCdpPort}`],
        },
      },
    },
  ],
});
