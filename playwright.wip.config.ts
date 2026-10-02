import { defineConfig } from "@playwright/test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const remote = process.env.FLOW_WIP_URL;
const credentials = remote
  ? JSON.parse(readFileSync(process.env.FLOW_WIP_CREDENTIAL_FILE!, "utf8")) as { username: string; password: string }
  : { username: "fixture", password: "local-preview-test-only" };
const sha = process.env.FLOW_WIP_EXPECTED_SHA ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const evidence = process.env.FLOW_WIP_EVIDENCE_DIR ?? "artifacts/wip-preview/browser-local";

export default defineConfig({
  testDir: "./server/wip-preview",
  testMatch: "browser.spec.mjs",
  workers: 1,
  retries: 0,
  timeout: 60000,
  reporter: [["line"], ["json", { outputFile: `${evidence}/report.json` }]],
  outputDir: `${evidence}/results`,
  use: {
    baseURL: remote ?? "http://127.0.0.1:5458",
    httpCredentials: credentials,
    viewport: { width: 1440, height: 1000 },
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : {},
    // Authentication is held only by the browser context, never in trace archives.
    trace: "off",
    screenshot: "only-on-failure",
  },
  metadata: { expectedCommit: sha },
  ...(remote ? {} : { webServer: {
    command: "node server/wip-preview/index.mjs",
    url: "http://127.0.0.1:5458/healthz",
    reuseExistingServer: false,
    env: { PORT: "5458", FLOW_PREVIEW_COMMIT: sha, FLOW_PREVIEW_AUTH_SHA256: createHash("sha256").update(`${credentials.username}:${credentials.password}`).digest("hex") },
  } }),
});
