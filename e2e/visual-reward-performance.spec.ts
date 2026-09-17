import { expect, test, type Page } from "@playwright/test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fillCommandField } from "./tide-helpers";
import { useNativeAnimationClock } from "./native-clock";
import { command, committedCommand, signatures } from "./reward-signatures";

const evidenceRoot = process.env.FLOW_MOTION_EVIDENCE_DIR ?? "artifacts/visual-reward-debug/unscoped-performance";
const consoleErrors: string[] = [];
const pageErrors: string[] = [];
const failedRequests: string[] = [];
const rewardPreferencesKey = "flow:reward-preferences:v1";

async function prepare(page: Page) {
  await page.goto("/today");
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await page.waitForFunction(() => document.readyState === "complete" && document.fonts.status === "loaded");
  await expect(page.locator("[data-space-shell]")).toBeVisible();
}

async function setSensoryMode(page: Page, motion: "full" | "reduced", mascot: "helpful" | "minimal") {
  await page.getByRole("button", { name: "Reward and motion settings" }).click();
  await page.getByRole("radio", { name: motion === "full" ? "Full" : "Reduced" }).click();
  await page.getByRole("radio", { name: mascot === "helpful" ? "Helpful" : "Minimal" }).click();
  await expect(page.getByRole("button", { name: "Off" })).toHaveAttribute("aria-pressed", "false");
}

type StressMode = "full-normal" | "reduced-normal" | "full-throttled" | "reduced-throttled";

