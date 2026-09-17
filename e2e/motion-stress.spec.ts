import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { fillCommandField } from "./tide-helpers";

const evidenceDir = "artifacts/living-environment-release";

// Playwright trace capture takes a full DOM snapshot and JPEG around every
// action. Those recorder tasks execute while the flight is active and are
// indistinguishable from product work to PerformanceObserver. This test writes
// durable metrics of its own and keeps every product threshold; all functional
// release tests retain failure traces.
test.use({ trace: "off" });

async function interruptFlightFromThePage(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const deadline = performance.now() + 2_000;
    const probe = () => {
      const clone = document.querySelector("[data-transition-clone-count='1']");
      const undo = document.querySelector<HTMLButtonElement>('button[aria-label="Undo last change"]');
      if (clone && undo) {
        undo.click();
        requestAnimationFrame(() => resolve());
        return;
      }
      if (performance.now() >= deadline) {
        reject(new Error("The semantic flight did not mount within 2 seconds."));
        return;
      }
      requestAnimationFrame(probe);
    };
    requestAnimationFrame(probe);
  }));
}

test("20 interrupted morph cycles leave no clone or listener growth", async ({ page }) => {
  test.setTimeout(60_000);
  const diagnosticAttribution = process.env.FLOW_ATTRIBUTION_MOTION === "1";
  if (diagnosticAttribution) await page.addInitScript(() => {
    const runtime = window as Window & { __FLOW_LEGACY_PHASE__?: string; __FLOW_LEGACY_TASKS__?: unknown[] };
    runtime.__FLOW_LEGACY_TASKS__ = [];
    for (const type of ["longtask", "long-animation-frame"]) {
      if (!PerformanceObserver.supportedEntryTypes.includes(type)) continue;
      new PerformanceObserver((list) => list.getEntries().forEach((entry) => runtime.__FLOW_LEGACY_TASKS__!.push({ phase: runtime.__FLOW_LEGACY_PHASE__, entry: entry.toJSON() }))).observe({ type });
    }
  });
  const browserErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  mkdirSync(evidenceDir, { recursive: true });
  await page.goto("/inbox");
  let input = await fillCommandField(page, "Capture Renew passport before Senegal");
  await input.press("Enter");
  await expect(page.getByText("“Capture Renew passport before Senegal”").last()).toBeVisible();

  for (let index = 0; index < 20; index += 1) {
    if (diagnosticAttribution) await page.evaluate((cycle) => { (window as Window & { __FLOW_LEGACY_PHASE__?: string }).__FLOW_LEGACY_PHASE__ = `cycle-${cycle + 1}`; }, index);
    await page.getByRole("button", { name: "Renew passport before Senegal", exact: true }).click();
    input = await fillCommandField(page, "Turn that into a plan");
    await input.press("Enter");
    // Observe and interrupt inside one rAF-driven page probe. Repeated
    // Playwright visibility snapshots while the observer is active would be
    // measured as application work even though they are recorder overhead.
    await interruptFlightFromThePage(page);
    await expect(page.locator("[data-transition-clone-count]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Renew passport before Senegal", exact: true })).toBeVisible();
    await expect(page.getByLabel("Global Flow command")).toHaveAttribute("data-last-transcript", "Turn that into a plan");
  }

  const metrics = await page.evaluate(() => (window as Window & { __FLOW_MOTION__?: { activeClones: number; activeFrameLoops: number; peakClones: number; completedTransitions: number; durationsMs: number[]; longestMainThreadTaskMs: number; droppedFrameEstimate: number } }).__FLOW_MOTION__!);
  if (diagnosticAttribution) writeFileSync(`${evidenceDir}/legacy-native-attribution.json`, `${JSON.stringify(await page.evaluate(() => (window as Window & { __FLOW_LEGACY_TASKS__?: unknown[] }).__FLOW_LEGACY_TASKS__), null, 2)}\n`);
  const sorted = [...metrics.durationsMs].sort((left, right) => left - right);
  const thresholds = { maxClones: 1, minCompletedTransitions: 20, maxMedianDurationMs: 1250, maxLongestMainThreadTaskMs: 50, maxDroppedFrames: 20 };
  const medianDurationMs = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const passed = metrics.activeClones === 0 && metrics.activeFrameLoops === 0
    && metrics.peakClones <= thresholds.maxClones && metrics.completedTransitions >= thresholds.minCompletedTransitions
    && medianDurationMs <= thresholds.maxMedianDurationMs && metrics.longestMainThreadTaskMs <= thresholds.maxLongestMainThreadTaskMs
    && metrics.droppedFrameEstimate <= thresholds.maxDroppedFrames && browserErrors.length === 0;
  writeFileSync(`${evidenceDir}/motion-stress.json`, `${JSON.stringify({ ...metrics, medianDurationMs, thresholds, browserErrors, passed }, null, 2)}\n`);

  expect(metrics).toMatchObject({ activeClones: 0, activeFrameLoops: 0, peakClones: 1 });
  // React StrictMode intentionally probes the flight effect in development,
  // so one visible cycle can produce two completed measurement windows. The
  // release contract is at least one clean completion per requested cycle.
  expect(metrics.completedTransitions).toBeGreaterThanOrEqual(thresholds.minCompletedTransitions);
  expect(medianDurationMs).toBeLessThanOrEqual(thresholds.maxMedianDurationMs);
  expect(metrics.longestMainThreadTaskMs).toBeLessThanOrEqual(thresholds.maxLongestMainThreadTaskMs);
  expect(metrics.droppedFrameEstimate).toBeLessThanOrEqual(thresholds.maxDroppedFrames);
  expect(browserErrors).toEqual([]);
});
