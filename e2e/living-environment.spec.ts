import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { fillCommandField } from "./tide-helpers";

const evidenceDir = "artifacts/living-environment-release";
const consoleErrors: string[] = [];
const pageErrors: string[] = [];
const failedRequests: string[] = [];

async function fresh(page: Page, path = "/") {
  const session = await page.context().newCDPSession(page);
  try { await session.send("Storage.clearDataForOrigin", { origin: "http://127.0.0.1:5173", storageTypes: "local_storage" }); }
  finally { await session.detach(); }
  await page.goto(path);
  if (path === "/") {
    await command(page, "Home");
    await expect(page.getByTestId("home-space")).toHaveAttribute("data-home-entrance", "active");
  }
}

async function command(page: Page, transcript: string) {
  const input = await fillCommandField(page, transcript);
  await input.press("Enter");
  // Exact transcript retention belongs to the persistent command shell, not
  // to a transient feedback row that may legitimately recede after success.
  await expect(page.getByLabel("Global Flow command")).toHaveAttribute("data-last-transcript", transcript);
}

async function shot(page: Page, name: string, settle = true) {
  if (settle) {
    // Shared-layout route expansion lasts 440 ms; a cross-space semantic flight
    // may remain for 1.22 s. State screenshots must show the named projection,
    // while the two dedicated morph frames below deliberately opt out.
    await page.waitForTimeout(500);
    await expect(page.locator("[data-transition-clone-count]")).toHaveCount(0, { timeout: 1_500 });
  }
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: `${evidenceDir}/${name}`, fullPage: true, caret: "hide" });
}

