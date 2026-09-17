import { expect, test } from "@playwright/test";
import { fillCommandField } from "./tide-helpers";

test("Home date travel is native, bounded, and independent from exact history", async ({ page }, info) => {
  await page.route("https://api.open-meteo.com/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"daily":{"time":[]}}' }));
  await page.goto("/");
  let field = await fillCommandField(page, "Home");
  await field.press("Enter");
  await expect(page.getByTestId("home-space")).toHaveAttribute("data-home-entrance", "active");
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter(({ playState }) => playState === "running").length)).toBe(0);
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!));
  field = await fillCommandField(page, "Tomorrow");
  await page.evaluate(() => {
    const observations: unknown[] = [];
    const started = performance.now();
    const tick = () => {
      const scene = document.querySelector<HTMLElement>("[data-home-date-scene]");
      if (scene) observations.push({ at: performance.now(), scope: scene.dataset.homeDateKey, opacity: getComputedStyle(scene).opacity, transform: getComputedStyle(scene).transform, animations: scene.getAnimations().map((animation) => ({ startTime: animation.startTime, duration: animation.effect?.getComputedTiming().duration, currentTime: animation.currentTime, playState: animation.playState })) });
      if (performance.now() - started < 1800) requestAnimationFrame(tick);
    };
    (window as Window & { __dateSceneObservations?: unknown[] }).__dateSceneObservations = observations;
    requestAnimationFrame(tick);
  });
  await field.press("Enter");
  await expect(page.getByLabel("Global Flow command")).toHaveAttribute("data-last-transcript", "Tomorrow");
  await page.waitForTimeout(1800);
  const observations = await page.evaluate(() => (window as Window & { __dateSceneObservations?: Array<{ at: number; opacity: string; transform: string; animations: Array<{ duration: number; startTime: number | null }> }> }).__dateSceneObservations ?? []);
  await info.attach("native-date-scene-observations", { body: JSON.stringify(observations, null, 2), contentType: "application/json" });
  expect(observations.some(({ animations }) => animations.some(({ duration, startTime }) => duration === 480 && typeof startTime === "number")), "the authored date owner must expose its real 480ms native animation").toBe(true);
  expect(new Set(observations.map(({ opacity, transform }) => `${opacity}/${transform}`)).size).toBeGreaterThan(3);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!));
  expect(after.past).toEqual(before.past);
  expect(after.future).toEqual(before.future);
  await expect(page.locator("[data-home-date-scene]")).toHaveCSS("opacity", "1");
  await page.emulateMedia({ reducedMotion: "reduce" });
  field = await fillCommandField(page, "Previous day");
  await field.press("Enter");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).temporal.scope.dateKey)).toBe(before.temporal.scope.dateKey);
  await expect.poll(() => page.locator("[data-home-date-scene]").evaluate((element) => element.getAnimations().filter(({ playState }) => playState === "running").length)).toBe(0);
  await expect(page.locator("[data-home-date-scene]")).toHaveCSS("opacity", "1");
});
