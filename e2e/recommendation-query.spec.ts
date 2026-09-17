import { expect, test } from "@playwright/test";
import { useNativeAnimationClock } from "./native-clock";
import { command, committedCommand } from "./reward-signatures";

test("what am I forgetting returns real recommendations from every world without writing data", async ({ page }) => {
  await useNativeAnimationClock(page, "2026-09-04T10:15:00");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("https://api.open-meteo.com/**", (route) => route.fulfill({ contentType: "application/json", body: '{"daily":{"time":[]}}' }));
  await page.goto("/");
  await committedCommand(page, "Capture check passport expiry");
  for (const route of ["Home", "Open today", "Open focus", "Open weather", "Open people", "Open good to know", "Open capture", "Open outcomes"]) {
    await command(page, route);
    const before = await page.evaluate(() => localStorage.getItem("flow.life.v3"));
    await command(page, "What am I forgetting?");
    const feedback = page.locator('[data-flow-feedback][data-feedback-phase="completed"]');
    await expect(feedback).toContainText("Check passport expiry");
    await expect(feedback).toContainText("10m triage fits");
    expect(await page.evaluate(() => localStorage.getItem("flow.life.v3"))).toBe(before);
    await command(page, "Invent a purple dimension");
    await expect(page.locator('[data-flow-feedback][data-feedback-phase="error"]')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("flow.life.v3"))).toBe(before);
  }
  expect(errors).toEqual([]);
});
