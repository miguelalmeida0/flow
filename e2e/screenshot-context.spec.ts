import { expect, test } from "@playwright/test";
import { contextualCalendarFixture } from "../src/test/contextualCalendarFixture";
import { installAcceptanceRecognition, lifeSnapshot, typedCommand } from "./real-user-helpers";

for (const width of [430, 1440]) test(`actual command field reveals the booked date/time and preserves literal capture at ${width}px`, async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message)); page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.setViewportSize({ width, height: 900 }); if (width === 430) await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.setFixedTime(new Date("2026-09-12T12:00:00")); await installAcceptanceRecognition(page);
  const fixture = contextualCalendarFixture(); fixture.temporal!.todayDateKey = "2026-09-12";
  await page.addInitScript(snapshot => { if (!sessionStorage.getItem("screenshot-fixture")) { localStorage.setItem("flow.life.v3", JSON.stringify(snapshot)); sessionStorage.setItem("screenshot-fixture", "true"); } }, fixture);
  await page.goto("/today"); await expect(page.getByTestId("week-calendar")).toBeVisible();
  await typedCommand(page, "Book an8:00 a.m. meeting on Wednesday called Dentist");
  const dentist = page.getByRole("button", { name: /Dentist, 8 AM.*Wed, Sep 16/ }); await expect(dentist).toBeVisible(); await expect(dentist).toHaveAttribute("data-start", "480");
  await typedCommand(page, "Book a gym session at17pm onTuesday");
  const gym = page.getByRole("button", { name: /gym session, 5 PM.*Tue, Sep 15/i }); await expect(gym).toBeVisible();
  await expect.poll(() => gym.evaluate(element => { const card = element.getBoundingClientRect(), main = document.querySelector("[data-primary-content-rect]")!.getBoundingClientRect(); return card.top >= main.top && card.bottom <= main.bottom; })).toBe(true);
  expect((await lifeSnapshot(page)).past).toHaveLength(2); const beforeReload = await lifeSnapshot(page);
  await page.screenshot({ path: info.outputPath("booked-time-visible.png") }); await page.reload(); expect((await lifeSnapshot(page)).document).toEqual(beforeReload.document);
  await typedCommand(page, "Open Friends"); await typedCommand(page, "Capture that"); await expect(page.locator("[data-flow-feedback]")).toContainText("What should I capture?");
  await typedCommand(page, "I can come, actually cancel lunch please"); expect((await lifeSnapshot(page)).document.captures.at(-1)?.title).toBe("I can come, actually cancel lunch please");
  await info.attach("browser-errors", { body: JSON.stringify(errors), contentType: "application/json" }); expect(errors).toEqual([]);
});
