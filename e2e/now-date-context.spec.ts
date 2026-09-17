import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { finalSpeech, installAcceptanceRecognition, lifeSnapshot, startAcceptance, typedCommand } from "./real-user-helpers";

const evidence = "artifacts/now-date-qa";
const errors = new WeakMap<Page, { console: string[]; page: string[]; requests: string[] }>();
test.use({ viewport: { width: 1440, height: 900 }, trace: "on" });
test.beforeEach(async ({ page }) => {
  mkdirSync(evidence, { recursive: true });
  const found = { console: [] as string[], page: [] as string[], requests: [] as string[] }; errors.set(page, found);
  page.on("console", (message) => { if (message.type() === "error") found.console.push(message.text()); });
  page.on("pageerror", (error) => found.page.push(error.message));
  page.on("requestfailed", (request) => found.requests.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText}`));
  await page.route("https://api.open-meteo.com/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"daily":{"time":[]}}' }));
  await installAcceptanceRecognition(page);
});
test.afterEach(async ({ page }, info) => {
  const found = errors.get(page)!;
  const state = await lifeSnapshot(page).catch(() => undefined);
  writeFileSync(`${evidence}/journey-${info.title.slice(0, 2)}.json`, JSON.stringify({ title: info.title, status: Object.values(found).some((items) => items.length) ? "failed" : info.status, errors: found, state, recognition: "synthetic final-transcript adapter; physical microphone not tested", weather: "declared offline fixture" }, null, 2));
  expect(found).toEqual({ console: [], page: [], requests: [] });
});

test("01 typed and voice Now queries use today's blocker while browsing future and past, including reload", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-03T19:10:00") });
  await startAcceptance(page, "/today");
  await typedCommand(page, "Capture check passport");
  const scopes = [
    { command: "Show tomorrow", dateKey: "2026-09-04", voice: false },
    { command: "Previous day", dateKey: "2026-09-03", voice: true },
    { command: "Previous day", dateKey: "2026-09-02", voice: true },
  ];
  for (const scope of scopes) {
    await typedCommand(page, scope.command);
    await expect.poll(async () => (await lifeSnapshot(page)).document.calendar.dateKey).toBe(scope.dateKey);
    const before = await lifeSnapshot(page);
    if (scope.voice) await finalSpeech(page, "What fits right now?"); else await typedCommand(page, "What fits right now?");
    await expect(page.getByTestId("now-space")).toHaveAttribute("data-now-date", "2026-09-03");
    await expect(page.getByTestId("now-space")).toContainText("Stay with what is here");
    if (scope.dateKey !== "2026-09-03") await expect(page.getByTestId("now-space")).toContainText("Now · Today");
    await expect(page.locator("[data-flow-feedback]")).toContainText("Keep this space free");
    expect(await lifeSnapshot(page)).toEqual(before);
    await page.screenshot({ path: `${evidence}/now-viewing-${scope.dateKey}.png` });
  }
  await page.reload();
  await expect(page.getByTestId("now-space")).toContainText("Now · Today");
  await expect(page.getByTestId("now-space")).toContainText("Stay with what is here");
  expect((await lifeSnapshot(page)).document.calendar.dateKey).toBe("2026-09-02");
  expect((await lifeSnapshot(page)).past).toHaveLength(1);
});

test("02 Home queried insights update with actual clock and document changes, without query history", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-03T10:15:00") });
  await page.goto("/today");
  await typedCommand(page, "Capture check passport"); await typedCommand(page, "Show tomorrow");
  await typedCommand(page, "Home");
  await expect(page.getByTestId("home-space")).toHaveAttribute("data-home-entrance", "active");
  await typedCommand(page, "What fits right now?");
  const insights = page.getByTestId("locked-home-previews");
  await expect(insights).toContainText("10m triage fits");
  const before = await lifeSnapshot(page);
  await page.clock.setFixedTime(new Date("2026-09-03T11:10:00"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(insights).not.toContainText("10m triage fits");
  expect(await lifeSnapshot(page)).toEqual(before);
  await page.clock.setFixedTime(new Date("2026-09-03T11:50:00"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(insights).toContainText("10m triage fits");
  await typedCommand(page, "Archive all captures");
  await expect(insights).not.toContainText("10m triage fits");
  expect((await lifeSnapshot(page)).past.length).toBe(before.past.length + 1);
  expect((await lifeSnapshot(page)).document.calendar.dateKey).toBe("2026-09-04");
  await page.screenshot({ path: `${evidence}/now-home-after-archive.png` });
});
