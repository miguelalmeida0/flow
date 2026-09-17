import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { useNativeAnimationClock } from "./native-clock";
import { fillCommandField } from "./tide-helpers";
import { startRouteFrameCapture } from "./route-frame-capture";

test.use({ trace: { mode: "on", screenshots: false, snapshots: true, sources: true } });

test("native Home to Today entry preserves readable text and clears Now", async ({ page }) => {
  const directory = "artifacts/route-entry-motion";
  mkdirSync(directory, { recursive: true });
  await useNativeAnimationClock(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.route("https://api.open-meteo.com/**", (route) => route.fulfill({ contentType: "application/json", body: '{"daily":{"time":[]}}' }));
  await page.goto("/");
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await expect(page.getByTestId("home-space")).toBeVisible();
  const wake = await fillCommandField(page, "Home");
  await wake.press("Enter");
  await expect(page.getByTestId("home-space")).toHaveAttribute("data-home-entrance", "active");
  await fillCommandField(page, "Open today");
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter(({ playState }) => playState === "running").length)).toBe(0);
  await page.screenshot({ path: `${directory}/before.png`, animations: "allow", caret: "hide" });
  const capture = await startRouteFrameCapture(page);
  await expect.poll(() => capture.frames.length).toBeGreaterThan(0);
  await capture.submitCommand();
  // Layout projection uses Motion's native rAF renderer, not only WAAPI.
  // Observe the full existing route-entry spring before asserting its settle.
  await page.waitForTimeout(1000);
  await page.waitForFunction(() => document.querySelector('[data-testid="calendar-space"]') && document.getAnimations().every(({ playState }) => playState !== "running"));
  const recorded = await capture.stop();
  const states = recorded.states.filter(({ routeText }) => routeText.some(({ text }) => text === "Breathing Day"));
  const start = states[0]?.now ?? 0;
  const eligible = [...new Map(recorded.frames.filter(({ nativeMs }) => nativeMs >= start - 30 && nativeMs <= start + 900).map((frame) => [frame.nativeMs, frame])).values()].sort((left, right) => left.nativeMs - right.nativeMs);
  const selected = [0, 0.2, 0.4, 0.6, 0.8].map((fraction) => eligible[Math.floor((eligible.length - 1) * fraction)]!);
  selected.forEach((frame, index) => writeFileSync(`${directory}/native-${index}.png`, Buffer.from(frame.data, "base64")));
  writeFileSync(`${directory}/native-route-entry.json`, JSON.stringify({ verdict: states.every(({ routeText }) => routeText.every(({ scaleX, scaleY, overlapsNow }) => Math.abs(scaleX - 1) < 0.02 && Math.abs(scaleY - 1) < 0.02 && !overlapsNow)) ? "PASS" : "FAIL", states, frames: selected.map(({ nativeMs, timestamp }) => ({ nativeMs, timestamp })) }, null, 2));
  expect(states.length).toBeGreaterThan(5);
  for (const { routeText } of states) for (const text of routeText) {
    expect(text.scaleX, `${text.text} horizontal scale`).toBeCloseTo(1, 2);
    expect(text.scaleY, `${text.text} vertical scale`).toBeCloseTo(1, 2);
    expect(text.overlapsNow, `${text.text} must clear Now`).toBe(false);
  }
  expect(new Set(selected.map(({ nativeMs }) => nativeMs)).size).toBe(selected.length);
  await expect(page.getByLabel("Global Flow command")).toHaveAttribute("data-last-transcript", "Open today");
  await expect(page.getByRole("heading", { name: "Breathing Day" })).toBeVisible();
  await page.screenshot({ path: `${directory}/settled.png`, animations: "allow", caret: "hide" });
  expect(recorded.errors).toEqual([]);
});
