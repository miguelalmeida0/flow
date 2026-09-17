import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { fillCommandField } from "./tide-helpers";

const evidenceDir = "artifacts/voice-intelligence/browser";
const errors = new WeakMap<Page, { console: string[]; page: string[]; requests: string[] }>();
const results = { typedMilestone: false, contextualCommitment: false, injectedFinalJournal: false, physicalMicrophone: "NOT_PERFORMED" };

async function installVoiceSeams(page: Page) {
  await page.addInitScript(() => {
    class Recorder {
      static isTypeSupported() { return true; }
      state: "inactive" | "recording" | "paused" = "inactive";
      mimeType = "audio/webm";
      ondataavailable: ((event: BlobEvent) => void) | null = null;
      onstop: (() => void) | null = null;
      start() { this.state = "recording"; }
      pause() { this.state = "paused"; }
      resume() { this.state = "recording"; }
      requestData() { this.ondataavailable?.(new BlobEvent("dataavailable", { data: new Blob(["voice-intelligence"], { type: this.mimeType }) })); }
      stop() { this.state = "inactive"; queueMicrotask(() => this.onstop?.()); }
    }
    class Recognition {
      generation = 0;
      continuous = false;
      interimResults = false;
      maxAlternatives = 1;
      lang = "";
      phrases: unknown[] = [];
      onstart: (() => void) | null = null;
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        const runtime = window as Window & { __voiceIntelligenceRecognition?: Recognition; __voiceIntelligenceRecognitionGeneration?: number };
        this.generation = (runtime.__voiceIntelligenceRecognitionGeneration ?? 0) + 1;
        runtime.__voiceIntelligenceRecognitionGeneration = this.generation;
        runtime.__voiceIntelligenceRecognition = this;
        this.onstart?.();
      }
      stop() { this.onend?.(); }
      abort() { this.onend?.(); }
      emitFinal(transcript: string) {
        const result = Object.assign({ 0: { transcript, confidence: 0.94 } }, { isFinal: true, length: 1 });
        this.onresult?.({ results: [result] });
        this.onend?.();
      }
    }
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } });
    (window as unknown as { MediaRecorder: typeof Recorder }).MediaRecorder = Recorder;
    (window as Window & { SpeechRecognition?: typeof Recognition }).SpeechRecognition = Recognition;
  });
}

async function fresh(page: Page, path = "/") {
  const session = await page.context().newCDPSession(page);
  try { await session.send("Storage.clearDataForOrigin", { origin: "http://127.0.0.1:5173", storageTypes: "all" }); }
  finally { await session.detach(); }
  await page.goto(path);
}

async function command(page: Page, transcript: string) {
  const field = await fillCommandField(page, transcript);
  await field.press("Enter");
  await expect(page.getByLabel("Global Flow command")).toHaveAttribute("data-last-transcript", transcript);
}

async function speak(page: Page, transcript: string) {
  await expect.poll(() => page.evaluate(() => {
    const runtime = window as Window & {
      __voiceIntelligenceRecognition?: { generation: number };
      __voiceIntelligenceConsumedGeneration?: number;
    };
    return (runtime.__voiceIntelligenceRecognition?.generation ?? 0) > (runtime.__voiceIntelligenceConsumedGeneration ?? 0);
  })).toBe(true);
  await page.evaluate((value) => {
    const runtime = window as Window & {
      __voiceIntelligenceRecognition?: { generation: number; emitFinal(transcript: string): void };
      __voiceIntelligenceConsumedGeneration?: number;
    };
    const recognition = runtime.__voiceIntelligenceRecognition;
    if (!recognition) throw new Error("A fresh recognition generation was not available");
    runtime.__voiceIntelligenceConsumedGeneration = recognition.generation;
    recognition.emitFinal(value);
  }, transcript);
  await expect(page.getByLabel("Global Flow command")).toHaveAttribute("data-last-transcript", transcript);
}

async function snapshot(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!));
}

