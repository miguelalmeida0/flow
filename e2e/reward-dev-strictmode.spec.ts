import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { useNativeAnimationClock } from "./native-clock";
import { command, signatures } from "./reward-signatures";
import { fillCommandField } from "./tide-helpers";
import { armNativeInterruption, installDevelopmentProbe, readDevelopmentProbe, readInterruption, readSettledPresentation } from "./development-reward-probe";

const results: unknown[] = [];
const browserConsoleErrors: string[] = [], pageErrors: string[] = [], failedRequests: string[] = [];
const evidenceDir = process.env.FLOW_MOTION_EVIDENCE_DIR ?? "artifacts/visual-reward-debug/unscoped-development";
const destinations: Record<string, string> = { "/today": "Open today", "/focus": "Open focus", "/outcomes": "Open outcomes", "/people?view=commitments": "Open commitments", "/capture": "Open capture" };
test.beforeAll(() => mkdirSync(evidenceDir, { recursive: true }));
test.afterAll(() => writeFileSync(`${evidenceDir}/development-signatures.json`, `${JSON.stringify({
  verdict: results.length === 12 && !browserConsoleErrors.length && !pageErrors.length && !failedRequests.length ? "PASS" : "FAIL",
  runtime: "Vite development React with observed StrictEffectsMode and native strict probes",
  expectedSignatures: signatures.map(({ id }) => id), expectedModes: ["full", "reduced"], results,
  browserConsoleErrors, pageErrors, failedRequests, timestamp: new Date().toISOString(),
}, null, 2)}\n`));

for (const mode of ["full", "reduced"] as const) for (const signature of signatures) {
  test(`development StrictMode ${signature.id} ${mode} survives native interruption and exact history`, async ({ page }) => {
    await useNativeAnimationClock(page);
    await installDevelopmentProbe(page);
    page.on("console", (message) => { if (message.type() === "error") browserConsoleErrors.push(message.text()); });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request) => { if (request.url().startsWith("http://127.0.0.1:5174") && ["document", "script", "stylesheet", "fetch", "xhr"].includes(request.resourceType())) failedRequests.push(request.url()); });
    await page.route("https://api.open-meteo.com/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"daily":{"time":[]}}' }));
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await page.evaluate((motion) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem("flow:reward-preferences:v1", JSON.stringify({ motion, sound: false, mascot: "minimal" }));
    }, mode);
    await page.reload();
    await expect(page.locator("[data-space-shell]")).toBeVisible();
    const runtimeBefore = await readDevelopmentProbe(page);
    expect(runtimeBefore).toMatchObject({ bundleType: 1, strictEffectsMode: true });
    expect(runtimeBefore.strictProbes).toBeGreaterThan(0);
    if (destinations[signature.path]) await command(page, destinations[signature.path]!);
    await signature.setup(page);
    await expect.poll(() => readSettledPresentation(page)).toMatchObject({
      reward: { active: false }, motion: { activeClones: 0, activeFrameLoops: 0 }, animations: 0,
    });
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!) as { document: unknown; past: unknown[] });
    const temporal = signature.id === "time-travel";
    await fillCommandField(page, signature.transcript);
    await armNativeInterruption(page, temporal);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r", unmodifiedText: "\r" });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await cdp.detach();
    await expect.poll(() => readInterruption(page)).toMatchObject({ active: true, controlFound: true, reduced: mode === "reduced" });
    const interruption = (await readInterruption(page))!;
    expect(interruption.sequence).toBe(interruption.beforeSequence + 1);
    expect(interruption.after.past).toHaveLength(before.past.length + (temporal ? 0 : 1));
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).document)).toEqual(before.document);
    if (temporal) {
      await expect(page.getByTestId("home-space")).toContainText(/Friday, September 4/i);
      // The persisted calendar field is the active-day projection; all stored
      // calendars/entities stay exact, and returning Today restores the mirror.
      const { calendar: afterProjection, ...afterEntities } = interruption.after.document as Record<string, unknown>;
      const { calendar: beforeProjection, ...beforeEntities } = before.document as Record<string, unknown>;
      expect(afterProjection).toMatchObject({ dateKey: "2026-09-05" });
      expect(beforeProjection).toMatchObject({ dateKey: "2026-09-04" });
      expect(afterEntities).toEqual(beforeEntities);
    } else {
      await command(page, "Redo");
      await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).document)).toEqual(interruption.after.document);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
    await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
    await command(page, "Home");
    await expect(page.getByTestId("home-space")).toBeVisible();
    await command(page, "Invent a purple dimension");
    await page.waitForTimeout(900);
    const settled = await readSettledPresentation(page);
    expect(settled).toMatchObject({ reward: { active: false, animationCount: 0, transitionClones: 0 }, motion: { activeClones: 0, activeFrameLoops: 0 }, sound: { contextsCreated: 0, activeNodes: 0 }, animations: 0, residue: 0 });
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!) as { document: unknown; past: unknown[]; future: unknown[] });
    expect(after.document).toEqual(temporal ? before.document : interruption.after.document);
    expect(after.past).toHaveLength(interruption.after.past.length);
    expect(after.future).toHaveLength(0);
    const runtimeAfter = await readDevelopmentProbe(page);
    expect(runtimeAfter.strictProbes).toBeGreaterThan(runtimeBefore.strictProbes);
    expect(browserConsoleErrors).toEqual([]); expect(pageErrors).toEqual([]); expect(failedRequests).toEqual([]);
    results.push({ signature: signature.id, mode, verdict: "PASS", runtimeBefore, runtimeAfter, interruption, exactUndoRedo: !temporal, temporalNoMutation: temporal, settled });
  });
}
