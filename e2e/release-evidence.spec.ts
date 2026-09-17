import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { eventById, expectValid, fresh, readEvents, submitSuccess } from "./tide-helpers";

const evidenceDir = "artifacts/tide-release";
const consoleErrors: string[] = [];
const pageErrors: string[] = [];
const failedRequests: string[] = [];
const screenshots = [
  "01-initial-breathing-day.png", "02-important-red-event.png", "03-breathing-room.png",
  "04-tide-reflow.png", "05-split-events.png", "06-what-if.png", "07-undo.png",
  "08-mobile.png", "09-reduced-motion.png",
].map((name) => `${evidenceDir}/${name}`);

test.beforeAll(() => mkdirSync(evidenceDir, { recursive: true }));
test.beforeEach(async ({ page }) => {
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    if (request.url().startsWith("http://127.0.0.1:5173") && ["document", "script", "stylesheet", "fetch", "xhr"].includes(request.resourceType())) {
      failedRequests.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText ?? "unknown failure"}`);
    }
  });
});
test.afterEach(() => {
  expect(consoleErrors, "browser console errors").toEqual([]);
  expect(pageErrors, "uncaught page errors").toEqual([]);
  expect(failedRequests, "failed application requests").toEqual([]);
});
test.afterAll(() => {
  writeFileSync(`${evidenceDir}/browser-evidence.json`, `${JSON.stringify({ browserConsoleErrors: consoleErrors, pageErrors, failedRequests, screenshots }, null, 2)}\n`);
});

test("preserves the complete natural typed-command release journey", async ({ page }) => {
  await fresh(page);
  await submitSuccess(page, "Move my workout to 6");
  let events = await readEvents(page);
  expectValid(events, 8);
  expect(eventById(events, "workout").start).toBe(18 * 60);
  expect(eventById(events, "lunch").protected).toBe(true);
  expect(eventById(events, "interview").mobility).toBe("anchored");

  await fresh(page);
  await submitSuccess(page, "Move deep work before lunch");
  expect(eventById(await readEvents(page), "deep-work").start).toBe(10 * 60);

  await fresh(page);
  await submitSuccess(page, "Make email 20 minutes");
  events = await readEvents(page);
  expect(eventById(events, "email").end - eventById(events, "email").start).toBe(20);

  await fresh(page);
  const before = await readEvents(page);
  await submitSuccess(page, "Move flexible work after 2, protect lunch, and fit 40 minutes of exercise before dinner");
  events = await readEvents(page);
  expectValid(events, 9);
  before.forEach((event) => expect(eventById(events, event.id)).toBeDefined());
  expect(eventById(events, "lunch").protected).toBe(true);
  await page.getByRole("button", { name: "Undo last change" }).click();
  await expect.poll(() => readEvents(page)).toEqual(before);
  await page.getByRole("button", { name: "Redo last change" }).click();
  await expect.poll(async () => (await readEvents(page)).length).toBe(9);
  expectValid(await readEvents(page), 9);
  await page.reload();
  expectValid(await readEvents(page), 9);
});

test("routes a final browser-recognition transcript through the identical pipeline", async ({ page }) => {
  await page.addInitScript(() => {
    class ReleasePhrase { constructor(public phrase: string, public boost = 1) {} }
    class ReleaseRecognition {
      continuous = false;
      interimResults = false;
      maxAlternatives = 1;
      lang = "";
      phrases: ReleasePhrase[] = [];
      onstart: (() => void) | null = null;
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() { (window as Window & { __flowReleaseRecognition?: ReleaseRecognition }).__flowReleaseRecognition = this; this.onstart?.(); }
      stop() { this.onend?.(); }
      abort() { this.onend?.(); }
      emitFinal(alternatives: { transcript: string; confidence: number }[]) {
        const result = Object.assign({}, alternatives, { isFinal: true, length: alternatives.length });
        this.onresult?.({ results: [result] });
        this.onend?.();
      }
    }
    const browserWindow = window as Window & { SpeechRecognition?: typeof ReleaseRecognition; SpeechRecognitionPhrase?: typeof ReleasePhrase };
    browserWindow.SpeechRecognitionPhrase = ReleasePhrase;
    browserWindow.SpeechRecognition = ReleaseRecognition;
  });
  await fresh(page);
  await page.getByRole("button", { name: "Start Flow Live" }).click();
  await expect(page.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "listening");
  await expect.poll(() => page.evaluate(() => Boolean((window as Window & { __flowReleaseRecognition?: unknown }).__flowReleaseRecognition))).toBe(true);
  const configuration = await page.evaluate(() => {
    const recognition = (window as Window & { __flowReleaseRecognition?: { lang: string; maxAlternatives: number; interimResults: boolean; continuous: boolean; phrases: { phrase: string }[] } }).__flowReleaseRecognition;
    if (!recognition) throw new Error("Recognition adapter did not start");
    return { lang: recognition.lang, maxAlternatives: recognition.maxAlternatives, interimResults: recognition.interimResults, continuous: recognition.continuous, phrases: recognition.phrases.map((item) => item.phrase) };
  });
  expect(configuration).toMatchObject({ lang: "en-US", maxAlternatives: 5, interimResults: true, continuous: true });
  expect(configuration.phrases).toEqual(expect.arrayContaining(["important", "Breathing Room", "Planning — Q3 roadmap"]));

  const transcript = "Make the 2 PM meeting important and red, give me 20 minutes before it, and move anything flexible out of the way";
  await page.evaluate((value) => {
    const recognition = (window as Window & { __flowReleaseRecognition?: { emitFinal(items: { transcript: string; confidence: number }[]): void } }).__flowReleaseRecognition;
    if (!recognition) throw new Error("Recognition adapter was lost");
    recognition.emitFinal([{ transcript: "make meeting read", confidence: 0.93 }, { transcript: value, confidence: 0.48 }]);
  }, transcript);
  await expect(page.getByRole("textbox", { name: "Tell Flow what to change" })).toHaveValue(transcript);
  await expect(page.getByText("Day reshaped")).toBeVisible({ timeout: 3_000 });
  const roadmap = eventById(await readEvents(page), "roadmap");
  expect(roadmap).toMatchObject({ color: "red", importance: "important" });
  await expect(page.getByLabel("Breathing room, 20 minutes")).toBeVisible();
});