test.beforeAll(() => mkdirSync(evidenceDir, { recursive: true }));
test.beforeEach(async ({ page }) => {
  await page.route("https://api.open-meteo.com/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"daily":{"time":[]}}' }));
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => { if (request.url().startsWith("http://127.0.0.1:5173") && ["document", "script", "stylesheet", "fetch", "xhr"].includes(request.resourceType())) failedRequests.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText ?? "unknown"}`); });
});
test.afterEach(() => { expect(consoleErrors).toEqual([]); expect(pageErrors).toEqual([]); expect(failedRequests).toEqual([]); });
test.afterAll(() => writeFileSync(`${evidenceDir}/browser-evidence.json`, `${JSON.stringify({ browserConsoleErrors: consoleErrors, pageErrors, failedRequests }, null, 2)}\n`));

test("living release screenshots and signature cross-space journey are real", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await fresh(page);
  await expect(page.getByTestId("home-space")).toBeVisible(); await shot(page, "01-home.png");
  await page.getByRole("button", { name: "Open Calendar", exact: true }).click();
  await expect(page.getByTestId("calendar-space")).toBeVisible(); await shot(page, "02-calendar.png");
  const input = await fillCommandField(page, "Make the 2 PM meeting important and red");
  await shot(page, "03-command-preview.png");
  await input.press("Enter"); await expect(page.getByText("Day reshaped")).toBeVisible();
  await command(page, "I'm 35 minutes behind. Keep dinner at seven"); await shot(page, "04-tide-recovery.png");
  await command(page, "What if I add a 30 minute walk at four?"); await expect(page.getByText("Preview — nothing committed").first()).toBeVisible(); await shot(page, "05-what-if.png");
  await command(page, "Cancel that preview"); await command(page, "Capture Renew passport before Senegal");
  await command(page, "Inbox"); await expect(page.getByTestId("inbox-space")).toBeVisible();
  await page.getByRole("button", { name: "Renew passport before Senegal" }).click();
  const morphInput = await fillCommandField(page, "Turn that into a plan");
  // Freeze the application clock only for the two deliberately transient
  // evidence frames. This verifies the real 0–160 ms and 280–620 ms beats
  // without making runner/screenshot latency part of product correctness.
  const frameClock = new Date("2026-09-04T09:32:00.000Z");
  await page.clock.install({ time: frameClock });
  await page.clock.pauseAt(new Date(frameClock.getTime() + 50));
  await morphInput.press("Enter");
  // Semantic targeting precedes the domain's six-beat transformation.
  for (let elapsed = 0; elapsed < 2_500 && await page.locator("[data-transition-beat='focus-source']").count() === 0; elapsed += 16) await page.clock.runFor(16);
  await expect(page.locator("[data-transition-beat='focus-source']")).toBeVisible();
  await expect(page.locator("[data-transition-measured='true']")).toBeVisible();
  await page.screenshot({ path: `${evidenceDir}/06-inbox-source-focus.png`, fullPage: true, caret: "hide" });
  await page.clock.runFor(300);
  await expect(page.locator("[data-transition-beat='transfer-path'] svg")).toBeVisible();
  await page.clock.runFor(100);
  await page.screenshot({ path: `${evidenceDir}/07-inbox-to-plan-transfer.png`, fullPage: true, caret: "hide" });
  await page.clock.resume();
  await expect(page.getByLabel("Global Flow command")).toHaveAttribute("data-last-transcript", "Turn that into a plan");
  await expect(page.getByTestId("plan-detail")).toBeVisible(); await expect(page.getByText("Documents")).toBeVisible(); await shot(page, "08-plan-detail.png");
  await expect(page.getByText(/No due date/)).toBeVisible();
  await command(page, "Schedule Documents Friday at ten");
  await expect(page.getByTestId("calendar-space")).toBeVisible();
  const scheduled = await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).document);
  expect(scheduled.links.filter((link: { type: string }) => link.type === "step-scheduled-as-event")).toHaveLength(1);
  expect(Object.values(scheduled.calendars).flatMap((plan: { events: Array<{ title: string }> }) => plan.events).filter((event: { title: string }) => event.title === "Documents")).toHaveLength(1);
  await command(page, "I promised Maya I’d send the proposal by Friday"); await expect(page.getByTestId("people-space")).toBeVisible(); await shot(page, "09-people.png");
  await command(page, "What fits right now?"); await expect(page.getByTestId("home-space")).toBeVisible(); await expect(page.getByLabel("Global Flow command")).toContainText(/things fit|Keep this space free/); await shot(page, "10-now.png");
});

test("capture-to-plan is one exact global undo and redo point", async ({ page }) => {
  await fresh(page, "/inbox"); await command(page, "Capture Renew passport before Senegal");
  await page.getByRole("button", { name: "Renew passport before Senegal" }).click(); await command(page, "Turn that into a plan");
  await expect(page.getByTestId("plan-detail")).toBeVisible();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!));
  expect(state.past).toHaveLength(2); expect(state.document.links).toHaveLength(1);
  await page.getByRole("button", { name: "Undo last change" }).click();
  await expect.poll(() => page.evaluate(() => {
    const current = JSON.parse(localStorage.getItem("flow.life.v3")!);
    return { plans: current.document.plans.length, captureStatus: current.document.captures[0].status };
  })).toEqual({ plans: 0, captureStatus: "unresolved" });
  await page.getByRole("button", { name: "Redo last change" }).click();
  await expect.poll(() => page.evaluate(() => {
    const current = JSON.parse(localStorage.getItem("flow.life.v3")!);
    return { plans: current.document.plans.length, captureStatus: current.document.captures[0].status };
  })).toEqual({ plans: 1, captureStatus: "resolved" });
});

test("all living projections navigate by Today pointer, command, deep link, and browser history", async ({ page }) => {
  await fresh(page);
  await page.getByRole("button", { name: "Open Calendar", exact: true }).click();
  await expect(page.getByTestId("calendar-space")).toBeVisible();
  await page.getByRole("button", { name: "Open Flow home" }).click();
  for (const [label, testId] of [["Capture", "inbox-space"], ["Outcomes", "plans-space"], ["Commitments", "people-space"]] as const) {
    await command(page, label);
    await expect(page.getByTestId(testId)).toBeVisible();
    await page.getByRole("button", { name: "Open Flow home" }).click();
    await expect(page.getByTestId("home-space")).toBeVisible();
  }
  await page.getByRole("button", { name: "Open Calendar", exact: true }).click();
  await expect(page.getByTestId("calendar-space")).toBeVisible();
  await page.getByRole("button", { name: "Open Flow home" }).click();
  await command(page, "Inbox"); await expect(page.getByTestId("inbox-space")).toBeVisible();
  await command(page, "Go back"); await expect(page.getByTestId("home-space")).toBeVisible();
  await page.goto("/people"); await expect(page.getByTestId("people-space")).toBeVisible();
});

test("locked Home lenses and global command support keyboard entry without legacy card shells", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await fresh(page);
  await expect(page.locator("[data-elite-lens-grid] > div")).toHaveCount(5);
  await expect(page.locator("header nav")).toHaveCount(0);
  const today = page.getByRole("button", { name: "Open Calendar", exact: true });
  await today.focus(); await today.press("Enter");
  await expect(page.getByTestId("calendar-space")).toBeVisible();
  await page.getByRole("button", { name: "Open Flow home" }).click();
  await expect(page.getByTestId("home-space")).toBeVisible();
  await page.keyboard.press("/");
  const input = page.getByRole("textbox", { name: "Tell Flow what to change" });
  await expect(input).toBeFocused();
  await input.fill("Capture"); await input.press("Enter");
  await expect(page.getByTestId("inbox-space")).toBeVisible();
});

test("locked Home command stays present, focuses by keyboard, and keeps actionable work open", async ({ page }) => {
  await fresh(page);
  await command(page, "Home");
  await expect(page.getByText("Opened Home")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Tell Flow what to change" })).toHaveValue("Home");
  await command(page, "Capture Renew passport before Senegal");
  await expect(page.getByRole("textbox", { name: "Tell Flow what to change" })).toBeVisible();
  await page.keyboard.press("/");
  const input = page.getByRole("textbox", { name: "Tell Flow what to change" });
  await expect(input).toBeFocused();
  await command(page, "Delete this capture");
  await expect(page.getByRole("button", { name: "Confirm" })).toBeVisible();
  await page.waitForTimeout(900);
  await expect(input).toBeVisible();
  await expect(page.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "sleeping");
});

test("a plan step schedules through Tide and undo redo preserve one linked event", async ({ page }) => {
  await fresh(page, "/inbox"); await command(page, "Capture Renew passport before Senegal");
  await page.getByRole("button", { name: "Renew passport before Senegal" }).click(); await command(page, "Turn that into a plan");
  await expect(page.getByTestId("plan-detail")).toBeVisible(); await command(page, "Schedule Documents Friday at ten");
  await expect(page.getByTestId("calendar-space")).toBeVisible();
  const scheduled = await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!));
  const eventId = scheduled.document.links.find((link: { type: string }) => link.type === "step-scheduled-as-event").toId;
  expect(Object.values(scheduled.document.calendars).flatMap((plan: { events: Array<{ id: string }> }) => plan.events).filter((event: { id: string }) => event.id === eventId)).toHaveLength(1);
  await page.getByRole("button", { name: "Undo last change" }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).document.links.filter((link: { type: string }) => link.type === "step-scheduled-as-event").length)).toBe(0);
  await page.getByRole("button", { name: "Redo last change" }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).document.links.find((link: { type: string }) => link.type === "step-scheduled-as-event")?.toId)).toBe(eventId);
});

test("destructive living operations require confirmation", async ({ page }) => {
  await fresh(page, "/inbox"); await command(page, "Capture Renew passport before Senegal");
  await page.getByRole("button", { name: "Renew passport before Senegal" }).click(); await command(page, "Delete this capture");
  await expect(page.getByText("Delete Renew passport before Senegal?").first()).toBeVisible();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!)); expect(state.document.captures).toHaveLength(1);
  await page.getByRole("button", { name: "Cancel" }).click(); expect((await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!))).document.captures).toHaveLength(1);
  await command(page, "Delete this capture"); await page.getByRole("button", { name: "Confirm" }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).document.captures.length)).toBe(0);
});

test("Escape cancels Calendar previews and pending destruction without mutation", async ({ page }) => {
  await fresh(page, "/calendar");
  const before = await page.evaluate(() => localStorage.getItem("flow.life.v3"));
  await command(page, "What if I add a 30 minute walk at four?");
  await expect(page.getByText("What-if preview")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("What-if preview")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("flow.life.v3"))).toBe(before);
  await command(page, "Capture Renew passport before Senegal"); await command(page, "Inbox");
  await page.getByRole("button", { name: "Renew passport before Senegal" }).click(); await command(page, "Delete this capture");
  await expect(page.getByRole("button", { name: "Confirm" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Confirm" })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).document.captures)).toHaveLength(1);
});

test("Plan and People expose inspectable Calendar and lineage relationships", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-03T09:00:00"));
  await fresh(page, "/inbox"); await command(page, "Capture Renew passport before Senegal");
  await page.getByRole("button", { name: "Renew passport before Senegal" }).click(); await command(page, "Turn that into a plan");
  await expect(page.getByTestId("plan-detail")).toBeVisible(); await expect(page.getByText(/No due date/)).toBeVisible();
  await command(page, "Schedule Documents Friday at ten"); await expect(page.getByTestId("calendar-space")).toBeVisible();
  await command(page, "Plans"); await page.getByRole("button", { name: /Renew passport before Senegal/ }).click();
  await page.getByRole("button", { name: "Inspect Documents in Today" }).click();
  await expect(page.getByTestId("calendar-relationship-inspector")).toContainText("Documents · Planned for 2026-09-04 at 10 AM");
  await command(page, "I promised Maya I'd send the proposal"); await expect(page.getByTestId("people-space")).toBeVisible();
  await expect(page.getByRole("button", { name: /You owe · Maya.*No due date/ })).toBeVisible();
  await command(page, "Link Maya promise to Senegal plan"); await expect(page.getByText(/Plan · Renew passport before Senegal/)).toBeVisible();
  await command(page, "Reserve 30 minutes for the proposal promise to Maya Friday at ten"); await expect(page.getByTestId("calendar-space")).toBeVisible();
  await command(page, "People"); await expect(page.getByText(/Today · 2026-09-04 10:25 AM/)).toBeVisible();
  const future = await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).document.calendars["2026-09-04"].events
    .filter(({ title }: { title: string }) => title === "Documents" || title === "Prepare · Send the proposal")
    .sort((left: { start: number }, right: { start: number }) => left.start - right.start));
  expect(future.map((event: { title: string; start: number; end: number }) => [event.title, event.start, event.end])).toEqual([
    ["Documents", 600, 625],
    ["Prepare · Send the proposal", 625, 655],
  ]);
});

test("Flow Live final transcript uses the global pipeline and restarts", async ({ page }) => {
  await page.addInitScript(() => {
    class Recognition {
      continuous = false; interimResults = true; maxAlternatives = 5; lang = ""; phrases: unknown[] = [];
      onstart: (() => void) | null = null; onresult: ((event: unknown) => void) | null = null; onerror: ((event: unknown) => void) | null = null; onend: (() => void) | null = null;
      start() {
        const runtime = window as Window & { __livingRecognition?: Recognition; __livingStartCount?: number };
        runtime.__livingRecognition = this; runtime.__livingStartCount = (runtime.__livingStartCount ?? 0) + 1;
        this.onstart?.();
      }
      stop() { this.onend?.(); } abort() { this.onend?.(); }
      emit(value: string) { const result = Object.assign({ 0: { transcript: value, confidence: 0.9 } }, { isFinal: true, length: 1 }); this.onresult?.({ results: [result] }); this.onend?.(); }
      emitInterim(value: string) { const result = Object.assign({ 0: { transcript: value, confidence: 0.8 } }, { isFinal: false, length: 1 }); this.onresult?.({ results: [result] }); }
    }
    (window as Window & { SpeechRecognition?: typeof Recognition }).SpeechRecognition = Recognition;
  });
  await fresh(page);
  await expect(page.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "sleeping");
  await page.getByLabel("Start Flow Live").click();
  await expect(page.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "listening");
  await page.evaluate(() => (window as Window & { __livingRecognition?: { emit(value: string): void } }).__livingRecognition!.emit("Inbox"));
  await expect(page.getByTestId("inbox-space")).toBeVisible();
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => (window as Window & { __livingStartCount?: number }).__livingStartCount)).toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "listening");
  await page.evaluate(() => (window as Window & { __livingRecognition?: { emit(value: string): void } }).__livingRecognition!.emit("Capture Renew passport before Senegal"));
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).document.captures.length)).toBe(1);
  await expect(page.getByRole("button", { name: "Open Flow command" })).toBeVisible({ timeout: 2_500 });
  await expect(page.getByRole("button", { name: "Stop Flow Live" })).toBeVisible();
  await expect(page.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "listening");
  await page.evaluate(() => (window as Window & { __livingRecognition?: { emitInterim(value: string): void } }).__livingRecognition!.emitInterim("Renew passport"));
  await expect(page.getByRole("textbox", { name: "Tell Flow what to change" })).toHaveValue("Renew passport");
  await expect(page.locator("[data-command-expanded='true']")).toBeVisible();
  await page.getByLabel("Stop Flow Live").click();
  await expect(page.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "sleeping");
});

test("mobile and reduced motion retain complete causality", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await fresh(page);
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toHaveCount(0);
  await expect(page.locator("[data-elite-lens-grid] > div")).toHaveCount(5);
  await expect(page.getByLabel("Global Flow command")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true); await shot(page, "11-mobile.png");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await command(page, "Capture");
  await expect(page.locator("[data-space-shell='capture']")).toHaveAttribute("data-space-transition-mode", "reduced");
  await expect(page.locator("[data-space-shell='capture']")).not.toHaveAttribute("data-layout-id");
  await command(page, "Capture Renew passport before Senegal");
  await expect(page.getByRole("button", { name: "Open Flow command" })).toBeVisible({ timeout: 2_500 });
  await page.getByRole("button", { name: "Renew passport before Senegal" }).click(); await command(page, "Turn that into a plan");
  await expect(page.locator("[data-transition-beat]")).toBeVisible();
  await expect(page.locator("[data-transition-beat] svg")).toHaveCount(0);
  expect(await page.evaluate(() => (window as Window & { __FLOW_MOTION__?: { activeFrameLoops: number } }).__FLOW_MOTION__?.activeFrameLoops ?? 0)).toBe(0);
  const mobileOutcomeGeometry = await page.evaluate(() => {
    const utilities = [...document.querySelectorAll<HTMLElement>("[data-testid='step-actions'], [data-testid='step-actions'] button, [data-testid='step-actions'] select")];
    return {
      noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth,
      utilitiesInsideViewport: utilities.every((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.left >= 0 && rect.right <= window.innerWidth;
      }),
    };
  });
  expect(mobileOutcomeGeometry).toEqual({ noHorizontalOverflow: true, utilitiesInsideViewport: true });
  await shot(page, "12-reduced-motion.png", false);
  await expect(page.locator("[data-transition-clone-count]")).toHaveCount(0, { timeout: 500 });
});

test("hidden tabs cancel active cross-space motion and frame sampling", async ({ page }) => {
  await fresh(page, "/inbox"); await command(page, "Capture Renew passport before Senegal");
  await page.getByRole("button", { name: "Renew passport before Senegal" }).click(); await command(page, "Turn that into a plan");
  await expect(page.locator("[data-transition-clone-count='1']")).toHaveCount(1);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator("[data-transition-clone-count]")).toHaveCount(0);
  expect(await page.evaluate(() => (window as Window & { __FLOW_MOTION__?: { activeFrameLoops: number } }).__FLOW_MOTION__?.activeFrameLoops ?? 0)).toBe(0);
});
