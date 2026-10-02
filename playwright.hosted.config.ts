import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
const macChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export default defineConfig({
  testDir: "./e2e", testMatch: /hosted-release\.spec\.ts/,
  retries: 0, workers: 1, forbidOnly: true, timeout: 30_000,
  use: { ...devices["Desktop Chrome"], baseURL: "https://127.0.0.1:5443", ignoreHTTPSErrors: true,
    permissions: ["microphone"], trace: "retain-on-failure", screenshot: "only-on-failure",
    launchOptions: { ...(existsSync(macChrome) ? { executablePath: macChrome } : {}), args: ["--ignore-certificate-errors", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${resolve("artifacts/hosted-release/https-fixture/microphone.wav")}`] },
  },
  webServer: { command: "node scripts/hosted-browser-fixture.mjs", url: "https://127.0.0.1:5443/api/health", ignoreHTTPSErrors: true, reuseExistingServer: false },
  projects: [{ name: "hosted-chromium" }],
});
