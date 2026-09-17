import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { fillCommandField } from "./tide-helpers";

const evidenceDir = "artifacts/apple-grade-release";
const consoleErrors: string[] = [];
const pageErrors: string[] = [];
const failedRequests: string[] = [];
const screenshots: string[] = [];
const motionFrames: string[] = [];
let utilityJourneyPassed = false;
let motionResiduePassed = false;

async function clearAndOpen(page: Page, path = "/") {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Storage.clearDataForOrigin", { origin: "http://127.0.0.1:5173", storageTypes: "local_storage" });
  } finally { await session.detach(); }
  await page.goto(path);
  await page.evaluate(() => window.scrollTo({ left: 0, top: 0, behavior: "auto" }));
  const shell = page.locator("main > [data-space-shell]");
  await expect(shell).toHaveCount(1);
  await expect(shell).toHaveCSS("opacity", "1");
}

async function command(page: Page, transcript: string) {
  const input = await fillCommandField(page, transcript);
  await input.press("Enter");
  await expect(page.getByLabel("Global Flow command")).toHaveAttribute("data-last-transcript", transcript);
}

async function settle(page: Page) {
  await expect(page.locator("[data-transition-clone-count]")).toHaveCount(0, { timeout: 2_500 });
  await expect(page.locator("[data-event-presence='exit-ghost']")).toHaveCount(0, { timeout: 2_500 });
  await expect(page.locator("main > [data-space-shell]")).toHaveCount(1, { timeout: 2_500 });
  await page.waitForTimeout(180);
}

async function shot(page: Page, name: string, fullPage = true) {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: `${evidenceDir}/${name}`, fullPage, caret: "hide" });
  screenshots.push(name);
}

async function centerInViewport(page: Page, selector: string) {
  const target = page.locator(selector).first();
  await expect(target).toBeVisible();
  await target.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const safeBottom = window.innerHeight - (window.innerWidth < 640 ? 72 : 24);
    if (rect.top < 72 || rect.bottom > safeBottom) element.scrollIntoView({ block: "center", inline: "nearest" });
  });
  await expect(target).toBeInViewport();
}

async function assertOutcomeDetailGeometry(page: Page) {
  const geometry = await page.evaluate(() => {
    const actions = document.querySelector<HTMLElement>("[data-testid='outcome-actions']")?.getBoundingClientRect();
    const form = document.querySelector<HTMLElement>("[data-testid='outcome-add-step']")?.getBoundingClientRect();
    const utilityNodes = [...document.querySelectorAll<HTMLElement>("[data-testid='step-actions'], [data-testid='step-actions'] button, [data-testid='step-actions'] select")];
    const withinViewport = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.left >= 0 && rect.right <= window.innerWidth;
    };
    return {
      noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth,
      outcomeControlsClearForm: Boolean(actions && form && actions.bottom <= form.top),
      stepUtilitiesInViewport: utilityNodes.every(withinViewport),
    };
  });
  expect(geometry.noHorizontalOverflow, "Outcome detail must not create horizontal overflow").toBe(true);
  expect(geometry.outcomeControlsClearForm, "Outcome controls must not intersect the add-step form").toBe(true);
  expect(geometry.stepUtilitiesInViewport, "Every step utility must remain horizontally accessible").toBe(true);
}