async function prepareSignatureMode(page: Page, mode: StressMode) {
  const reduced = mode.startsWith("reduced");
  const minimal = reduced || mode === "full-throttled";
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/today");
  await page.evaluate(({ key, motion, mascot }) => {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem(key, JSON.stringify({ motion, sound: false, mascot }));
  }, { key: rewardPreferencesKey, motion: reduced ? "reduced" : "full", mascot: minimal ? "minimal" : "helpful" });
  await page.reload();
  await page.waitForFunction(() => document.readyState === "complete" && document.fonts.status === "loaded");
  await expect(page.locator("[data-space-shell]")).toBeVisible();
  const settings = page.getByRole("button", { name: "Reward and motion settings" });
  await settings.click();
  await expect(page.getByRole("button", { name: "Off" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("radio", { name: reduced ? "Reduced" : "Full" })).toBeChecked();
  await expect(page.getByRole("radio", { name: minimal ? "Minimal" : "Helpful" })).toBeChecked();
  await expect(page.getByRole("region", { name: "Scrollable day timeline" })).toHaveAttribute("data-reduced-motion", String(reduced));
  await settings.click();
  return page.evaluate(() => localStorage.getItem("flow.life.v3")!);
}

const routeCommands: Record<string, string> = {
  "/": "Home", "/today": "Open today", "/focus": "Open focus", "/outcomes": "Open outcomes",
  "/people?view=commitments": "Open commitments", "/capture": "Open capture",
};
const routeTestIds: Record<string, string> = {
  "/": "home-space", "/today": "calendar-space", "/focus": "focus-space", "/outcomes": "plans-space",
  "/people?view=commitments": "people-space", "/capture": "inbox-space",
};

async function resetSignature(page: Page, baseline: string, path: string) {
  await page.evaluate(({ key, baselineSnapshot }) => {
    const current = JSON.parse(localStorage.getItem(key) ?? "null");
    const next = JSON.parse(baselineSnapshot);
    next.revision = (current?.revision ?? 0) + 1;
    const serialized = JSON.stringify(next);
    localStorage.setItem(key, serialized);
    window.dispatchEvent(new StorageEvent("storage", { key, newValue: serialized }));
  }, { key: "flow.life.v3", baselineSnapshot: baseline });
  await command(page, routeCommands[path]!);
  await expect(page.getByTestId(routeTestIds[path]!)).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo last change" })).toBeDisabled();
}

async function historyCounts(page: Page) {
  return page.evaluate(() => {
    const snapshot = JSON.parse(localStorage.getItem("flow.life.v3") ?? "null");
    return { past: snapshot?.past?.length ?? 0, future: snapshot?.future?.length ?? 0, revision: snapshot?.revision ?? 0 };
  });
}

async function exerciseImmediateHistory(page: Page) {
  const afterAction = await historyCounts(page);
  const undoField = await fillCommandField(page, "Undo");
  await undoField.press("Enter");
  await expect.poll(() => historyCounts(page)).toMatchObject({ past: afterAction.past - 1, future: 1 });
  const redoField = await fillCommandField(page, "Redo");
  await redoField.press("Enter");
  await expect.poll(() => historyCounts(page)).toMatchObject({ past: afterAction.past, future: 0 });
}

async function settleSignature(page: Page) {
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
  await command(page, "Home");
  await expect(page.getByTestId("home-space")).toBeVisible();
  await command(page, "Open today");
  await expect(page.getByTestId("calendar-space")).toBeVisible();
  const revision = (await historyCounts(page)).revision;
  await command(page, "Invent a purple dimension");
  await expect.poll(() => historyCounts(page)).toMatchObject({ revision });
  await page.waitForTimeout(900);
  const settled = await page.evaluate(() => {
    const reward = (window as Window & { __FLOW_REWARD__?: { active: boolean; animationCount: number; transitionClones: number; mascotState: string } }).__FLOW_REWARD__!;
    const motion = (window as Window & { __FLOW_MOTION__?: { activeClones: number; activeFrameLoops: number } }).__FLOW_MOTION__ ?? { activeClones: 0, activeFrameLoops: 0 };
    const sound = (window as Window & { __FLOW_SOUND__?: { contextsCreated: number; activeNodes: number } }).__FLOW_SOUND__ ?? { contextsCreated: 0, activeNodes: 0 };
    return {
      reward, motion, sound,
      animations: document.getAnimations().filter(({ playState }) => playState === "running").length,
      runningAnimationDetails: document.getAnimations().filter(({ playState }) => playState === "running").map((animation) => {
        const effect = animation.effect as KeyframeEffect | null;
        const target = effect?.target as HTMLElement | null;
        return {
          target: target?.outerHTML.slice(0, 800), connected: target?.isConnected,
          currentTime: animation.currentTime, startTime: animation.startTime, playbackRate: animation.playbackRate,
          timing: effect?.getComputedTiming(), keyframes: effect?.getKeyframes(),
          documentTime: document.timeline.currentTime, performanceTime: performance.now(),
        };
      }),
      residue: document.querySelectorAll("[data-transition-clone-count], [data-reward-wash], [data-reward-target]").length,
    };
  });
  if (settled.animations > 0) writeFileSync(`${evidenceRoot}/unsettled-animation-diagnostics.json`, `${JSON.stringify(settled, null, 2)}\n`);
  expect(settled).toMatchObject({
    reward: { active: false, animationCount: 0, transitionClones: 0, mascotState: "resting" },
    motion: { activeClones: 0, activeFrameLoops: 0 }, sound: { contextsCreated: 0, activeNodes: 0 }, animations: 0, residue: 0,
  });
}

test.beforeEach(async ({ page }) => {
  // Shift domain dates only, preserving elapsed wall time for cooldowns. Even
  // Playwright's setFixedTime installs simulated rAF/performance clocks in this
  // runtime; those drift from native WAAPI after reloads and invalidate both
  // the settle assertion and the frame-time measurement.
  await useNativeAnimationClock(page);
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    if (request.url().startsWith("http://127.0.0.1:5176") && ["document", "script", "stylesheet", "fetch", "xhr"].includes(request.resourceType())) failedRequests.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText ?? "unknown"}`);
  });
  await page.route("https://api.open-meteo.com/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"daily":{"time":[]}}' }));
});

test.afterAll(() => {
  const path = `${evidenceRoot}/browser-evidence.json`;
  const previous = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) as { consoleErrors?: string[]; pageErrors?: string[]; failedRequests?: string[] } : {};
  writeFileSync(path, `${JSON.stringify({
    consoleErrors: [...new Set([...(previous.consoleErrors ?? []), ...consoleErrors])],
    pageErrors: [...new Set([...(previous.pageErrors ?? []), ...pageErrors])],
    failedRequests: [...new Set([...(previous.failedRequests ?? []), ...failedRequests])],
  }, null, 2)}\n`);
});

test("20 interrupted production cycles leave motion, audio, listeners, and DOM settled", async ({ page }) => {
  test.setTimeout(120_000);
  await prepare(page);
  const cdp = await page.context().newCDPSession(page);
  const diagnosticProfile = process.env.FLOW_PROFILE_MOTION === "1";
  const diagnosticAttribution = process.env.FLOW_ATTRIBUTION_MOTION === "1";
  if (diagnosticAttribution) await page.evaluate(() => {
    const runtime = window as Window & { __FLOW_FRAME_ATTRIBUTION__?: unknown[]; __FLOW_LOCAL_MOTION_AUDIT__?: { phase: string } };
    runtime.__FLOW_FRAME_ATTRIBUTION__ = [];
    if (!PerformanceObserver.supportedEntryTypes.includes("long-animation-frame")) return;
    new PerformanceObserver((list) => list.getEntries().forEach((entry) => runtime.__FLOW_FRAME_ATTRIBUTION__!.push({ phase: runtime.__FLOW_LOCAL_MOTION_AUDIT__?.phase, entry: entry.toJSON() }))).observe({ type: "long-animation-frame" });
  });
  if (diagnosticProfile) {
    await page.evaluate(() => {
      const runtime = window as Window & { __FLOW_INTL_COUNTS__?: Record<string, Record<string, number>>; __FLOW_LOCAL_MOTION_AUDIT__?: { phase: string } };
      const counts: Record<string, Record<string, number>> = {};
      runtime.__FLOW_INTL_COUNTS__ = counts;
      Intl.DateTimeFormat = new Proxy(Intl.DateTimeFormat, {
        construct(target, argumentsList, newTarget) {
          const configuration = JSON.stringify(argumentsList);
          const phase = runtime.__FLOW_LOCAL_MOTION_AUDIT__?.phase ?? "setup";
          const phases = counts[configuration] ??= {};
          phases[phase] = (phases[phase] ?? 0) + 1;
          return Reflect.construct(target, argumentsList, newTarget);
        },
      });
    });
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 1_000 });
    await cdp.send("Profiler.start");
  }
  await cdp.send("HeapProfiler.collectGarbage");
  const before = await cdp.send("Memory.getDOMCounters");
  await page.evaluate(() => {
    const audit = {
      frameDeltas: [] as number[], framePhases: [] as string[], throttledFrameDeltas: [] as number[], throttledFramePhases: [] as string[],
      modeFrames: { "full-normal": [] as number[], "reduced-normal": [] as number[], "full-throttled": [] as number[], "reduced-throttled": [] as number[] },
      modeLongTasks: { "full-normal": [] as Array<{ duration: number; phase: string }>, "reduced-normal": [] as Array<{ duration: number; phase: string }>, "full-throttled": [] as Array<{ duration: number; phase: string }>, "reduced-throttled": [] as Array<{ duration: number; phase: string }> },
      layoutShift: 0, longTasks: [] as Array<{ duration: number; phase: string }>, throttledLongTasks: [] as Array<{ duration: number; phase: string }>,
      active: true, throttled: false, motionMode: "full" as "full" | "reduced", phase: "warm", startedAt: performance.now(), lastFrame: performance.now(),
    };
    (window as Window & { __FLOW_LOCAL_MOTION_AUDIT__?: typeof audit }).__FLOW_LOCAL_MOTION_AUDIT__ = audit;
    try { new PerformanceObserver((list) => list.getEntries().forEach((entry) => { if (entry.startTime >= audit.startedAt) { const item = { duration: entry.duration, phase: audit.phase }; (audit.throttled ? audit.throttledLongTasks : audit.longTasks).push(item); audit.modeLongTasks[`${audit.motionMode}-${audit.throttled ? "throttled" : "normal"}`].push(item); } })).observe({ type: "longtask" }); } catch { /* unsupported entries remain honestly absent */ }
    try { new PerformanceObserver((list) => list.getEntries().forEach((entry) => { const shift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number }; if (entry.startTime >= audit.startedAt && !shift.hadRecentInput) audit.layoutShift += shift.value ?? 0; })).observe({ type: "layout-shift" }); } catch { /* unsupported entries remain honestly absent */ }
    const tick = (at: number) => {
      if (!audit.active) return;
      const delta = at - audit.lastFrame;
      (audit.throttled ? audit.throttledFrameDeltas : audit.frameDeltas).push(delta);
      (audit.throttled ? audit.throttledFramePhases : audit.framePhases).push(audit.phase);
      audit.modeFrames[`${audit.motionMode}-${audit.throttled ? "throttled" : "normal"}`].push(delta);
      audit.lastFrame = at;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const yieldFrame = () => page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  for (let index = 0; index < 20; index += 1) {
    if (index === 5) {
      await setSensoryMode(page, "reduced", "minimal");
      await page.evaluate(() => { const audit = (window as Window & { __FLOW_LOCAL_MOTION_AUDIT__?: { motionMode: "full" | "reduced" } }).__FLOW_LOCAL_MOTION_AUDIT__; if (audit) audit.motionMode = "reduced"; });
    }
    if (index === 10) {
      await setSensoryMode(page, "full", "helpful");
      await page.evaluate(() => { const audit = (window as Window & { __FLOW_LOCAL_MOTION_AUDIT__?: { motionMode: "full" | "reduced"; throttled: boolean } }).__FLOW_LOCAL_MOTION_AUDIT__; if (audit) { audit.motionMode = "full"; audit.throttled = true; } });
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    }
    if (index === 15) {
      await setSensoryMode(page, "reduced", "minimal");
      await page.evaluate(() => { const audit = (window as Window & { __FLOW_LOCAL_MOTION_AUDIT__?: { motionMode: "full" | "reduced" } }).__FLOW_LOCAL_MOTION_AUDIT__; if (audit) audit.motionMode = "reduced"; });
    }
    await page.evaluate((phase) => { const audit = (window as Window & { __FLOW_LOCAL_MOTION_AUDIT__?: { phase: string } }).__FLOW_LOCAL_MOTION_AUDIT__; if (audit) audit.phase = phase; }, `cycle-${index + 1}:move`);
    await committedCommand(page, `Move deep work to ${index % 2 ? "nine" : "ten"}`);
    await yieldFrame();
    await page.evaluate((phase) => { const audit = (window as Window & { __FLOW_LOCAL_MOTION_AUDIT__?: { phase: string } }).__FLOW_LOCAL_MOTION_AUDIT__; if (audit) audit.phase = phase; }, `cycle-${index + 1}:history`);
    await expect(page.getByRole("button", { name: "Undo last change" })).toBeEnabled();
    await page.getByRole("button", { name: "Undo last change" }).click();
    await yieldFrame();
    await expect(page.getByRole("button", { name: "Redo last change" })).toBeEnabled();
    await page.getByRole("button", { name: "Redo last change" }).click();
    await yieldFrame();
    if (index === 4) { await page.evaluate(() => { const audit = (window as Window & { __FLOW_LOCAL_MOTION_AUDIT__?: { phase: string } }).__FLOW_LOCAL_MOTION_AUDIT__; if (audit) audit.phase = "cycle-5:navigation"; }); await command(page, "Home"); await yieldFrame(); await command(page, "Open today"); await yieldFrame(); }
    if (index === 7) { await page.setViewportSize({ width: 390, height: 844 }); await yieldFrame(); }
    if (index === 8) { await page.setViewportSize({ width: 1280, height: 800 }); await yieldFrame(); }
    if (index === 12) {
      await page.evaluate(() => { const audit = (window as Window & { __FLOW_LOCAL_MOTION_AUDIT__?: { phase: string } }).__FLOW_LOCAL_MOTION_AUDIT__; if (audit) audit.phase = "cycle-13:visibility"; });
      await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
      await command(page, "Make email 20 minutes");
      await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
      await yieldFrame();
    }
  }
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await page.evaluate(() => { const audit = (window as Window & { __FLOW_LOCAL_MOTION_AUDIT__?: { throttled: boolean } }).__FLOW_LOCAL_MOTION_AUDIT__; if (audit) audit.throttled = false; });
  await page.evaluate(() => { const audit = (window as Window & { __FLOW_LOCAL_MOTION_AUDIT__?: { phase: string } }).__FLOW_LOCAL_MOTION_AUDIT__; if (audit) audit.phase = "settle"; });
  await page.waitForTimeout(900);
  await page.evaluate(() => { const audit = (window as Window & { __FLOW_LOCAL_MOTION_AUDIT__?: { active: boolean } }).__FLOW_LOCAL_MOTION_AUDIT__; if (audit) audit.active = false; });
  await cdp.send("HeapProfiler.collectGarbage");
  const after = await cdp.send("Memory.getDOMCounters");
  const collected = await page.evaluate(() => {
    const audit = (window as Window & { __FLOW_LOCAL_MOTION_AUDIT__?: { frameDeltas: number[]; framePhases: string[]; throttledFrameDeltas: number[]; throttledFramePhases: string[]; modeFrames: Record<string, number[]>; modeLongTasks: Record<string, Array<{ duration: number; phase: string }>>; layoutShift: number; longTasks: Array<{ duration: number; phase: string }>; throttledLongTasks: Array<{ duration: number; phase: string }> } }).__FLOW_LOCAL_MOTION_AUDIT__!;
    const reward = (window as Window & { __FLOW_REWARD__?: { active: boolean; animationCount: number; transitionClones: number } }).__FLOW_REWARD__!;
    const motion = (window as Window & { __FLOW_MOTION__?: { activeClones: number; activeFrameLoops: number; peakClones: number } }).__FLOW_MOTION__ ?? { activeClones: 0, activeFrameLoops: 0, peakClones: 0 };
    const sound = (window as Window & { __FLOW_SOUND__?: { contextsCreated: number; activeNodes: number; playCount: number } }).__FLOW_SOUND__ ?? { contextsCreated: 0, activeNodes: 0, playCount: 0 };
    return { audit, reward, motion, sound, runningAnimations: document.getAnimations().filter(({ playState }) => playState === "running").length, transitionResidue: document.querySelectorAll("[data-transition-clone-count], [data-reward-wash], [data-reward-target]").length };
  });
  if (diagnosticProfile) {
    const { profile } = await cdp.send("Profiler.stop");
    writeFileSync(`${evidenceRoot}/diagnostic-main-thread.cpuprofile`, `${JSON.stringify(profile)}\n`);
    writeFileSync(`${evidenceRoot}/diagnostic-formatters.json`, `${JSON.stringify(await page.evaluate(() => (window as Window & { __FLOW_INTL_COUNTS__?: unknown }).__FLOW_INTL_COUNTS__), null, 2)}\n`);
    const scriptPath = await page.locator('script[type="module"]').first().getAttribute("src");
    if (scriptPath) writeFileSync(`${evidenceRoot}/diagnostic-production-script.js`, await (await page.request.get(new URL(scriptPath, page.url()).href)).text());
  }
  if (diagnosticAttribution) writeFileSync(`${evidenceRoot}/diagnostic-frame-attribution.json`, `${JSON.stringify(await page.evaluate(() => (window as Window & { __FLOW_FRAME_ATTRIBUTION__?: unknown[] }).__FLOW_FRAME_ATTRIBUTION__), null, 2)}\n`);
  await cdp.detach();
  const maxFrameMs = Math.max(0, ...collected.audit.frameDeltas);
  const throttledMaxFrameMs = Math.max(0, ...collected.audit.throttledFrameDeltas);
  const maxFramePhase = collected.audit.framePhases[collected.audit.frameDeltas.indexOf(maxFrameMs)] ?? "none";
  const throttledMaxFramePhase = collected.audit.throttledFramePhases[collected.audit.throttledFrameDeltas.indexOf(throttledMaxFrameMs)] ?? "none";
  const longTaskMs = Math.max(0, ...collected.audit.longTasks.map(({ duration }) => duration));
  const throttledLongTaskMs = Math.max(0, ...collected.audit.throttledLongTasks.map(({ duration }) => duration));
  const missedFrames = (samples: number[], frameBudgetMs: number) => samples.reduce((total, frame) => total + Math.max(0, Math.floor(frame / frameBudgetMs) - 1), 0);
  const droppedFrameEstimate = missedFrames(collected.audit.frameDeltas, 16.67);
  const throttledDroppedFrameEstimate = missedFrames(collected.audit.throttledFrameDeltas, 66.68);
  const droppedFrameRate = droppedFrameEstimate / Math.max(1, collected.audit.frameDeltas.length + droppedFrameEstimate);
  const throttledDroppedFrameRate = throttledDroppedFrameEstimate / Math.max(1, collected.audit.throttledFrameDeltas.length + throttledDroppedFrameEstimate);
  const metrics = {
    verdict: "PASS", equivalentAudit: "PerformanceObserver + rAF frame sampler + Chrome Memory.getDOMCounters", traceDisabledForMeasurement: true, diagnosticProfile, diagnosticAttribution, cycles: 20,
    frameSamples: collected.audit.frameDeltas.length, maxFrameMs, maxFramePhase, throttledFrameSamples: collected.audit.throttledFrameDeltas.length, throttledMaxFrameMs, throttledMaxFramePhase,
    droppedFrameEstimate, droppedFrameRate, throttledDroppedFrameEstimate, throttledDroppedFrameRate, longestMainThreadTaskMs: longTaskMs, throttledLongestMainThreadTaskMs: throttledLongTaskMs,
    frameAttribution: {
      normal: collected.audit.frameDeltas.map((duration, index) => ({ duration, phase: collected.audit.framePhases[index] })),
      throttled: collected.audit.throttledFrameDeltas.map((duration, index) => ({ duration, phase: collected.audit.throttledFramePhases[index] })),
    },
    longTasks: collected.audit.longTasks, throttledLongTasks: collected.audit.throttledLongTasks, cumulativeLayoutShift: collected.audit.layoutShift,
    nodeDelta: after.nodes - before.nodes, listenerDelta: after.jsEventListeners - before.jsEventListeners, documentDelta: after.documents - before.documents,
    runningAnimations: collected.runningAnimations, transitionResidue: collected.transitionResidue, reward: collected.reward, motion: collected.motion, sound: collected.sound,
    modeMeasurements: Object.fromEntries(Object.entries(collected.audit.modeFrames).map(([mode, samples]) => [mode, {
      samples: samples.length,
      maxFrameMs: Math.max(0, ...samples),
      longTasks: collected.audit.modeLongTasks[mode] ?? [],
      longestMainThreadTaskMs: Math.max(0, ...(collected.audit.modeLongTasks[mode] ?? []).map(({ duration }) => duration)),
    }])),
    thresholds: { maxLongTaskMs: 120, maxThrottledLongTaskMs: 600, maxFrameMs: 200, maxThrottledFrameMs: 600, maxLayoutShift: 0.25, maxNodeGrowth: 180, maxListenerGrowth: 30, maxDroppedFrameRate: 0.08, maxThrottledDroppedFrameRate: 0.12 },
  };
  const passed = longTaskMs <= metrics.thresholds.maxLongTaskMs && throttledLongTaskMs <= metrics.thresholds.maxThrottledLongTaskMs && collected.audit.layoutShift <= metrics.thresholds.maxLayoutShift
    && maxFrameMs <= metrics.thresholds.maxFrameMs && throttledMaxFrameMs <= metrics.thresholds.maxThrottledFrameMs
    && metrics.nodeDelta <= metrics.thresholds.maxNodeGrowth && metrics.listenerDelta <= metrics.thresholds.maxListenerGrowth
    && droppedFrameRate <= metrics.thresholds.maxDroppedFrameRate && throttledDroppedFrameRate <= metrics.thresholds.maxThrottledDroppedFrameRate
    && collected.runningAnimations === 0 && collected.transitionResidue === 0 && collected.reward.active === false && collected.reward.animationCount === 0
    && collected.reward.transitionClones === 0 && collected.motion.activeClones === 0 && collected.motion.activeFrameLoops === 0 && collected.sound.contextsCreated === 0 && collected.sound.activeNodes === 0;
  const allModesMeasured = Object.values(metrics.modeMeasurements).every(({ samples }) => samples > 0);
  metrics.verdict = passed && allModesMeasured ? "PASS" : "FAIL";
  writeFileSync(`${evidenceRoot}/motion-metrics.json`, `${JSON.stringify(metrics, null, 2)}\n`);
  expect(metrics.verdict).toBe("PASS");
});

test("every signature survives 20 interrupted full/reduced and normal/throttled production runs", async ({ page }) => {
  test.setTimeout(900_000);
  const cdp = await page.context().newCDPSession(page);
  const modes: StressMode[] = [
    ...Array<StressMode>(5).fill("full-normal"), ...Array<StressMode>(5).fill("reduced-normal"),
    ...Array<StressMode>(5).fill("full-throttled"), ...Array<StressMode>(5).fill("reduced-throttled"),
  ];
  const results: Record<string, { runs: number; modes: Record<StressMode, number>; elapsedMs: Record<StressMode, number[]> }> = {};
  const crossCuts = { undoRedo: 0, navigation: 0, viewportResize: 0, visibility: 0, soundDisabled: 0, mascotMinimal: 0, fullMotion: 0, reducedMotion: 0, fullThrottled: 0, reducedThrottled: 0 };
  try {
    for (const signature of signatures) {
      results[signature.id] = {
        runs: 0,
        modes: { "full-normal": 0, "reduced-normal": 0, "full-throttled": 0, "reduced-throttled": 0 },
        elapsedMs: { "full-normal": [], "reduced-normal": [], "full-throttled": [], "reduced-throttled": [] },
      };
    }
    for (const mode of [...new Set(modes)]) {
      const throttled = mode.endsWith("throttled");
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttled ? 4 : 1 });
      const baseline = await prepareSignatureMode(page, mode);
      for (const signature of signatures) {
        for (let index = 0; index < 5; index += 1) {
        const writeProgress = (stage: string) => writeFileSync(`${evidenceRoot}/signature-stress-progress.json`, `${JSON.stringify({ mode, signature: signature.id, run: index + 1, stage, results, crossCuts }, null, 2)}\n`);
        writeProgress("resetting");
        await resetSignature(page, baseline, signature.path);
        writeProgress("setting-up");
        await signature.setup(page);
        const beforeAction = await historyCounts(page);
        const startedAt = Date.now();
        writeProgress("running-signature");
        await signature.run(page);
        // A backgrounded Chromium target may suspend rAF even after a synthetic
        // visibility restoration. A bounded wall-clock beat keeps the stress
        // interruptible; settled-state assertions below still inspect every
        // live animation, clone, reward target, and audio node.
        await page.waitForTimeout(32);
        writeProgress("checking-history");
        const afterAction = await historyCounts(page);
        if (signature.id === "time-travel") expect(afterAction.past).toBe(beforeAction.past);
        else expect(afterAction.past).toBe(beforeAction.past + 1);
        await page.setViewportSize(index % 2 === 0 ? { width: 390, height: 844 } : { width: 834, height: 1112 });
        crossCuts.viewportResize += 1;
        await exerciseImmediateHistory(page); crossCuts.undoRedo += 1;
        writeProgress("settling-cross-cuts");
        await settleSignature(page);
        crossCuts.navigation += 1; crossCuts.visibility += 1; crossCuts.soundDisabled += 1;
        if (mode.startsWith("reduced")) crossCuts.reducedMotion += 1; else crossCuts.fullMotion += 1;
        if (mode.includes("throttled") && mode.startsWith("full")) crossCuts.fullThrottled += 1;
        if (mode.includes("throttled") && mode.startsWith("reduced")) crossCuts.reducedThrottled += 1;
        if (mode !== "full-normal") crossCuts.mascotMinimal += 1;
        const result = results[signature.id]!;
        result.runs += 1; result.modes[mode] += 1; result.elapsedMs[mode].push(Date.now() - startedAt);
        writeProgress("complete");
        }
      }
    }
  } finally {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await cdp.detach();
  }
  const complete = Object.values(results).every(({ runs, modes: measured }) => runs === 20 && Object.values(measured).every((count) => count === 5));
  const evidence = {
    verdict: complete && crossCuts.undoRedo === 120 && crossCuts.navigation === 120 && crossCuts.viewportResize === 120 && crossCuts.visibility === 120 ? "PASS" : "FAIL",
    expectedRunsPerSignature: 20,
    expectedSignatures: signatures.map(({ id }) => id),
    modePlan: { "full-normal": 5, "reduced-normal": 5, "full-throttled": 5, "reduced-throttled": 5 },
    strictMode: { productionRootWrapped: true, developmentProbe: `${evidenceRoot}/development-signatures.json`, note: "This production matrix does not execute development double-effect probes. The full release separately requires all six signatures, full and reduced, in the actual development StrictMode runtime." },
    results, crossCuts,
  };
  writeFileSync(`${evidenceRoot}/signature-stress.json`, `${JSON.stringify(evidence, null, 2)}\n`);
  expect(evidence.verdict).toBe("PASS");
});
