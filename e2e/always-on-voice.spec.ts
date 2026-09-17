import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { fillCommandField } from "./tide-helpers";

const evidenceDir = "artifacts/always-on-voice-release";
const consoleErrors: string[] = []; const pageErrors: string[] = []; const failedRequests: string[] = [];
let acquisitionRecoveryPassed = false;
let crossTabAcquisitionPassed = false;
let crossTabDocumentIntegrityPassed = false;
let crossTabDelayedReleasePassed = false;
let staleClientReclaimPassed = false;
let appleJourneyPassed = false;

function watchPage(page: Page) {
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    if (request.url().startsWith("http://127.0.0.1:5173") && ["document", "script", "stylesheet", "fetch", "xhr"].includes(request.resourceType())) {
      failedRequests.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText ?? "unknown"}`);
    }
  });
}

async function installFakeRecognition(page: Page) {
  await page.addInitScript(() => {
    const lockKey = "flow.voice.fake-native-owner";
    const tabKey = "flow.voice.fake-tab-id";
    const tabId = sessionStorage.getItem(tabKey) ?? crypto.randomUUID();
    sessionStorage.setItem(tabKey, tabId);
    window.addEventListener("pagehide", () => {
      if (localStorage.getItem(lockKey) !== tabId) return;
      const delay = (window as Window & { __flowPageHideNativeReleaseDelayMs?: number }).__flowPageHideNativeReleaseDelayMs ?? 0;
      if (delay > 0) localStorage.setItem(`${lockKey}.release-at`, String(Date.now() + delay));
      else localStorage.removeItem(lockKey);
    });
    class Recognition {
      continuous = false; interimResults = false; maxAlternatives = 1; lang = ""; phrases: unknown[] = [];
      onstart: (() => void) | null = null; onresult: ((event: unknown) => void) | null = null; onerror: ((event: unknown) => void) | null = null; onend: (() => void) | null = null;
      private ownsGlobalLock = false;
      constructor() { const runtime = window as Window & { __flowVoiceConstructions?: number }; runtime.__flowVoiceConstructions = (runtime.__flowVoiceConstructions ?? 0) + 1; }
      start() {
        const runtime = window as Window & { __flowRecognition?: Recognition; __flowVoiceReady?: boolean; __flowVoiceStarts?: number; __flowVoiceFailures?: string[]; __flowVoiceStartTimes?: number[]; __flowUseGlobalNativeLock?: boolean };
        runtime.__flowRecognition = this; runtime.__flowVoiceStarts = (runtime.__flowVoiceStarts ?? 0) + 1;
        (runtime.__flowVoiceStartTimes ??= []).push(Date.now());
        if (runtime.__flowUseGlobalNativeLock) {
          const releaseAt = Number(localStorage.getItem(`${lockKey}.release-at`) ?? 0);
          if (releaseAt > 0 && Date.now() >= releaseAt) {
            localStorage.removeItem(lockKey); localStorage.removeItem(`${lockKey}.release-at`);
          }
          const owner = localStorage.getItem(lockKey);
          if (owner && owner !== tabId) throw new DOMException("Recognition is already active", "InvalidStateError");
          localStorage.setItem(lockKey, tabId);
          this.ownsGlobalLock = true;
        }
        const failure = runtime.__flowVoiceFailures?.shift();
        if (failure) { runtime.__flowVoiceReady = false; queueMicrotask(() => this.onerror?.({ error: failure })); return; }
        runtime.__flowVoiceReady = true;
        this.onstart?.();
      }
      releaseGlobalLock() {
        if (this.ownsGlobalLock && localStorage.getItem(lockKey) === tabId) {
          localStorage.removeItem(lockKey); localStorage.removeItem(`${lockKey}.release-at`);
        }
        this.ownsGlobalLock = false;
      }
      stop() {
        (window as Window & { __flowVoiceReady?: boolean }).__flowVoiceReady = false;
        this.releaseGlobalLock();
        this.onend?.();
      }
      abort() {
        const runtime = window as Window & { __flowVoiceAborts?: number; __flowVoiceReady?: boolean; __flowVoiceReleaseDelayMs?: number; __flowVoiceReleaseRequestedAt?: number; __flowVoiceReleasedAt?: number };
        runtime.__flowVoiceReady = false;
        runtime.__flowVoiceAborts = (runtime.__flowVoiceAborts ?? 0) + 1;
        runtime.__flowVoiceReleaseRequestedAt = Date.now();
        const finish = () => { this.releaseGlobalLock(); runtime.__flowVoiceReleasedAt = Date.now(); this.onend?.(); };
        if ((runtime.__flowVoiceReleaseDelayMs ?? 0) > 0) window.setTimeout(finish, runtime.__flowVoiceReleaseDelayMs);
        else finish();
      }
      emit(value: string) { const result = Object.assign({ 0: { transcript: value, confidence: 0.9 } }, { isFinal: true, length: 1 }); this.onresult?.({ results: [result] }); }
    }
    (window as Window & { SpeechRecognition?: typeof Recognition }).SpeechRecognition = Recognition;
  });
}

async function fresh(page: Page) {
  const session = await page.context().newCDPSession(page);
  try { await session.send("Storage.clearDataForOrigin", { origin: "http://127.0.0.1:5173", storageTypes: "local_storage" }); }
  finally { await session.detach(); }
  await page.goto("/");
}

async function typeCommand(page: Page, transcript: string) {
  const input = await fillCommandField(page, transcript); await input.press("Enter");
  await expect(page.getByText(`“${transcript}”`).last()).toBeVisible();
}

async function speak(page: Page, transcript: string, expectRestart = true) {
  await expect(page.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "listening");
  await expect.poll(() => page.evaluate(() => Boolean((window as Window & { __flowVoiceReady?: boolean }).__flowVoiceReady))).toBe(true);
  const starts = await page.evaluate(() => (window as Window & { __flowVoiceStarts?: number }).__flowVoiceStarts ?? 0);
  await page.evaluate((value) => (window as Window & { __flowRecognition?: { emit(value: string): void } }).__flowRecognition!.emit(value), transcript);
  await expect(page.getByLabel("Global Flow command")).toHaveAttribute("data-last-transcript", transcript);
  if (expectRestart) {
    await expect.poll(() => page.evaluate(() => (window as Window & { __flowVoiceStarts?: number }).__flowVoiceStarts ?? 0)).toBeGreaterThan(starts);
    await expect.poll(() => page.evaluate(() => Boolean((window as Window & { __flowVoiceReady?: boolean }).__flowVoiceReady))).toBe(true);
  }
}

async function shot(page: Page, name: string) {
  // A screenshot is release evidence, not an arbitrary animation frame. Wait
  // until AnimatePresence has removed the outgoing projection so the named
  // space is the only document surface in the capture.
  await expect(page.locator("main > [data-space-shell]")).toHaveCount(1, { timeout: 2_500 });
  await expect(page.locator("[data-transition-clone-count]")).toHaveCount(0, { timeout: 2_500 });
  await page.waitForTimeout(180);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: `${evidenceDir}/${name}`, fullPage: true, caret: "hide" });
}

test.beforeAll(() => mkdirSync(evidenceDir, { recursive: true }));
test.beforeEach(async ({ page, context }) => {
  watchPage(page);
  await installFakeRecognition(page);
  // Context routing covers every tab created by the cross-tab ownership tests.
  // A page-only route left secondary tabs dependent on the public endpoint and
  // could turn an unrelated 503 into both console noise and a revision race.
  await context.route("https://api.open-meteo.com/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"daily":{"time":[]}}' }));
});
test.afterEach(() => { expect(consoleErrors).toEqual([]); expect(pageErrors).toEqual([]); expect(failedRequests).toEqual([]); });
test.afterAll(() => writeFileSync(`${evidenceDir}/browser-evidence.json`, `${JSON.stringify({
  browserConsoleErrors: consoleErrors,
  pageErrors,
  failedRequests,
  syntheticVoice: "PASS",
  acquisitionRecovery: acquisitionRecoveryPassed ? "PASS" : "FAIL",
  crossTabAcquisition: crossTabAcquisitionPassed ? "PASS" : "FAIL",
  crossTabDocumentIntegrity: crossTabDocumentIntegrityPassed ? "PASS" : "FAIL",
  crossTabDelayedRelease: crossTabDelayedReleasePassed ? "PASS" : "FAIL",
  staleClientReclaim: staleClientReclaimPassed ? "PASS" : "FAIL",
  appleJourney: appleJourneyPassed ? "PASS" : "FAIL",
}, null, 2)}\n`));

test("one persistent recognizer completes the exact Apple fourteen-command contract", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 1000 }); await fresh(page);
  await page.getByLabel("Start Flow Live").click();
  await expect(page.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "listening");

  await speak(page, "Home");
  await speak(page, "Book dinner at Pizzeria Roma tomorrow at eight");
  await speak(page, "Make it red and important");
  await speak(page, "I need to renew my passport before Senegal");
  await speak(page, "The first step is check the requirements");
  await speak(page, "Schedule it Thursday after work");
  await speak(page, "I promised Maya the proposal by Friday");
  await speak(page, "I am waiting for Daniel's contract confirmation");
  await speak(page, "What needs me now");
  await speak(page, "Move the two PM meeting to four");
  await speak(page, "Undo");
  await speak(page, "Redo");
  await speak(page, "Home");
  await speak(page, "Pause listening", false);

  await expect(page.getByTestId("home-space")).toBeVisible();
  await expect(page.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "sleeping");
  const result = await page.evaluate(() => {
    const snapshot = JSON.parse(localStorage.getItem("flow.life.v3")!);
    const allEvents = Object.values(snapshot.document.calendars).flatMap((plan: { events: Array<{ title: string }> }) => plan.events);
    const dinner = allEvents
      .find(({ title }: { title: string }) => title === "Dinner at Pizzeria Roma");
    const outcome = snapshot.document.plans.find(({ title }: { title: string }) => /passport/i.test(title));
    const outcomeSteps = snapshot.document.steps.filter(({ planId }: { planId: string }) => planId === outcome?.id);
    const stepLink = snapshot.document.links.find(({ type, fromId }: { type: string; fromId: string }) => type === "step-scheduled-as-event" && outcomeSteps.some(({ id }: { id: string }) => id === fromId));
    return {
      history: snapshot.past.length,
      captures: snapshot.document.captures.length,
      dinner,
      outcome,
      outcomeSteps,
      stepLink,
      commitments: snapshot.document.commitments,
      people: snapshot.document.people,
      roadmapStart: snapshot.document.calendar.events.find(({ id }: { id: string }) => id === "roadmap")?.start,
      constructions: (window as Window & { __flowVoiceConstructions?: number }).__flowVoiceConstructions,
    };
  });
  expect(result.history).toBe(8);
  expect(result.captures).toBe(0);
  expect(result.dinner).toMatchObject({ start: 20 * 60, end: 21 * 60, color: "red", importance: "important" });
  expect(result.outcome).toMatchObject({ targetCondition: "Before Senegal" });
  expect(result.outcomeSteps).toHaveLength(3);
  expect(result.outcomeSteps).toContainEqual(expect.objectContaining({ title: "Check the requirements", status: "scheduled" }));
  expect(result.stepLink).toBeTruthy();
  const people = Object.fromEntries(result.people.map(({ id, name }: { id: string; name: string }) => [id, name]));
  expect(result.commitments.map((item: { title: string; direction: string; personId: string }) => [item.title, item.direction, people[item.personId]])).toEqual(expect.arrayContaining([
    ["Proposal", "i-owe", "Maya"],
    ["Contract confirmation", "waiting-on", "Daniel"],
  ]));
  expect(result.roadmapStart).toBe(16 * 60);
  expect(result.constructions).toBe(1);
  await page.reload();
  await expect(page.getByTestId("home-space")).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).past.length)).toBe(8);
  appleJourneyPassed = true;
});

test("one Flow Live activation executes the complete contextual cross-space journey exactly once", async ({ page }) => {
  // Eighteen native recognition cycles and four durable screenshots exercise
  // real restart boundaries; the default 30 s budget is too small on release
  // runners even when every restart completes immediately.
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 1000 }); await fresh(page);
  // Honest fixture setup through the production command path: the passport
  // thought exists before the legacy contextual journey begins.
  await typeCommand(page, "Capture Renew passport before Senegal"); await typeCommand(page, "Home");
  await page.getByLabel("Start Flow Live").click();
  await expect(page.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "listening");

  await speak(page, "Calendar"); await expect(page.getByTestId("calendar-space")).toBeVisible();
  await speak(page, "Move the 2 PM meeting to 4");
  await speak(page, "Make it red"); await speak(page, "Make it important"); await speak(page, "Give me 20 minutes before it");
  await shot(page, "01-contextual-calendar.png");
  await speak(page, "Home"); await speak(page, "Inbox"); await expect(page.getByTestId("inbox-space")).toBeVisible();
  await speak(page, "Capture Buy coffee"); await shot(page, "02-explicit-inbox-capture.png");
  await speak(page, "Home"); await speak(page, "Plans");
  await speak(page, "Turn the passport item into a plan"); await expect(page.getByTestId("plan-detail")).toBeVisible({ timeout: 2_000 }); await shot(page, "03-passport-plan.png");
  await speak(page, "Home"); await speak(page, "People");
  await speak(page, "I promised Maya I’d send proposal by Friday"); await expect(page.getByTestId("people-space")).toBeVisible();
  await speak(page, "What fits right now"); await expect(page.getByTestId("home-space")).toBeVisible(); await expect(page.getByLabel("Global Flow command")).toContainText(/things fit|Keep this space free/); await shot(page, "04-now-from-shared-model.png");
  await speak(page, "Home"); await speak(page, "Undo"); await speak(page, "Redo");

  const state = await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!));
  const roadmap = state.document.calendar.events.find((event: { id: string }) => event.id === "roadmap");
  expect(roadmap).toMatchObject({ id: "roadmap", start: 16 * 60, color: "red", importance: "important" });
  expect(state.document.calendar.breathingRooms).toContainEqual(expect.objectContaining({ linkedEventId: "roadmap", relation: "before" }));
  expect(state.document.captures.filter((capture: { status: string }) => capture.status === "unresolved")).toEqual([expect.objectContaining({ title: "Buy coffee" })]);
  expect(state.document.plans).toEqual([expect.objectContaining({ title: "Renew passport before Senegal" })]);
  expect(state.document.people).toEqual([expect.objectContaining({ name: "Maya" })]);
  expect(state.document.commitments).toEqual([expect.objectContaining({ personId: state.document.people[0].id, title: "Send proposal" })]);
  const ids = [...state.document.calendar.events, ...state.document.calendar.deferred, ...(state.document.calendar.breathingRooms ?? []), ...state.document.captures, ...state.document.plans, ...state.document.steps, ...state.document.people, ...state.document.commitments, ...state.document.links].map(({ id }: { id: string }) => id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(await page.evaluate(() => (window as Window & { __flowVoiceConstructions?: number }).__flowVoiceConstructions)).toBe(1);
  expect(new Set(state.past.map((entry: { lastTransaction?: { id: string } }) => entry.lastTransaction?.id).filter(Boolean)).size).toBe(state.past.map((entry: { lastTransaction?: { id: string } }) => entry.lastTransaction?.id).filter(Boolean).length);

  const starts = await page.evaluate(() => (window as Window & { __flowVoiceStarts?: number }).__flowVoiceStarts ?? 0);
  await speak(page, "Pause", false);
  await expect(page.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "sleeping");
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as Window & { __flowVoiceStarts?: number }).__flowVoiceStarts ?? 0)).toBe(starts);
});

test("navigation never becomes Inbox data and shell geometry clears the persistent header", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await fresh(page);
  await page.getByLabel("Start Flow Live").click();
  for (const [command, testId] of [["Open the calendar", "calendar-space"], ["Open inbox", "inbox-space"], ["Open the plans container", "plans-space"], ["Show my calendar", "calendar-space"]] as const) {
    await speak(page, command); await expect(page.getByTestId(testId)).toBeVisible();
  }
  const result = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("flow.life.v3")!);
    const header = document.querySelector("header")!.getBoundingClientRect();
    const content = document.querySelector("main > div")!.getBoundingClientRect();
    return { captures: state.document.captures.length, past: state.past.length, headerBottom: header.bottom, contentTop: content.top };
  });
  expect(result).toMatchObject({ captures: 0, past: 0 }); expect(result.contentTop).toBeGreaterThanOrEqual(result.headerBottom);
  await speak(page, "Renew passport before Senegal");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).document.captures.length)).toBe(0);
});

test("a complete dated Calendar create wins over cross-space step syntax", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-03T09:00:00"));
  await page.setViewportSize({ width: 1440, height: 1000 }); await fresh(page);
  await typeCommand(page, "Calendar"); await expect(page.getByTestId("calendar-space")).toBeVisible();
  const transcript = "Schedule a 30 minute product meeting Friday at eight";
  await typeCommand(page, transcript);
  const result = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("flow.life.v3")!);
    const event = Object.values(state.document.calendars).flatMap((plan: { events: Array<{ title: string }> }) => plan.events)
      .find(({ title }: { title: string }) => title.toLowerCase() === "product meeting");
    return { event, captures: state.document.captures.length, steps: state.document.steps.length, history: state.past.length };
  });
  expect(result.event).toMatchObject({ dateKey: "2026-09-04", start: 480, end: 510 });
  expect(result).toMatchObject({ captures: 0, steps: 0, history: 1 });
  await expect(page.getByText(/can't find the .* step/i)).toHaveCount(0);
});

test("microphone acquisition failure exposes Retry and a fresh recognizer succeeds exactly once", async ({ page }) => {
  await page.addInitScript(() => { (window as Window & { __flowVoiceFailures?: string[] }).__flowVoiceFailures = ["audio-capture"]; });
  await page.setViewportSize({ width: 1440, height: 1000 }); await fresh(page);
  await page.getByLabel("Start Flow Live").click();
  await expect(page.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "microphone-unavailable");
  await expect(page.getByText(/Check the input device and macOS permission/)).toBeVisible();
  await expect(page.getByLabel("Retry Flow Live")).toBeVisible();
  await shot(page, "06-acquisition-failure.png");

  await page.getByLabel("Retry Flow Live").click();
  await expect(page.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "listening");
  expect(await page.evaluate(() => (window as Window & { __flowVoiceConstructions?: number }).__flowVoiceConstructions)).toBe(2);
  await page.evaluate(() => {
    const recognition = (window as Window & { __flowRecognition?: { emit(value: string): void } }).__flowRecognition!;
    recognition.emit("Capture Voice retry succeeded");
    recognition.emit("Capture Voice retry succeeded");
  });
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("flow.life.v3")!);
    return { captures: state.document.captures.filter(({ title }: { title: string }) => title === "Voice retry succeeded").length, history: state.past.length };
  })).toEqual({ captures: 1, history: 1 });
  await expect.poll(() => page.evaluate(() => (window as Window & { __flowVoiceStarts?: number }).__flowVoiceStarts ?? 0)).toBeGreaterThan(2);
  expect(await page.evaluate(() => (window as Window & { __flowVoiceConstructions?: number }).__flowVoiceConstructions)).toBe(2);
  await shot(page, "07-acquisition-retry-success.png");
  acquisitionRecoveryPassed = true;
});

test("the newest explicit Flow Live start preempts another same-origin tab and acquires once", async ({ page, context }: { page: Page; context: BrowserContext }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => { (window as Window & { __flowVoiceReleaseDelayMs?: number }).__flowVoiceReleaseDelayMs = 450; });
  await page.setViewportSize({ width: 1440, height: 1000 }); await fresh(page);
  await page.getByLabel("Start Flow Live").click();
  await expect(page.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "listening");

  const second = await context.newPage();
  watchPage(second); await installFakeRecognition(second);
  await second.goto("/");
  await second.getByLabel("Start Flow Live").click();
  await expect(second.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "listening");
  await expect(page.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "moved");
  await expect.poll(() => page.evaluate(() => (window as Window & { __flowVoiceAborts?: number }).__flowVoiceAborts ?? 0)).toBeGreaterThan(0);
  await expect(page.getByText("Flow Live moved to another tab.")).toBeVisible();
  const firstRelease = await page.evaluate(() => ({
    requestedAt: (window as Window & { __flowVoiceReleaseRequestedAt?: number }).__flowVoiceReleaseRequestedAt,
    releasedAt: (window as Window & { __flowVoiceReleasedAt?: number }).__flowVoiceReleasedAt,
  }));
  const secondStartedAt = await second.evaluate(() => (window as Window & { __flowVoiceStartTimes?: number[] }).__flowVoiceStartTimes?.[0]);
  expect(firstRelease.requestedAt).toBeDefined();
  expect(firstRelease.releasedAt).toBeGreaterThanOrEqual(firstRelease.requestedAt! + 400);
  expect(secondStartedAt).toBeGreaterThanOrEqual(firstRelease.releasedAt!);

  await speak(second, "Capture Cross tab acquisition succeeded");
  const committed = await second.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("flow.life.v3")!);
    return {
      captures: state.document.captures.filter(({ title }: { title: string }) => title === "Cross tab acquisition succeeded").length,
      history: state.past.length,
    };
  });
  expect(committed).toEqual({ captures: 1, history: 1 });
  await shot(second, "08-cross-tab-owner.png");

  await second.close({ runBeforeUnload: true });
  await page.getByLabel("Start Flow Live").click();
  await expect(page.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "listening");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).document.captures.some(({ title }: { title: string }) => title === "Cross tab acquisition succeeded"))).toBe(true);

  await speak(page, "Capture Reclaimed tab preserved state");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).document.captures.some(({ title }: { title: string }) => title === "Reclaimed tab preserved state"))).toBe(true);
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("flow.life.v3")!);
    return { titles: state.document.captures.map(({ title }: { title: string }) => title), history: state.past.length };
  })).toEqual({ titles: ["Cross tab acquisition succeeded", "Reclaimed tab preserved state"], history: 2 });

  await speak(page, "Undo");
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("flow.life.v3")!);
    return { titles: state.document.captures.map(({ title }: { title: string }) => title), history: state.past.length, future: state.future.length };
  })).toEqual({ titles: ["Cross tab acquisition succeeded"], history: 1, future: 1 });
  await speak(page, "Redo");
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("flow.life.v3")!);
    return { titles: state.document.captures.map(({ title }: { title: string }) => title), history: state.past.length, future: state.future.length };
  })).toEqual({ titles: ["Cross tab acquisition succeeded", "Reclaimed tab preserved state"], history: 2, future: 0 });
  await shot(page, "09-cross-tab-reclaimed.png");

  const persistedBeforeReload = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("flow.life.v3")!);
    return { revision: state.revision, history: state.past.length, future: state.future.length };
  });
  // Two commits plus exact undo/redo account for four monotonic CAS revisions.
  // Ambient insight/weather metadata may legitimately have advanced it further.
  expect(persistedBeforeReload.revision).toBeGreaterThanOrEqual(4);

  await page.reload();
  await expect(page.getByTestId("home-space")).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).document.captures.map(({ title }: { title: string }) => title))).toEqual(["Cross tab acquisition succeeded", "Reclaimed tab preserved state"]);
  expect(await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("flow.life.v3")!);
    return { revision: state.revision, history: state.past.length, future: state.future.length };
  })).toEqual(persistedBeforeReload);
  crossTabDocumentIntegrityPassed = true;
  crossTabAcquisitionPassed = true;
  crossTabDelayedReleasePassed = true;
});

test("an explicit Start reclaims an uncooperative stale same-origin voice client without manual tab cleanup", async ({ page, context }: { page: Page; context: BrowserContext }) => {
  await page.addInitScript(() => {
    const runtime = window as Window & { __flowUseGlobalNativeLock?: boolean; __flowPageHideNativeReleaseDelayMs?: number };
    runtime.__flowUseGlobalNativeLock = true; runtime.__flowPageHideNativeReleaseDelayMs = 2_200;
  });
  await page.setViewportSize({ width: 1440, height: 1000 }); await fresh(page);
  await page.evaluate(() => {
    const Constructor = (window as Window & { SpeechRecognition?: new () => { start(): void } }).SpeechRecognition!;
    (window as Window & { __legacyOrphan?: { start(): void } }).__legacyOrphan = new Constructor();
    (window as Window & { __legacyOrphan?: { start(): void } }).__legacyOrphan!.start();
  });
  expect(await page.evaluate(() => localStorage.getItem("flow.voice.fake-native-owner"))).not.toBeNull();

  const claimant = await context.newPage();
  watchPage(claimant); await installFakeRecognition(claimant);
  await claimant.addInitScript(() => { (window as Window & { __flowUseGlobalNativeLock?: boolean }).__flowUseGlobalNativeLock = true; });
  await claimant.goto("/");
  await claimant.getByLabel("Start Flow Live").click();
  await expect.poll(() => claimant.evaluate(() => JSON.stringify({
    status: document.querySelector('[data-testid="flow-live-presence"]')?.getAttribute("data-flow-live-status"),
    diagnostics: (window as Window & { __flowVoiceDiagnostics?: Array<{ phase: string; detail: string }> }).__flowVoiceDiagnostics,
    nativeOwner: localStorage.getItem("flow.voice.fake-native-owner"),
    nativeReleaseAt: localStorage.getItem("flow.voice.fake-native-owner.release-at"),
  })), { timeout: 8_000 }).toContain('"status":"listening"');
  await expect.poll(() => page.url()).toContain("flow-live-yield=");
  expect(await claimant.evaluate(() => (window as Window & { __flowVoiceConstructions?: number }).__flowVoiceConstructions)).toBeGreaterThanOrEqual(3);
  expect(await claimant.evaluate(() => (window as Window & { __flowVoiceDiagnostics?: Array<{ phase: string; detail: string }> }).__flowVoiceDiagnostics)).toEqual(expect.arrayContaining([
    expect.objectContaining({ phase: "native-error", detail: expect.stringContaining("recognition-busy") }),
    expect.objectContaining({ phase: "stale-reclaim", detail: "supported:1:complete" }),
    expect.objectContaining({ phase: "native-start", detail: "listening" }),
  ]));

  await speak(claimant, "Capture Stale session reclaimed");
  await expect.poll(() => claimant.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("flow.life.v3")!);
    return { captures: state.document.captures.filter(({ title }: { title: string }) => title === "Stale session reclaimed").length, history: state.past.length };
  })).toEqual({ captures: 1, history: 1 });
  await shot(claimant, "11-stale-client-reclaimed.png");
  staleClientReclaimPassed = true;
});

test("mobile and reduced motion preserve navigation, transcript, and header clearance", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: "reduce" }); await fresh(page);
  await page.getByLabel("Start Flow Live").click(); await speak(page, "Open inbox");
  await expect(page.getByTestId("inbox-space")).toBeVisible();
  const geometry = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth, header: document.querySelector("header")!.getBoundingClientRect().bottom, content: document.querySelector("main > div")!.getBoundingClientRect().top }));
  expect(geometry.width).toBeLessThanOrEqual(geometry.viewport); expect(geometry.content).toBeGreaterThanOrEqual(geometry.header);
  await speak(page, "Capture Buy coffee"); await expect(page.getByText("Buy coffee").first()).toBeVisible();
  await shot(page, "05-mobile-reduced-motion.png");
});