async function assertMeaningfulMotionScene(page: Page, operation: string, percentage: number) {
  const scene = await page.evaluate(() => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const intersects = (element: Element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.left < viewport.width
        && rect.bottom > 64 && rect.top < viewport.height - (viewport.width < 640 ? 64 : 0)
        && style.visibility !== "hidden" && Number(style.opacity || 1) > 0.05;
    };
    const shell = document.querySelector<HTMLElement>("main > [data-space-shell]");
    const clone = document.querySelector<HTMLElement>("[data-transition-surface='true']");
    const completion = document.querySelector<HTMLElement>("[data-event-id][data-status='done']");
    const cloneRect = clone?.getBoundingClientRect();
    const visibleContent = shell ? [...shell.querySelectorAll("h1, h2, [data-life-entity-id], [data-event-id], [data-testid='now-space']")].filter(intersects).length : 0;
    const stepUtilities = [...document.querySelectorAll<HTMLElement>("[data-testid='step-actions'], [data-testid='step-actions'] button, [data-testid='step-actions'] select")];
    return {
      shellOpacity: shell ? Number(getComputedStyle(shell).opacity) : 0,
      shellTextLength: shell?.innerText.trim().length ?? 0,
      visibleContent,
      completionVisible: Boolean(completion && intersects(completion)),
      noHorizontalOverflow: document.documentElement.scrollWidth <= viewport.width,
      stepUtilitiesInsideViewport: stepUtilities.every((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.left >= 0 && rect.right <= viewport.width;
      }),
      cloneTextLength: clone?.innerText.trim().length ?? 0,
      cloneInsideViewport: !cloneRect || (
        cloneRect.left >= 0 && cloneRect.right <= viewport.width
        && cloneRect.top >= 64
        && cloneRect.bottom <= viewport.height - (viewport.width < 640 ? 64 : 0)
      ),
    };
  });
  expect(scene.shellOpacity, `${operation} ${percentage}% shell must be painted`).toBeGreaterThan(0.2);
  expect(scene.shellTextLength, `${operation} ${percentage}% shell must contain the real route`).toBeGreaterThan(12);
  expect(scene.visibleContent, `${operation} ${percentage}% must show meaningful product content`).toBeGreaterThan(0);
  expect(scene.noHorizontalOverflow, `${operation} ${percentage}% must not overflow horizontally`).toBe(true);
  expect(scene.stepUtilitiesInsideViewport, `${operation} ${percentage}% step utilities must remain accessible`).toBe(true);
  expect(scene.cloneInsideViewport, `${operation} ${percentage}% transition surface must not clip`).toBe(true);
  if (operation === "completion-reclaim" && percentage > 0) {
    expect(scene.completionVisible, `${operation} ${percentage}% must visibly mark the completed event`).toBe(true);
  }
  if (scene.cloneTextLength) expect(scene.cloneTextLength, `${operation} ${percentage}% transition surface must remain legible`).toBeGreaterThan(8);
}

async function motionShot(page: Page, viewport: string, operation: string, percentage: number) {
  await assertMeaningfulMotionScene(page, operation, percentage);
  const name = `motion-${viewport}-${operation}-${String(percentage).padStart(3, "0")}.png`;
  const bytes = await page.screenshot({ path: `${evidenceDir}/${name}`, fullPage: false, caret: "hide" });
  motionFrames.push(name);
  return createHash("sha256").update(bytes).digest("hex");
}

async function meaningfulState(page: Page) {
  await command(page, "Capture Research Senegal entry rules");
  await command(page, "Capture Renew passport before Senegal");
  await command(page, "Turn that into a plan");
  await settle(page);
  await command(page, "Schedule Documents Friday at ten");
  await settle(page);
  await command(page, "I promised Maya the proposal by Friday");
  await settle(page);
  await command(page, "I am waiting for Daniel's contract confirmation");
  await settle(page);
  await command(page, "Next time I see Ana remember to discuss the budget");
  await settle(page);
  await command(page, "Book dinner at Pizzeria Roma tomorrow at eight");
  await command(page, "Make it red and important");
}

