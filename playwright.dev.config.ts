import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
import {
  selectDevelopmentEvidenceLocations,
  selectMotionEvidenceDirectory,
} from "./scripts/motion-evidence-scope.mjs";

const port = Number(process.env.FLOW_DEV_E2E_PORT ?? "5174");
const appOrigin = `http://127.0.0.1:${port}`;
const macChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const executablePath = process.env.FLOW_CHROME_EXECUTABLE ?? (existsSync(macChrome) ? macChrome : undefined);
const motionEvidence = selectMotionEvidenceDirectory();
const developmentEvidence = selectDevelopmentEvidenceLocations(motionEvidence);
process.env.FLOW_MOTION_EVIDENCE_DIR = motionEvidence.relativePath;
process.env.FLOW_DEV_BROWSER_EVIDENCE_DIR = developmentEvidence.browserEvidenceDirectory;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /dev-strictmode\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ["line"],
    ["html", { outputFolder: developmentEvidence.reportDirectory, open: "never" }],
    ["json", { outputFile: developmentEvidence.resultsFile }],
  ],
  outputDir: developmentEvidence.outputDirectory,
  use: {
    baseURL: appOrigin,
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: appOrigin,
    reuseExistingServer: false,
  },
  projects: [{ name: "chromium-dev-strictmode", use: { ...devices["Desktop Chrome"] } }],
});
