import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { captureEvidence, eventById, expectValid, fresh, readEvents, submitRaw, submitSuccess } from "./tide-helpers";

const evidenceDir = "artifacts/tide-release";
const tideConsoleErrors: string[] = [];
const tidePageErrors: string[] = [];
const tideFailedRequests: string[] = [];

async function shot(page: Page, name: string) {
  await captureEvidence(page, `${evidenceDir}/${name}`);
}

test.beforeAll(() => mkdirSync(evidenceDir, { recursive: true }));
test.beforeEach(async ({ page }) => {
  page.on("console", (message) => { if (message.type() === "error") tideConsoleErrors.push(message.text()); });
  page.on("pageerror", (error) => tidePageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    if (request.url().startsWith("http://127.0.0.1:5173") && ["document", "script", "stylesheet", "fetch", "xhr"].includes(request.resourceType())) {
      tideFailedRequests.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText ?? "unknown failure"}`);
    }
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await fresh(page);
});
test.afterEach(() => {
  expect(tideConsoleErrors, "Tide browser console errors").toEqual([]);
  expect(tidePageErrors, "Tide uncaught page errors").toEqual([]);
  expect(tideFailedRequests, "Tide failed application requests").toEqual([]);
});
test.afterAll(() => {
  writeFileSync(`${evidenceDir}/tide-browser-evidence.json`, `${JSON.stringify({
    browserConsoleErrors: tideConsoleErrors,
    pageErrors: tidePageErrors,
    failedRequests: tideFailedRequests,
  }, null, 2)}\n`);
});

test("1 no-selection update by time is one exact transaction", async ({ page }) => {
  await shot(page, "01-initial-breathing-day.png");
  const before = await readEvents(page);
  await submitSuccess(page, "Make the 2 PM meeting important and red");
  let events = await readEvents(page);
  expectValid(events, 8);
  expect(eventById(events, "roadmap")).toMatchObject({ start: 14 * 60, color: "red", importance: "important" });
  expect(eventById(events, "lunch")).toEqual(eventById(before, "lunch"));
  await shot(page, "02-important-red-event.png");
  await page.getByRole("button", { name: "Undo last change" }).click();
  await expect.poll(async () => eventById(await readEvents(page), "roadmap").color).toBe("neutral");
  events = await readEvents(page);
  expect(eventById(events, "roadmap")).toMatchObject({ color: "neutral", importance: "normal" });
  await page.getByRole("button", { name: "Redo last change" }).click();
  await expect.poll(async () => eventById(await readEvents(page), "roadmap")).toMatchObject({ color: "red", importance: "important" });
});

test("2 move by time has geometry and exact undo redo", async ({ page }) => {
  await submitSuccess(page, "Move the 2 PM to 4");
  expect(eventById(await readEvents(page), "roadmap").start).toBe(16 * 60);
  await page.getByRole("button", { name: "Undo last change" }).click();
  await expect.poll(async () => eventById(await readEvents(page), "roadmap").start).toBe(14 * 60);
  await shot(page, "07-undo.png");
  await page.getByRole("button", { name: "Redo last change" }).click();
  await expect.poll(async () => eventById(await readEvents(page), "roadmap").start).toBe(16 * 60);
});

test("3 explicit Breathing Room participates in safe Tide layout", async ({ page }) => {
  const beforeIds = (await readEvents(page)).map((event) => event.id).sort();
  await submitSuccess(page, "Give me 20 minutes before the interview and move anything flexible out of the way");
  const events = await readEvents(page);
  expectValid(events, 8);
  expect(events.map((event) => event.id).sort()).toEqual(beforeIds);
  await expect(page.getByLabel("Breathing room, 20 minutes")).toBeVisible();
  await expect(page.getByLabel("Breathing room, 20 minutes")).toHaveAttribute("data-wave-motion", "settled");
  expect(eventById(events, "interview")).toMatchObject({ start: 17 * 60, protected: false, mobility: "anchored" });
  await shot(page, "03-breathing-room.png");
});

test("4 signature command is atomic and visually causal", async ({ page }) => {
  await submitSuccess(page, "Make the 2 PM meeting important and red, give me 20 minutes before it, and move anything flexible out of the way");
  let events = await readEvents(page);
  expectValid(events, 8);
  expect(eventById(events, "roadmap")).toMatchObject({ color: "red", importance: "important" });
  await expect(page.getByLabel("Breathing room, 20 minutes")).toBeVisible();
  await shot(page, "04-tide-reflow.png");
  await page.getByRole("button", { name: "Undo last change" }).click();
  await expect.poll(async () => eventById(await readEvents(page), "roadmap").color).toBe("neutral");
  events = await readEvents(page);
  expect(eventById(events, "roadmap")).toMatchObject({ color: "neutral", importance: "normal" });
  await expect(page.getByLabel("Breathing room, 20 minutes")).toHaveCount(0);
});

test("5 drag uses the shared transaction and history path", async ({ page }) => {
  const block = page.locator('[data-event-id="roadmap"]');
  const box = await block.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2 + 20, { steps: 4 });
  await expect(page.getByText("Moving to 2:20 PM")).toBeVisible();
  await page.mouse.up();
  await expect(page.getByText("Day reshaped")).toBeVisible();
  expect(eventById(await readEvents(page), "roadmap").start).toBe(14 * 60 + 20);
  await page.getByRole("button", { name: "Undo last change" }).click();
  await expect.poll(async () => eventById(await readEvents(page), "roadmap").start).toBe(14 * 60);
});

test("6 resize handle has typed-command parity and exact undo", async ({ page }) => {
  await page.locator('[data-event-id="roadmap"]').click();
  const handle = page.locator('[data-event-id="roadmap"]').locator("..").getByTitle("Resize event");
  await expect(handle).toBeVisible();
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2 + 15, { steps: 3 });
  await expect(page.getByText("75 minutes")).toBeVisible();
  await page.mouse.up();
  await expect.poll(async () => eventById(await readEvents(page), "roadmap").end).toBe(15 * 60 + 15);
  await page.getByRole("button", { name: "Undo last change" }).click();
  await expect.poll(async () => eventById(await readEvents(page), "roadmap").end).toBe(15 * 60);
});

test("7 protected batch movement is blocked inline without mutation", async ({ page }) => {
  const before = await readEvents(page);
  const lunch = page.locator('[data-event-id="lunch"]');
  const lunchBox = await lunch.boundingBox();
  expect(lunchBox).not.toBeNull();
  const resizeBox = await lunch.locator("..").getByTitle("Resize event").boundingBox();
  expect(resizeBox).not.toBeNull();
  expect(resizeBox!.width).toBeGreaterThanOrEqual(44);
  expect(resizeBox!.height).toBeGreaterThanOrEqual(44);
  const centerX = lunchBox!.x + lunchBox!.width / 2;
  const centerY = lunchBox!.y + lunchBox!.height / 2;
  expect(centerX < resizeBox!.x || centerX > resizeBox!.x + resizeBox!.width).toBe(true);
  expect(centerY < resizeBox!.y || centerY > resizeBox!.y + resizeBox!.height).toBe(true);
  await page.mouse.move(lunchBox!.x + lunchBox!.width / 2, lunchBox!.y + lunchBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(lunchBox!.x + lunchBox!.width / 2, lunchBox!.y + lunchBox!.height / 2 + 20, { steps: 4 });
  await expect(page.getByText("Protected — release to request 12:50 PM")).toBeVisible();
  await page.mouse.up();
  await expect(page.getByText("Move anchored Lunch?")).toBeVisible();
  expect(await readEvents(page)).toEqual(before);
  await page.getByRole("button", { name: "Cancel" }).click();

  await submitRaw(page, "Move every heavy event to 3");
  await expect(page.getByText("Protected time stayed put")).toBeVisible();
  expect(await readEvents(page)).toEqual(before);
  expect(eventById(await readEvents(page), "dinner")).toMatchObject({ start: 19 * 60, protected: true });
});

test("8 split and merge preserve stable identity and undo", async ({ page }) => {
  await submitSuccess(page, "Split deep work into two 30 minute sessions");
  let events = await readEvents(page);
  const parts = events.filter((event) => event.linkedGroup === "group-deep-work");
  expect(parts).toHaveLength(2);
  expect(parts.some((event) => event.id === "deep-work")).toBe(true);
  await expect(page.getByText("Part 1 of 2")).toBeVisible();
  await expect(page.getByText("Part 2 of 2")).toBeVisible();
  expectValid(events, 9);
  await shot(page, "05-split-events.png");
  await page.getByRole("button", { name: "Undo last change" }).click();
  await expect.poll(async () => (await readEvents(page)).length).toBe(8);
  expectValid(await readEvents(page), 8);

  await submitRaw(page, "Combine email and roadmap");
  await expect(page.getByText("Combine Review and respond to email, Planning — Q3 roadmap?")).toBeVisible();
  await page.getByRole("button", { name: "Combine events" }).click();
  await expect(page.getByText("Day reshaped")).toBeVisible();
  events = await readEvents(page);
  expectValid(events, 7);
  expect(eventById(events, "email").end - eventById(events, "email").start).toBe(105);
  await page.getByRole("button", { name: "Undo last change" }).click();
  await expect.poll(async () => (await readEvents(page)).length).toBe(8);
  expectValid(await readEvents(page), 8);
});

test("9 delay recovery moves only future flexible work and keeps Dinner", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-02T13:00:00"));
  await fresh(page);
  const emailBefore = eventById(await readEvents(page), "email");
  await submitSuccess(page, "I'm 35 minutes behind. Keep dinner at seven");
  const events = await readEvents(page);
  expectValid(events, 8);
  expect(eventById(events, "email")).toEqual(emailBefore);
  expect(eventById(events, "roadmap").start).toBe(14 * 60 + 35);
  expect(eventById(events, "dinner").start).toBe(19 * 60);
});

test("10 end boundary blocks impossible anchors and renders a legal boundary", async ({ page }) => {
  await submitRaw(page, "I'm done at six today");
  await expect(page.getByText(/Dinner ends .*after the day boundary.*Finish at 8 PM instead/)).toBeVisible();
  await expect(page.getByText(/Day ends 6 PM/)).toHaveCount(0);
  await page.getByRole("button", { name: "8 PM — closest safe finish" }).click();
  const boundary = page.getByText("Day ends 8 PM");
  await boundary.scrollIntoViewIfNeeded();
  await expect(boundary).toBeVisible();
});

test("11 what-if is non-mutating until Do it", async ({ page }) => {
  await submitRaw(page, "What if I add a 30 minute walk at four?");
  await expect(page.getByText("Preview — nothing committed")).toBeVisible();
  let events = await readEvents(page);
  expect(eventById(events, "walk")).toMatchObject({ start: 16 * 60, preview: true });
  const storedBefore = await page.evaluate(() => localStorage.getItem("flow.life.v3"));
  expect(storedBefore).not.toContain('"id":"walk"');
  await shot(page, "06-what-if.png");
  await submitRaw(page, "Do it");
  await expect(page.getByText("Day reshaped")).toBeVisible();
  events = await readEvents(page);
  expect(eventById(events, "walk").preview).toBe(false);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("flow.life.v3"))).toContain('"id":"walk"');
});

test("12 mobile and reduced-motion surfaces remain complete", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fresh(page);
  const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
  await expect(page.getByRole("textbox", { name: "Tell Flow what to change" })).toBeVisible();
  await expect(page.locator('[data-event-id="roadmap"]')).toContainText("Planning — Q3 roadmap");
  await page.locator('[data-event-id="roadmap"]').focus();
  await page.keyboard.press("Shift+ArrowDown");
  await expect.poll(async () => eventById(await readEvents(page), "roadmap").start).toBe(14 * 60 + 15);
  await shot(page, "08-mobile.png");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await fresh(page);
  await expect(page.getByRole("region", { name: "Scrollable day timeline" })).toHaveAttribute("data-reduced-motion", "true");
  await submitSuccess(page, "Make the 2 PM red");
  expect(eventById(await readEvents(page), "roadmap").color).toBe("red");
  await shot(page, "09-reduced-motion.png");
});

test("13 editing and keyboard parity cover identity, status, and focus", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-02T14:10:00"));
  await fresh(page);
  await submitSuccess(page, "Label roadmap as strategy");
  await expect(page.locator('[data-event-id="roadmap"]')).toContainText("strategy");
  await submitSuccess(page, "Remove strategy label from roadmap");
  await expect(page.locator('[data-event-id="roadmap"]')).not.toContainText("strategy");
  await submitSuccess(page, "Rename roadmap to strategy review");
  await expect(page.locator('[data-event-id="roadmap"]')).toContainText("Strategy review");
  await submitSuccess(page, "Make strategy review heavy");
  await expect(page.locator('[data-event-id="roadmap"]')).toHaveAttribute("data-mobility", "heavy");
  await expect(page.locator('[data-event-id="roadmap"]')).toHaveAttribute("aria-label", /critical importance|normal importance|important importance/);
  await expect(page.locator('[data-event-id="roadmap"]')).toHaveAttribute("aria-label", /heavy mobility, unprotected, planned/);

  const dinner = page.locator('[data-event-id="dinner"]');
  await dinner.focus();
  await page.keyboard.press("Space");
  await expect(page.getByText("Dinner is not current")).toBeVisible();
  await expect(dinner).toHaveAttribute("data-status", "planned");

  const email = page.locator('[data-event-id="email"]');
  await email.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator('[data-event-id="lunch"]')).toBeFocused();

  const roadmap = page.locator('[data-event-id="roadmap"]');
  await roadmap.focus();
  await page.keyboard.press("Space");
  await expect(roadmap).toHaveAttribute("data-status", "active");
  await page.keyboard.press("Space");
  await expect(page.getByLabel("Strategy review completed")).toBeVisible();
  await submitSuccess(page, "Reopen strategy review");
  await expect(page.locator('[data-event-id="roadmap"]')).toHaveAttribute("data-status", "planned");
  await expect(page.getByRole("textbox", { name: "Tell Flow what to change" })).toBeVisible({ timeout: 2_000 });
});

test("14 exact Tide language edits real UI state without selection-only shortcuts", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-02T14:10:00"));
  await fresh(page);
  await submitSuccess(page, "Start roadmap");
  await submitSuccess(page, "Make the active event red");
  await submitSuccess(page, "Make roadmap important");
  await submitSuccess(page, "Make roadmap normal");
  expect(eventById(await readEvents(page), "roadmap")).toMatchObject({ color: "red", importance: "normal", status: "active" });

  await fresh(page);
  await page.locator('[data-event-id="email"]').click();
  await submitSuccess(page, "Add client label to email");
  await submitSuccess(page, "Remove the client label");
  await expect(page.locator('[data-event-id="email"]')).not.toContainText("client");
  await submitSuccess(page, "I need another 20 minutes on this");
  expect(eventById(await readEvents(page), "email").end - eventById(await readEvents(page), "email").start).toBe(65);

  await fresh(page);
  await submitSuccess(page, "Protect lunch and clear two to four");
  await expect(page.getByLabel("Clear time, 120 minutes")).toBeVisible();
  expect(eventById(await readEvents(page), "lunch")).toMatchObject({ protected: true, start: 12 * 60 + 30 });

  await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem("flow.life.v3")!);
    stored.document.calendar.events.push(
      { id: "admin-a", title: "Admin inbox", labels: ["admin"], dateKey: stored.document.calendar.dateKey, start: 600, end: 615, kind: "flexible", priority: "low" },
      { id: "admin-b", title: "Admin notes", labels: ["admin"], dateKey: stored.document.calendar.dateKey, start: 615, end: 630, kind: "flexible", priority: "low" },
      { id: "admin-c", title: "Admin expenses", labels: ["admin"], dateKey: stored.document.calendar.dateKey, start: 630, end: 645, kind: "flexible", priority: "low" },
    );
    localStorage.setItem("flow.life.v3", JSON.stringify(stored));
  });
  await page.reload();
  await submitRaw(page, "Batch all three admin tasks");
  await expect(page.getByText(/Combine Admin inbox, Admin notes, Admin expenses/)).toBeVisible();
  await page.getByRole("button", { name: "Combine events" }).click();
  await expect(page.getByText("Day reshaped")).toBeVisible();
  expect((await readEvents(page)).filter((event) => event.id.startsWith("admin-") || event.title.includes("Admin")).length).toBe(1);
});

test("15 what changed replays natural source-selector geometry", async ({ page }) => {
  await submitSuccess(page, "Move the 2 PM meeting to four");
  await submitRaw(page, "What changed?");
  await expect(page.getByText("What changed")).toBeVisible();
  await expect(page.locator('[data-event-id="roadmap"]')).toHaveAttribute("data-transaction-kind", "move");
  await expect(page.locator('[data-origin-id="roadmap"]')).toHaveCount(0);
  expect(eventById(await readEvents(page), "roadmap")).toMatchObject({ start: 16 * 60, end: 17 * 60 });
});

test("16 bounded split-part placement is atomic in the real command field", async ({ page }) => {
  await submitSuccess(page, "Split deep work into two 45-minute sessions and keep one before lunch");
  const parts = (await readEvents(page)).filter((event) => event.linkedGroup === "group-deep-work");
  expect(parts).toHaveLength(2);
  expect(parts.map((event) => event.end - event.start).sort((left, right) => right - left)).toEqual([45, 45]);
  expect(parts.some((event) => event.id === "deep-work" && event.start === 9 * 60)).toBe(true);
  await page.getByRole("button", { name: "Undo last change" }).click();
  await expect.poll(async () => (await readEvents(page)).length).toBe(8);
  expectValid(await readEvents(page), 8);
});
