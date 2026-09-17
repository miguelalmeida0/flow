import { expect, test } from "@playwright/test";
import { pageFocusFixture } from "../src/test/pageFocusFixture";
import { installAcceptanceRecognition, lifeSnapshot, typedCommand } from "./real-user-helpers";

for (const width of [430, 1440]) test(`opens real working surfaces and preserves manual orientation at ${width}px`, async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message)); page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.setViewportSize({ width, height: 740 }); if (width === 430) await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.setFixedTime(new Date("2026-09-12T10:00:00Z")); await installAcceptanceRecognition(page);
  await page.addInitScript((fixture) => { if (!localStorage.getItem("page-focus-fixture")) { localStorage.setItem("flow-life-environment-v1", JSON.stringify(fixture)); localStorage.setItem("page-focus-fixture", "true"); } }, pageFocusFixture());
  const fits = async (selector: string) => page.locator(selector).evaluate((element) => {
    const rect = element.getBoundingClientRect(), main = document.querySelector("[data-primary-content-rect]")!.getBoundingClientRect(); return rect.top >= main.top && rect.bottom <= main.bottom;
  });
  await page.goto("/people"); await expect.poll(() => fits('[aria-label="Friend name"]')).toBe(true); const before = await lifeSnapshot(page);
  await page.getByRole("button", { name: /Sarah.*open commitments/ }).click(); await expect.poll(() => fits("#friend-message")).toBe(true);
  await expect(page.getByText("Message to Sarah", { exact: true })).toBeVisible();
  await typedCommand(page, "Open memory Morning"); await expect.poll(() => fits('[data-page-task="memory"] [data-action-id="memory.composition"]:first-of-type')).toBe(true);
  await page.getByLabel("Current memory").selectOption("memory-1"); await expect(page.getByRole("heading", { name: "Evening", exact: true })).toBeVisible();
  await expect.poll(() => fits('[data-page-task="memory"] [data-action-id="memory.composition"]:first-of-type')).toBe(true);
  await typedCommand(page, "Scroll down"); const position = await page.locator("[data-primary-content-rect]").evaluate((element) => element.scrollTop);
  await typedCommand(page, "Pause"); await expect.poll(() => page.locator("[data-primary-content-rect]").evaluate((element) => element.scrollTop)).toBe(position);
  expect((await lifeSnapshot(page)).document).toEqual(before.document); expect((await lifeSnapshot(page)).past).toEqual(before.past);
  await page.reload(); await expect.poll(() => fits('[data-page-task="memory"] [data-action-id="memory.composition"]:first-of-type')).toBe(true);
  await info.attach("browser-errors", { body: JSON.stringify(errors), contentType: "application/json" }); expect(errors).toEqual([]);
});
