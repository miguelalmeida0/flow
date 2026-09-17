import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const evidenceDir = process.env.FLOW_DEV_BROWSER_EVIDENCE_DIR
  ?? "artifacts/visual-reward-debug/unscoped-development/browser-evidence";
const consoleErrors: string[] = [];
const pageErrors: string[] = [];
const failedRequests: string[] = [];
let strictModeAcquisitionPassed = false;

function watchPage(page: Page) {
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    if (request.url().startsWith("http://127.0.0.1:5174") && ["document", "script", "stylesheet", "fetch", "xhr"].includes(request.resourceType())) {
      failedRequests.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText ?? "unknown"}`);
    }
  });
}

async function installRecognition(page: Page) {
  await page.addInitScript(() => {
    class Recognition {
      continuous = false;
      interimResults = false;
      maxAlternatives = 1;
      lang = "";
      phrases: unknown[] = [];
      onstart: (() => void) | null = null;
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;

      constructor() {
        const runtime = window as Window & { __strictVoiceConstructions?: number };
        runtime.__strictVoiceConstructions = (runtime.__strictVoiceConstructions ?? 0) + 1;
      }

      start() {
        const runtime = window as Window & { __strictRecognition?: Recognition; __strictVoiceStarts?: number };
        runtime.__strictRecognition = this;
        runtime.__strictVoiceStarts = (runtime.__strictVoiceStarts ?? 0) + 1;
        this.onstart?.();
      }

      stop() { this.onend?.(); }
      abort() { this.onend?.(); }

      emit(value: string) {
        const result = Object.assign({ 0: { transcript: value, confidence: 0.99 } }, { isFinal: true, length: 1 });
        this.onresult?.({ results: [result] });
      }
    }
    (window as Window & { SpeechRecognition?: typeof Recognition }).SpeechRecognition = Recognition;
  });
}

test.beforeAll(() => mkdirSync(evidenceDir, { recursive: true }));
test.beforeEach(async ({ page }) => { watchPage(page); await installRecognition(page); });
test.afterEach(() => { expect(consoleErrors).toEqual([]); expect(pageErrors).toEqual([]); expect(failedRequests).toEqual([]); });
test.afterAll(() => writeFileSync(`${evidenceDir}/dev-browser-evidence.json`, `${JSON.stringify({
  browserConsoleErrors: consoleErrors,
  pageErrors,
  failedRequests,
  strictModeAcquisition: strictModeAcquisitionPassed ? "PASS" : "FAIL",
  runtime: "Vite development server with React StrictMode enabled",
}, null, 2)}\n`));

test("a single development tab acquires Flow Live after the StrictMode effect probe", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await expect(page.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "sleeping");
  await page.getByLabel("Start Flow Live").click();
  await expect(page.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "listening");
  expect(await page.evaluate(() => ({
    constructions: (window as Window & { __strictVoiceConstructions?: number }).__strictVoiceConstructions ?? 0,
    starts: (window as Window & { __strictVoiceStarts?: number }).__strictVoiceStarts ?? 0,
  }))).toEqual({ constructions: 1, starts: 1 });

  await page.evaluate(() => {
    (window as Window & { __strictRecognition?: { emit(value: string): void } }).__strictRecognition?.emit("Capture StrictMode voice works");
  });
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("flow.life.v3")!);
    return {
      captures: state.document.captures.filter(({ title }: { title: string }) => title === "StrictMode voice works").length,
      history: state.past.length,
    };
  })).toEqual({ captures: 1, history: 1 });

  await expect(page.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "listening");
  await page.screenshot({ path: `${evidenceDir}/10-dev-strictmode-listening.png`, fullPage: true, caret: "hide" });
  await page.getByLabel("Stop Flow Live").click();
  await expect(page.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "sleeping");
  strictModeAcquisitionPassed = true;
});