test.beforeAll(() => {
  mkdirSync(evidenceDir, { recursive: true });
  for (const entry of readdirSync(evidenceDir)) {
    if (entry.startsWith("failure-")) rmSync(`${evidenceDir}/${entry}`, { force: true });
  }
});
test.beforeEach(async ({ page }) => {
  const found = { console: [] as string[], page: [] as string[], requests: [] as string[] };
  errors.set(page, found);
  page.on("console", (message) => { if (message.type() === "error") found.console.push(message.text()); });
  page.on("pageerror", (error) => found.page.push(error.message));
  page.on("requestfailed", (request) => {
    if (request.url().startsWith("http://127.0.0.1:5173") && ["document", "script", "stylesheet", "fetch", "xhr"].includes(request.resourceType())) found.requests.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText ?? "unknown"}`);
  });
  await installVoiceSeams(page);
});
test.afterEach(async ({ page }, testInfo) => {
  const found = errors.get(page)!;
  if (testInfo.status !== testInfo.expectedStatus) {
    const slug = testInfo.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    const diagnostic = await page.evaluate(() => {
      const command = document.querySelector<HTMLElement>("[aria-label='Global Flow command']");
      const trace = (window as Window & { __FLOW_COMMAND_TRACE__?: {
        transcript: string; normalizedInput: string; candidates: unknown[]; contextUsed: unknown; intent: unknown; actions: unknown[];
      } }).__FLOW_COMMAND_TRACE__;
      return {
        route: window.location.pathname,
        transcript: trace?.transcript ?? command?.getAttribute("data-last-transcript") ?? "",
        normalizedText: trace?.normalizedInput ?? "",
        candidates: trace?.candidates ?? [],
        context: trace?.contextUsed ?? null,
        selectedIntent: trace?.intent ?? null,
        plannedActions: trace?.actions ?? [],
      };
    }).catch((error: unknown) => ({
      route: "UNAVAILABLE_BEFORE_PAGE",
      transcript: "",
      normalizedText: "",
      candidates: [],
      context: null,
      selectedIntent: null,
      plannedActions: [],
      collectionError: error instanceof Error ? error.message : String(error),
    }));
    writeFileSync(`${evidenceDir}/failure-${slug}.json`, `${JSON.stringify({ ...diagnostic, browserErrors: found }, null, 2)}\n`);
    await page.screenshot({ path: `${evidenceDir}/failure-${slug}.png`, fullPage: true }).catch(() => undefined);
  }
  expect(found.console).toEqual([]);
  expect(found.page).toEqual([]);
  expect(found.requests).toEqual([]);
});
test.afterAll(() => writeFileSync(`${evidenceDir}/results.json`, `${JSON.stringify(results, null, 2)}\n`));

test("typed destination plus temporal range uses the real global command field", async ({ page }) => {
  await fresh(page);
  await command(page, "open my calendar for the whole week");
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByTestId("calendar-space")).toBeVisible();
  const state = await snapshot(page);
  expect(state.temporal.scope).toMatchObject({ kind: "week", dateKey: expect.any(String), endDateKey: expect.any(String) });
  results.typedMilestone = true;
  await page.screenshot({ path: `${evidenceDir}/01-calendar-whole-week.png`, fullPage: true });
});

test("commitment clarification preserves its partial intent and commits once", async ({ page }) => {
  await fresh(page);
  await command(page, "Open commitments");
  await command(page, "add Miguel");
  await expect(page.getByText("What are you committing to Miguel?")).toBeVisible();
  expect((await snapshot(page)).past).toHaveLength(0);
  await command(page, "send the proposal Friday");
  const state = await snapshot(page);
  expect(state.document.people).toContainEqual(expect.objectContaining({ name: "Miguel" }));
  expect(state.document.commitments).toContainEqual(expect.objectContaining({ title: "Send the proposal", direction: "i-owe" }));
  expect(state.past).toHaveLength(1);
  results.contextualCommitment = true;
  await page.screenshot({ path: `${evidenceDir}/02-contextual-commitment.png`, fullPage: true });
});

test("final recognition transcripts obey Journal command, dictation, and interruption modes", async ({ page }) => {
  await fresh(page);
  await page.getByRole("button", { name: "Start Flow Live" }).click();
  await speak(page, "Open my journal");
  await speak(page, "New entry");
  await speak(page, "Start with my voice");
  await speak(page, "The street was quiet after the rain");
  await speak(page, "Bookmark that");
  await speak(page, "Stop recording");
  // Exact transcript acknowledgement precedes asynchronous durable audio
  // finalization. Observe the same persisted contract, not a one-shot snapshot
  // during the explicit finalizing phase; failed media still cannot pass.
  await expect.poll(async () => (await snapshot(page)).document.studio.journalEntries).toContainEqual(expect.objectContaining({
    text: expect.stringContaining("The street was quiet after the rain"),
    recordingState: "idle",
    bookmarks: [expect.any(Object)],
  }));
  await expect(page.getByLabel("Journal recording controls")).toHaveAttribute("data-media-state", "persisted");
  const state = await snapshot(page);
  expect(state.document.captures).toHaveLength(0);
  await expect(page.getByRole("textbox", { name: "Tell Flow what to change" })).toHaveValue("Stop recording");
  results.injectedFinalJournal = true;
  await page.screenshot({ path: `${evidenceDir}/03-journal-final-transcript.png`, fullPage: true });
});
