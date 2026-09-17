import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const evidenceDir = "artifacts/elite-product-rescue";
const browserConsoleErrors: string[] = [];
const pageErrors: string[] = [];
const failedRequests: string[] = [];
const transcripts: string[] = [];
let singleSessionJourney = "FAIL";

async function installRecognition(page: Page) {
  await page.addInitScript(() => {
    class Phrase { constructor(public phrase: string, public boost = 1) {} }
    class Recognition {
      continuous = false;
      interimResults = false;
      maxAlternatives = 1;
      lang = "";
      phrases: Phrase[] = [];
      onstart: (() => void) | null = null;
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      constructor() {
        const state = (window as Window & { __eliteVoice?: { constructions: number; starts: number; stops: number; instance?: Recognition } }).__eliteVoice
          ?? { constructions: 0, starts: 0, stops: 0 };
        state.constructions += 1;
        state.instance = this;
        (window as Window & { __eliteVoice?: typeof state }).__eliteVoice = state;
      }
      start() {
        const state = (window as Window & { __eliteVoice?: { starts: number } }).__eliteVoice!;
        state.starts += 1;
        this.onstart?.();
      }
      stop() {
        const state = (window as Window & { __eliteVoice?: { stops: number } }).__eliteVoice!;
        state.stops += 1;
        this.onend?.();
      }
      abort() { this.onend?.(); }
      final(transcript: string, alternatives: Array<{ transcript: string; confidence: number }> = []) {
        const candidates = [{ transcript, confidence: 1 }, ...alternatives];
        const result = Object.assign(Object.fromEntries(candidates.map((candidate, index) => [index, candidate])), { isFinal: true, length: candidates.length });
        this.onresult?.({ results: Object.assign({ 0: result }, { length: 1 }) });
      }
    }
    const target = window as Window & { SpeechRecognition?: typeof Recognition; SpeechRecognitionPhrase?: typeof Phrase };
    target.SpeechRecognition = Recognition;
    target.SpeechRecognitionPhrase = Phrase;
  });
}

async function speak(page: Page, transcript: string, final = false) {
  const starts = await page.evaluate(() => (window as Window & { __eliteVoice?: { starts: number } }).__eliteVoice?.starts ?? 0);
  await page.evaluate((value) => {
    const voice = (window as Window & { __eliteVoice?: { instance?: { final(text: string): void } } }).__eliteVoice;
    voice?.instance?.final(value);
  }, transcript);
  transcripts.push(transcript);
  await expect(page.getByLabel("Global Flow command")).toHaveAttribute("data-last-transcript", transcript);
  if (!final) await expect.poll(() => page.evaluate(() => (window as Window & { __eliteVoice?: { starts: number } }).__eliteVoice?.starts ?? 0), { timeout: 2_500 }).toBeGreaterThan(starts);
}

async function historyLength(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).past.length as number);
}

async function typeCommand(page: Page, transcript: string) {
  if (!await page.getByLabel("Tell Flow what to change").count()) await page.getByLabel("Open Flow command").click();
  const field = page.getByLabel("Tell Flow what to change");
  await field.fill(transcript);
  await field.press("Enter");
  await expect(page.getByLabel("Global Flow command")).toHaveAttribute("data-last-transcript", transcript);
}