test.beforeAll(() => mkdirSync(evidenceDir, { recursive: true }));
test.beforeEach(async ({ page }) => {
  await page.route("https://api.open-meteo.com/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"daily":{"time":[]}}' }));
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    if (request.url().startsWith("http://127.0.0.1:5173") && ["document", "script", "stylesheet", "fetch", "xhr"].includes(request.resourceType())) {
      failedRequests.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText ?? "unknown"}`);
    }
  });
});
test.afterEach(() => {
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});
test.afterAll(() => writeFileSync(`${evidenceDir}/browser-evidence.json`, `${JSON.stringify({
  browserConsoleErrors: consoleErrors,
  pageErrors,
  failedRequests,
  screenshots,
  motionFrames,
  utilityJourney: utilityJourneyPassed ? "PASS" : "FAIL",
  motionResidue: motionResiduePassed ? "PASS" : "FAIL",
}, null, 2)}\n`));

test("Apple-grade canonical spaces show meaningful state and complete utility loops", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await clearAndOpen(page);
  await meaningfulState(page);

  await command(page, "Home"); await settle(page);
  await expect(page.getByTestId("home-space")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Good to know" })).toBeVisible();
  await shot(page, "01-home-meaningful.png");

  await command(page, "Open Today"); await settle(page);
  await expect(page.getByTestId("calendar-space")).toBeVisible();
  await expect(page.getByTestId("now-space")).toBeVisible();
  await shot(page, "02-today-now-embedded.png");

  await command(page, "Capture"); await settle(page);
  await expect(page.getByTestId("inbox-space")).toBeVisible();
  await expect(page.getByText("Research Senegal entry rules")).toBeVisible();
  await expect(page.getByText("Recently routed")).toBeVisible();
  await shot(page, "03-capture-unresolved-and-routed.png");

  await command(page, "Outcomes"); await settle(page);
  await page.getByRole("button", { name: /Renew passport before Senegal/ }).click();
  await expect(page.getByTestId("plan-detail")).toBeVisible();
  await expect(page.getByText(/Scheduled .* at 10 AM/)).toBeVisible();
  await settle(page);
  await assertOutcomeDetailGeometry(page);
  await shot(page, "04-outcome-scheduled-step.png");

  await command(page, "Commitments"); await settle(page);
  await expect(page.getByTestId("people-space")).toBeVisible();
  await expect(page.getByText(/You owe · Maya/)).toBeVisible();
  await expect(page.getByText(/Waiting on · Daniel/)).toBeVisible();
  await expect(page.getByText(/Next conversation · Ana/)).toBeVisible();
  await shot(page, "05-commitments-three-lenses.png");

  const navigation = await fillCommandField(page, "Open the Capture area");
  await navigation.press("Enter");
  await shot(page, "06-global-navigation-command.png");
  await expect(page.getByTestId("inbox-space")).toBeVisible();

  await command(page, "Book breakfast at Café Luna tomorrow at eight");
  await command(page, "Make it blue and important");
  await command(page, "Open Today"); await settle(page);
  await expect(page.locator("[data-color='blue'][data-importance='important']")).toContainText("Breakfast at Café Luna");
  await shot(page, "07-contextual-follow-up.png");

  await command(page, "What if I am thirty five minutes behind from now");
  await expect(page.getByText("Preview — nothing committed")).toBeVisible();
  await shot(page, "08-tide-recovery-preview.png");
  await command(page, "Cancel the preview");

  await page.setViewportSize({ width: 390, height: 844 });
  await command(page, "Home"); await settle(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(page, "09-mobile-home.png", false);
  await command(page, "Open Today"); await settle(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(page, "10-mobile-today.png", false);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await command(page, "Capture"); await settle(page);
  await expect(page.locator("[data-space-shell='capture']")).toHaveAttribute("data-space-transition-mode", "reduced");
  await shot(page, "11-reduced-motion.png", false);

  const state = await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!));
  expect(state.document.captures.filter(({ status }: { status: string }) => status === "unresolved")).toHaveLength(1);
  expect(state.document.plans).toHaveLength(1);
  expect(state.document.commitments).toHaveLength(3);
  expect(state.document.links.filter(({ type }: { type: string }) => type === "step-scheduled-as-event")).toHaveLength(1);
  utilityJourneyPassed = true;
});

const viewports = [
  ["desktop", { width: 1440, height: 1000 }],
  ["tablet", { width: 1024, height: 768 }],
  ["mobile", { width: 390, height: 844 }],
] as const;
const percentages = [0, 25, 50, 75, 100] as const;

async function triggerAndCapture(page: Page, viewport: string, operation: string, transcript: string, duration = 1_220) {
  const input = await fillCommandField(page, transcript);
  const hashes = [await motionShot(page, viewport, operation, 0)];
  // Screenshots and runner IPC can take longer than a short transition on a
  // loaded CI host. Drive the browser clock between frames so 25/50/75 are
  // actual product states, rather than three late pictures of the endpoint.
  const applicationNow = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(applicationNow + 1_000);
  await input.press("Enter");
  // Percentages describe the domain transform, not the preceding semantic
  // targeting cue. Advance real application timers until this request runs;
  // never mark an unchanged pre-dispatch event as a completed animation.
  let dispatchWait = 0;
  while (await page.getByLabel("Global Flow command").getAttribute("data-last-transcript") !== transcript && dispatchWait < 2_500) {
    await page.clock.runFor(16);
    dispatchWait += 16;
  }
  await expect(page.getByLabel("Global Flow command")).toHaveAttribute("data-last-transcript", transcript);
  await expect(page.locator("[data-flow-feedback]")).toHaveAttribute("data-feedback-phase", "completed");
  let elapsed = 0;
  for (const percentage of percentages.slice(1, -1)) {
    const target = Math.round(duration * percentage / 100);
    await page.clock.runFor(target - elapsed);
    elapsed = target;
    hashes.push(await motionShot(page, viewport, operation, percentage));
  }
  await page.clock.runFor(duration + 300 - elapsed);
  await page.clock.resume();
  await settle(page);
  await expect(page.locator("[data-transition-clone-count]")).toHaveCount(0);
  hashes.push(await motionShot(page, viewport, operation, 100));
  expect(new Set(hashes).size, `${operation} must show source, motion, and resolved states`).toBeGreaterThanOrEqual(3);
}

test("Tide, Anchor, and Bloom leave no residue across the complete motion frame matrix", async ({ page }) => {
  test.setTimeout(180_000);
  await page.clock.install({ time: new Date("2026-09-03T12:00:00.000Z") });
  for (const [viewport, size] of viewports) {
    await page.setViewportSize(size);

    await clearAndOpen(page, "/today");
    await centerInViewport(page, "[data-event-id='roadmap']");
    await triggerAndCapture(page, viewport, "event-movement", "Move the two PM meeting to four", 520);
    await expect(page.locator("[data-event-id='roadmap']")).toHaveAttribute("data-event-presence", "committed");

    await clearAndOpen(page, "/capture");
    await command(page, "Capture Renew passport before Senegal");
    await centerInViewport(page, "[data-life-entity-id]");
    await page.getByRole("button", { name: "Renew passport before Senegal" }).click();
    await triggerAndCapture(page, viewport, "capture-to-outcome", "Turn that into a plan");
    await expect(page.getByTestId("plan-detail")).toBeVisible();

    await centerInViewport(page, "[data-step-id]");
    await triggerAndCapture(page, viewport, "outcome-step-to-today", "Schedule Documents Friday at ten");
    await expect(page.getByTestId("calendar-space")).toBeVisible();

    await page.clock.setFixedTime(new Date("2026-09-03T14:30:00"));
    await centerInViewport(page, "[data-event-id='roadmap']");
    await page.locator("[data-event-id='roadmap']").click();
    await triggerAndCapture(page, viewport, "completion-reclaim", "Finish this early", 720);
    await expect(page.locator("[data-event-id='roadmap']")).toHaveAttribute("data-status", "done");

    await clearAndOpen(page, "/today");
    await page.clock.setFixedTime(new Date("2026-09-03T13:00:00"));
    await centerInViewport(page, "[data-event-id='roadmap']");
    await triggerAndCapture(page, viewport, "tide-recovery", "I'm thirty five minutes behind. Keep dinner at seven", 720);
    await expect(page.locator("[data-event-id='dinner']")).toHaveAttribute("data-protected", "true");
  }
  expect(motionFrames).toHaveLength(75);
  expect(await page.locator("[data-transition-clone-count]").count()).toBe(0);
  expect(await page.evaluate(() => (window as Window & { __FLOW_MOTION__?: { activeClones: number; activeFrameLoops: number } }).__FLOW_MOTION__ ?? { activeClones: 0, activeFrameLoops: 0 })).toMatchObject({ activeClones: 0, activeFrameLoops: 0 });
  motionResiduePassed = true;
});
