import { expect, test, type Page } from "@playwright/test";
import { contextualCalendarFixture } from "../src/test/contextualCalendarFixture";
import { finalSpeech, installAcceptanceRecognition, interimSpeech, lifeSnapshot, typedCommand } from "./real-user-helpers";

const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const found: string[] = []; errors.set(page, found);
  page.on("pageerror", (error) => found.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") found.push(message.text()); });
  await page.clock.setFixedTime(new Date("2026-09-08T08:00:00"));
  await installAcceptanceRecognition(page);
  await page.addInitScript((snapshot) => {
    if (!sessionStorage.getItem("contextual-fixture-installed")) {
      localStorage.setItem("flow.life.v3", JSON.stringify(snapshot));
      sessionStorage.setItem("contextual-fixture-installed", "true");
    }
  }, contextualCalendarFixture());
  await page.goto("/today");
  await expect(page.getByTestId("week-calendar")).toBeVisible();
  await expect(page.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "listening");
});
test.afterEach(async ({ page }, info) => {
  await info.attach("browser-errors", { body: JSON.stringify(errors.get(page)), contentType: "application/json" });
  expect(errors.get(page)).toEqual([]);
});

for (const width of [430, 1440]) test(`typed Wednesday move, live interim, geometry, history and reload at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  if (width === 430) await page.emulateMedia({ reducedMotion: "reduce" });
  const before = await lifeSnapshot(page);
  const creative = page.locator('[data-week-event-id="creative-wed"]');
  await typedCommand(page, "change the creative Review to 2pm");
  const feedback = page.locator("[data-flow-feedback]");
  await expect(feedback).toContainText("fixed or protected");
  await expect(feedback).toContainText("Wednesday, Sep 9");
  await expect(creative).toHaveAttribute("data-start", "960");
  await interimSpeech(page, "go ahead");
  await expect(page.getByLabel("Tell Flow what to change")).toHaveValue("go ahead");
  await expect(feedback).toHaveAttribute("data-feedback-phase", "confirmation");
  await expect(feedback).toContainText("2 PM");
  await page.screenshot({ path: info.outputPath("anchored-confirmation.png"), fullPage: true });
  await typedCommand(page, "go ahead");
  await expect(creative).toHaveAttribute("data-start", "840");
  await expect(creative).toHaveAttribute("data-end", "900");
  const geometry = await creative.evaluate((element) => ({ top: element.getBoundingClientRect().top - element.parentElement!.getBoundingClientRect().top, height: element.getBoundingClientRect().height }));
  expect(geometry.top).toBeCloseTo(420, 0); expect(geometry.height).toBeCloseTo(60, 0);
  await expect.poll(async () => (await lifeSnapshot(page)).past.length).toBe(1);
  const after = await lifeSnapshot(page);
  await typedCommand(page, "Undo");
  expect((await lifeSnapshot(page)).document).toEqual(before.document);
  await typedCommand(page, "Redo");
  expect((await lifeSnapshot(page)).document).toEqual(after.document);
  await page.reload();
  await expect(page.locator('[data-week-event-id="creative-wed"]')).toHaveAttribute("data-start", "840");
  expect((await lifeSnapshot(page)).document).toEqual(after.document);
  await page.screenshot({ path: info.outputPath("moved-wednesday.png"), fullPage: true });
});

test("final voice transcript understands Wednesday lunch and dated review clarification", async ({ page }, info) => {
  await finalSpeech(page, "cancel the lunch at Wednesday", true);
  const feedback = page.locator("[data-flow-feedback]");
  await expect(feedback).toHaveAttribute("data-feedback-phase", "confirmation");
  await expect(feedback).toContainText("Wednesday, Sep 9");
  await expect(page.locator('[data-week-event-id="lunch-wed"]')).toHaveCount(1);
  await finalSpeech(page, "confirm removal");
  await expect(page.locator('[data-week-event-id="lunch-wed"]')).toHaveCount(0);
  await expect(page.locator('[data-week-event-id="lunch-tue"]')).toHaveCount(1);
  expect((await lifeSnapshot(page)).past).toHaveLength(1);
  await finalSpeech(page, "Undo");
  await finalSpeech(page, "cancel the review meeting from 11:00 a.m.");
  await expect(feedback).toHaveAttribute("data-feedback-phase", "clarification");
  await expect(page.getByRole("button", { name: /email.*Tuesday, Sep 8.*11 AM/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /email.*Wednesday, Sep 9.*11 AM/ })).toBeVisible();
  await page.screenshot({ path: info.outputPath("dated-clarification.png"), fullPage: true });
  await finalSpeech(page, "the Wednesday one");
  await expect(feedback).toHaveAttribute("data-feedback-phase", "confirmation");
  await expect(feedback).toContainText("Wednesday, Sep 9");
  await finalSpeech(page, "yes");
  await expect(page.locator('[data-week-event-id="email-wed"]')).toHaveCount(0);
  await expect(page.locator('[data-week-event-id="email-tue"]')).toHaveCount(1);
});

test("failed replacement cannot authorize a stale anchored move", async ({ page }) => {
  const before = await lifeSnapshot(page);
  await typedCommand(page, "change the creative Review to 2pm");
  await expect(page.getByRole("button", { name: "Move anyway" })).toBeVisible();
  await typedCommand(page, "Cancel the nonexistent meeting");
  await expect(page.getByRole("button", { name: "Move anyway" })).toHaveCount(0);
  await typedCommand(page, "yes");
  await expect(page.locator("[data-flow-feedback]")).toContainText("Nothing to confirm");
  expect((await lifeSnapshot(page)).document).toEqual(before.document);
  expect((await lifeSnapshot(page)).past).toEqual(before.past);
});