test.beforeAll(() => mkdirSync(evidenceDir, { recursive: true }));
test.beforeEach(async ({ page }) => {
  browserConsoleErrors.length = 0;
  pageErrors.length = 0;
  failedRequests.length = 0;
  transcripts.length = 0;
  page.on("console", (message) => { if (message.type() === "error") browserConsoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    if (request.url().startsWith("http://127.0.0.1:5173") && ["document", "script", "stylesheet", "fetch", "xhr"].includes(request.resourceType())) {
      failedRequests.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText ?? "unknown"}`);
    }
  });
  await page.route("https://api.open-meteo.com/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"daily":{"time":[]}}' }));
});

test.afterEach(() => {
  expect(browserConsoleErrors, "browser console errors").toEqual([]);
  expect(pageErrors, "uncaught page errors").toEqual([]);
  expect(failedRequests, "failed application requests").toEqual([]);
});

test.afterAll(() => writeFileSync(`${evidenceDir}/single-session-evidence.json`, `${JSON.stringify({
  verdict: singleSessionJourney,
  steps: transcripts.length,
  transcripts,
  browserConsoleErrors,
  pageErrors,
  failedRequests,
}, null, 2)}\n`));

test("event inspection, contextual follow-up, proposal refinement, and alternative safety use the real shell", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-04T10:32:00") });
  await installRecognition(page);
  await page.goto("/");
  await page.evaluate(() => {
    const snapshot = JSON.parse(localStorage.getItem("flow.life.v3")!);
    snapshot.document.people.push({ id: "person-sarah", kind: "person", name: "Sarah", createdAt: "2026-09-04T09:00:00.000Z", updatedAt: "2026-09-04T09:00:00.000Z" });
    snapshot.document.commitments.push({ id: "commitment-sarah", kind: "commitment", personId: "person-sarah", title: "Send the proposal", direction: "i-owe", status: "open", createdAt: "2026-09-04T09:00:00.000Z", updatedAt: "2026-09-04T09:00:00.000Z" });
    localStorage.setItem("flow.life.v3", JSON.stringify(snapshot));
  });
  await page.reload();

  await typeCommand(page, "Show the meeting at two");
  await expect(page.getByTestId("calendar-space")).toBeVisible();
  await expect(page.locator('[data-event-id="roadmap"]')).toHaveAttribute("aria-pressed", "true");
  await typeCommand(page, "Open the two PM meeting");
  await expect(page.getByLabel("Global Flow command")).toContainText("Selected for your next command");
  expect(await historyLength(page)).toBe(0);

  await page.getByLabel("Start Flow Live").click();
  await expect(page.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "listening");
  await page.evaluate(() => {
    const voice = (window as Window & { __eliteVoice?: { instance?: { final(text: string, alternatives: Array<{ transcript: string; confidence: number }>): void } } }).__eliteVoice;
    voice?.instance?.final("Open focus aria", [{ transcript: "Move deep work to four", confidence: 0.2 }]);
  });
  await expect.poll(() => historyLength(page)).toBe(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).document.calendar.events.find(({ id }: { id: string }) => id === "deep-work")?.start)).toBe(16 * 60);
  await expect(page.getByTestId("focus-space")).toHaveCount(0);

  await typeCommand(page, "Show Sarah");
  await typeCommand(page, "What do I owe her?");
  await expect(page.getByLabel("Global Flow command")).toContainText("Sarah: Send the proposal");
  await expect(page.getByLabel("Global Flow command")).not.toContainText("calendar action");
  await typeCommand(page, "Give me four hours");
  await expect(page.getByLabel("Global Flow command")).toContainText("You asked for 240 minutes. You have");
  await typeCommand(page, "Actually make it 15.");
  await expect(page.getByLabel("Global Flow command")).toContainText("15 minutes ready");
  expect(await historyLength(page)).toBe(1);
  await typeCommand(page, "Do it");
  await expect.poll(() => historyLength(page)).toBe(2);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).document.focus.active?.durationMinutes)).toBe(15);
});

test("exact 24-step product rescue journey uses one persistent global voice session", async ({ page }) => {
  test.setTimeout(90_000);
  await page.clock.install({ time: new Date("2026-09-04T09:32:00") });
  await installRecognition(page);
  const session = await page.context().newCDPSession(page);
  try { await session.send("Storage.clearDataForOrigin", { origin: "http://127.0.0.1:5173", storageTypes: "local_storage" }); }
  finally { await session.detach(); }
  await page.goto("/");
  await expect(page.getByTestId("home-space")).toBeVisible();

  // Sarah and the Tomorrow meeting are ordinary fixture entities. The router
  // and scheduler receive no title, time, or identifier special cases.
  await page.evaluate(() => {
    const snapshot = JSON.parse(localStorage.getItem("flow.life.v3")!);
    const tomorrow = "2026-09-05";
    snapshot.document.people.push({ id: "person-sarah", kind: "person", name: "Sarah", createdAt: "2026-09-04T09:00:00.000Z", updatedAt: "2026-09-04T09:00:00.000Z" });
    snapshot.document.calendars[tomorrow].events = snapshot.document.calendars[tomorrow].events.filter(({ id }: { id: string }) => !id.startsWith("creative-review-"));
    snapshot.document.calendars[tomorrow].events.push({
      id: "meeting-tomorrow-2pm", title: "Team meeting", dateKey: tomorrow,
      start: 840, end: 900, kind: "flexible", priority: "medium", color: "blue",
      importance: "normal", mobility: "flexible", protected: false, status: "planned", labels: [],
    });
    localStorage.setItem("flow.life.v3", JSON.stringify(snapshot));
  });
  await page.reload();
  await page.getByLabel("Start Flow Live").click();
  await expect(page.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "listening");

  await speak(page, "Open the focus area.");
  await expect(page.getByTestId("focus-space")).toBeVisible();
  await speak(page, "Go back home.");
  await expect(page.getByTestId("home-space")).toBeVisible();
  await speak(page, "Could you show me my calendar screen please?");
  await expect(page.getByTestId("calendar-space")).toBeVisible();
  await speak(page, "Go to the weather and outfit section.");
  await expect(page.getByTestId("weather-outfit-space")).toBeVisible();
  await speak(page, "What should I wear tomorrow?");
  await expect(page.getByTestId("weather-outfit-space")).toContainText(/tomorrow|Saturday|weather data/i);
  await speak(page, "Home.");
  await expect(page.getByTestId("home-space")).toContainText(/Saturday, September 5/i);
  await speak(page, "Open my capture page.");
  await expect(page.getByTestId("inbox-space")).toBeVisible();

  await speak(page, "Capture renew passport before Senegal.");
  await expect.poll(() => historyLength(page)).toBe(1);
  await expect(page.getByRole("button", { name: "Renew passport before Senegal" })).toHaveCount(1);
  await speak(page, "Take me to outcomes.");
  await expect(page.getByTestId("plans-space")).toBeVisible();
  await speak(page, "Turn the passport item into an outcome.");
  await expect.poll(() => historyLength(page)).toBe(2);
  await expect(page.getByText("Renew passport before Senegal", { exact: true })).toHaveCount(1);
  await speak(page, "Show commitments.");
  await expect(page.getByTestId("people-space")).toBeVisible();
  expect(page.url()).toContain("/people?view=commitments");
  await speak(page, "I promised Maya the proposal by Friday.");
  await expect.poll(() => historyLength(page)).toBe(3);
  await expect(page.getByText("Proposal", { exact: true })).toHaveCount(1);
  await speak(page, "Open the calendar area.");
  await expect(page.getByTestId("calendar-space")).toBeVisible();
  await speak(page, "Move the two PM meeting to four.");
  await expect.poll(() => historyLength(page)).toBe(4);
  await expect(page.locator('[data-event-id="meeting-tomorrow-2pm"]')).toHaveAttribute("aria-label", /4 PM–5 PM/);
  await speak(page, "Make it red and important.");
  await expect.poll(() => historyLength(page)).toBe(5);
  await expect(page.locator('[data-event-id="meeting-tomorrow-2pm"]')).toHaveAttribute("data-color", "red");
  await expect(page.locator('[data-event-id="meeting-tomorrow-2pm"]')).toHaveAttribute("data-importance", "important");
  await speak(page, "Show Sarah.");
  await expect(page.getByTestId("people-space")).toBeVisible();
  await expect(page.locator('[data-life-entity-id="person-sarah"]')).toBeVisible();
  await speak(page, "Open the good to know area.");
  await expect(page.getByTestId("good-to-know-space")).toBeVisible();
  await speak(page, "What should I know?");
  await expect(page.getByLabel("Global Flow command")).not.toContainText("calendar action");
  await speak(page, "Give me forty minutes.");
  await expect(page.getByLabel("Global Flow command")).toContainText("You asked for 40 minutes. You have 28 clear.");
  await speak(page, "Do it.");
  await expect.poll(() => historyLength(page)).toBe(6);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).document.focus.active?.durationMinutes)).toBe(28);
  await speak(page, "Undo.");
  await expect.poll(() => historyLength(page)).toBe(5);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).document.focus.active)).toBeUndefined();
  await speak(page, "Redo.");
  await expect.poll(() => historyLength(page)).toBe(6);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).document.focus.active?.durationMinutes)).toBe(28);
  await speak(page, "Go back home.");
  await expect(page.getByTestId("home-space")).toBeVisible();
  await speak(page, "Pause listening.", true);
  await expect(page.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "sleeping");

  expect(transcripts).toHaveLength(24);
  const result = await page.evaluate(() => {
    const snapshot = JSON.parse(localStorage.getItem("flow.life.v3")!);
    const voice = (window as Window & { __eliteVoice?: { constructions: number; starts: number; stops: number } }).__eliteVoice!;
    return {
      voice,
      history: snapshot.past.length,
      captures: snapshot.document.captures,
      outcomes: snapshot.document.plans,
      commitments: snapshot.document.commitments,
      moved: snapshot.document.calendars["2026-09-05"].events.find(({ id }: { id: string }) => id === "meeting-tomorrow-2pm"),
      temporal: snapshot.temporal.scope,
    };
  });
  expect(result.voice.constructions).toBe(1);
  expect(result.voice.starts).toBeGreaterThanOrEqual(24);
  expect(result.history).toBe(6);
  expect(result.captures.filter(({ title }: { title: string }) => /open|show|home|calendar|focus|weather|outcomes|commitments/i.test(title))).toEqual([]);
  expect(result.captures).toHaveLength(1);
  expect(result.outcomes).toHaveLength(1);
  expect(result.commitments).toHaveLength(1);
  expect(result.moved).toMatchObject({ start: 960, end: 1020, color: "red", importance: "important" });
  expect(result.temporal).toMatchObject({ kind: "day", dateKey: "2026-09-05" });
  singleSessionJourney = "PASS";
});
