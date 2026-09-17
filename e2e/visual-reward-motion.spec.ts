import { expect, test, type Page } from "@playwright/test";
import { dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fillCommandField } from "./tide-helpers";
import { useNativeAnimationClock as installNativeAnimationClock, elapseFocusFixture } from "./native-clock";
import { readNativeFrameState, startNativeFrameCapture, type NativeFrameState } from "./native-frame-capture";
import { semanticPngFingerprint } from "./png-pixel-fingerprint";
import { HOME_SCENE_DURATION_MS } from "../src/features/home/home-motion";
import { mergeEvidenceRows } from "./motion-evidence-merge";

const evidenceRoot = process.env.FLOW_MOTION_EVIDENCE_DIR ?? "artifacts/visual-reward-debug/unscoped-motion";
const frames: string[] = [];
const inspected: string[] = [];
const consoleErrors: string[] = [];
const pageErrors: string[] = [];
const failedRequests: string[] = [];
const frameTiming: Array<Record<string, unknown>> = [];
const compositorSequences: Array<Record<string, unknown>> = [];

// This matrix owns the native PNG screencast stream. Keep the full action/DOM
// trace, but do not attach a second screenshot consumer (Playwright tracing
// normally records JPEG frames).
test.use({ trace: { mode: "on", screenshots: false, snapshots: true, sources: true } });

const viewports = [
  { id: "desktop", width: 1440, height: 900 },
  { id: "laptop", width: 1280, height: 800 },
  { id: "tablet", width: 834, height: 1112 },
  { id: "mobile", width: 390, height: 844 },
] as const;

const samples = [0, 20, 40, 60, 80, 100] as const;

async function prepare(page: Page, path: string) {
  await page.goto(path);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await page.waitForFunction(() => document.readyState === "complete" && document.fonts.status === "loaded");
  await expect(page.locator("[data-space-shell]")).toBeVisible();
}

async function command(page: Page, transcript: string) {
  const field = await fillCommandField(page, transcript);
  await field.press("Enter");
  await expect(page.getByLabel("Global Flow command")).toHaveAttribute("data-last-transcript", transcript);
}

async function committedCommand(page: Page, transcript: string) {
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3") ?? "null")?.revision ?? 0);
  await command(page, transcript);
  await expect.poll(() => page.evaluate(({ beforeRevision, expectedTranscript }) => {
    const snapshot = JSON.parse(localStorage.getItem("flow.life.v3") ?? "null");
    return (snapshot?.revision ?? 0) > beforeRevision && snapshot?.lastTransaction?.transcript === expectedTranscript;
  }, { beforeRevision: before, expectedTranscript: transcript }), { message: `a persisted production transaction for “${transcript}”` }).toBe(true);
}

async function rewardLevel(page: Page) {
  return page.evaluate(() => (window as Window & { __FLOW_REWARD__?: { active: boolean; event?: { at: number }; plan?: { level: number; recipe: { id: string } } } }).__FLOW_REWARD__);
}

async function observeRewardStart(page: Page, expectedLevel: number) {
  await page.evaluate((level) => {
    type Snapshot = { active: boolean; event?: { id: string; at: number }; plan?: { level: number } };
    const runtime = window as Window & { __FLOW_REWARD__?: Snapshot; __FLOW_CAPTURE_START__?: () => number | undefined; __FLOW_CAPTURE_IS_STARTED__?: () => boolean; __FLOW_CAPTURE_WORKER_STARTS__?: Array<(value: string) => void> };
    const descriptor = Object.getOwnPropertyDescriptor(runtime, "__FLOW_REWARD__");
    let snapshot = runtime.__FLOW_REWARD__;
    const previousId = snapshot?.event?.id;
    let startedAt: number | undefined;
    // Observe the existing diagnostic publication synchronously. A real 180 ms
    // acknowledgment can finish before trace-backed Playwright calls return;
    // observing before the trigger proves it was active without extending it.
    Object.defineProperty(runtime, "__FLOW_REWARD__", {
      configurable: true,
      enumerable: descriptor?.enumerable ?? true,
      get: () => snapshot,
      set: (value: Snapshot) => {
        snapshot = value;
        if (startedAt === undefined && value.active && value.plan?.level === level && value.event && value.event.id !== previousId) {
          startedAt = performance.now();
          runtime.__FLOW_CAPTURE_WORKER_STARTS__?.forEach((signal) => signal(String(startedAt)));
        }
      },
    });
    runtime.__FLOW_CAPTURE_IS_STARTED__ = () => startedAt !== undefined;
    runtime.__FLOW_CAPTURE_START__ = () => {
      Object.defineProperty(runtime, "__FLOW_REWARD__", { configurable: true, enumerable: descriptor?.enumerable ?? true, writable: true, value: snapshot });
      delete runtime.__FLOW_CAPTURE_START__;
      delete runtime.__FLOW_CAPTURE_IS_STARTED__;
      return startedAt;
    };
  }, expectedLevel);
}

function inspectVisibleFrame(path: string, { audit }: NativeFrameState) {
  expect(audit.hasWorld).toBe(true);
  expect(audit.overflow).toBeLessThanOrEqual(1);
  expect(audit.dockInside).toBe(true);
  expect(audit.dockPainted).toBe(true);
  expect(audit.mascotInside).toBe(true);
  expect(audit.mascotPrimaryCollisions).toBe(0);
  expect(audit.rewardLabelHeadingCollisions).toBe(0);
  expect(audit.clones).toBeLessThanOrEqual(1);
  expect(audit.rewardTargets).toBeLessThanOrEqual(1);
  inspected.push(path);
}

async function captureSequence(
  page: Page,
  sequence: string,
  viewport: typeof viewports[number],
  durationMs: number,
  setup: () => Promise<void>,
  transcript: string,
  expectedLevel: number,
) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await setup();
  await fillCommandField(page, transcript);
  await expect.poll(() => rewardLevel(page)).toMatchObject({ active: false });
  await expect(page.locator("[data-transition-clone-count], [data-reward-wash], [data-reward-target]")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter(({ playState }) => playState === "running").length)).toBe(0);
  const pathFor = (percentage: number) => `${evidenceRoot}/${sequence}/${viewport.id}/${String(percentage).padStart(2, "0")}.png`;
  mkdirSync(dirname(pathFor(0)), { recursive: true });
  const baseline = await page.evaluate(readNativeFrameState);
  await page.screenshot({ path: pathFor(0), animations: "allow", caret: "hide" });
  frameTiming.push({ path: pathFor(0), sequence, viewport: viewport.id, requestedPercentage: 0, requestedMs: 0, phase: "before-trigger", startedAt: null, nativeBeforeMs: baseline.now, nativeAfterMs: await page.evaluate(() => performance.now()), animations: baseline.animations });
  frames.push(pathFor(0)); inspectVisibleFrame(pathFor(0), baseline);
  await observeRewardStart(page, expectedLevel);
  const capture = await startNativeFrameCapture(page);
  const beforeRevision = await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3") ?? "null")?.revision ?? 0);
  const toleranceMs = durationMs <= 200 ? 25 : 60;
  const requestedIntermediateSamples = samples.filter((value) => value > 0 && value < 100);
  let startedAt = 0;
  let rewardStartedAt = 0;
  let recorded: Awaited<ReturnType<typeof capture.stop>>;
  try {
    await capture.armCheckpoints({
      startKind: sequence === "time-travel" || expectedLevel === 3 ? "animation" : "reward",
      durationMs,
      ...(sequence === "time-travel" ? { selector: "[data-home-date-scene]" }
        : expectedLevel === 3 ? { selector: "[data-reward-wash], [data-reward-target], [data-reward-label]" } : {}),
      checkpoints: requestedIntermediateSamples.map((percentage) => ({
        checkpoint: percentage,
        offsetMs: Math.round(durationMs * percentage / 100),
        toleranceMs,
      })),
    });
    // Keep the real native key event in flight: production interpretation and
    // persistence can legitimately outlive the first compositor checkpoint.
    // The pre-armed DOM observer publishes the WAAPI start over CDP while that
    // handler is still running, so capture scheduling cannot begin too late.
    const submission = capture.submitCommand();
    const nativeStarts = await capture.captureCheckpoints();
    startedAt = Math.min(...nativeStarts);
    expect(Math.max(...nativeStarts) - startedAt, "all capture workers must observe one production animation origin").toBeLessThanOrEqual(2);
    await submission;
    rewardStartedAt = await capture.takePublishedRewardStart();
    await page.waitForFunction(() => {
      const runtime = window as Window & { __FLOW_REWARD__?: { active: boolean } };
      return !runtime.__FLOW_REWARD__?.active && !document.querySelector("[data-transition-clone-count], [data-reward-wash], [data-reward-target]")
        && document.getAnimations().every(({ playState }) => playState !== "running");
    });
    const wait = await page.evaluate(({ start, duration }) => Math.max(0, start + duration - performance.now()), { start: startedAt, duration: durationMs });
    if (wait > 0) await page.waitForTimeout(wait);
    await expect(page.locator("[data-transition-clone-count], [data-reward-wash], [data-reward-target]")).toHaveCount(0);
    await expect.poll(() => rewardLevel(page)).toMatchObject({ active: false });
    await expect.poll(() => page.evaluate(() => document.getAnimations().filter(({ playState }) => playState === "running").length)).toBe(0);
    await page.waitForTimeout(100);
  } finally { recorded = await capture.stop(); }
  expect(recorded.errors).toEqual([]);
  if (sequence === "time-travel") {
    const sceneStarts = recorded.states.flatMap((state) => state.homeSceneAnimations.flatMap((animation) => typeof animation.startTime === "number" && animation.duration === HOME_SCENE_DURATION_MS
      ? [animation.startTime] : []));
    expect(sceneStarts.length, "the real whole-world temporal scene must animate").toBeGreaterThan(0);
    startedAt = Math.min(...sceneStarts);
  }
  await expect(page.getByLabel("Global Flow command")).toHaveAttribute("data-last-transcript", transcript);
  if (expectedLevel > 1) await expect.poll(() => page.evaluate(({ revision, expectedTranscript }) => {
    const snapshot = JSON.parse(localStorage.getItem("flow.life.v3") ?? "null");
    return (snapshot?.revision ?? 0) > revision && snapshot?.lastTransaction?.transcript === expectedTranscript;
  }, { revision: beforeRevision, expectedTranscript: transcript })).toBe(true);
  const used = new Set<number>();
  const selectedCheckpoints: Array<Record<string, number>> = [];
  const semanticPixelDigests: string[] = [];
  for (const percentage of requestedIntermediateSamples) {
    const target = Math.round(durationMs * percentage / 100);
    const frame = recorded.frames.filter(({ captureNativeMs, checkpoint }) => checkpoint === percentage && !used.has(captureNativeMs) && Math.abs(captureNativeMs - startedAt - target) <= toleranceMs)
      .sort((left, right) => Math.abs(left.captureNativeMs - startedAt - target) - Math.abs(right.captureNativeMs - startedAt - target))[0];
    if (!frame) {
      const deltas = recorded.frames.map(({ captureNativeMs }) => Math.round((captureNativeMs - startedAt) * 10) / 10);
      throw new Error(`${sequence}/${viewport.id}/${percentage}: no real compositor frame within ${toleranceMs} ms of ${target} ms; observed elapsed frames [${deltas.join(", ")}]`);
    }
    used.add(frame.captureNativeMs);
    selectedCheckpoints.push({ requestedPercentage: percentage, targetNativeMs: startedAt + target, frameNativeMs: frame.captureNativeMs, deltaMs: frame.captureNativeMs - startedAt - target });
    const state = [...recorded.states].sort((left, right) => Math.abs(left.now - frame.captureNativeMs) - Math.abs(right.now - frame.captureNativeMs))[0];
    expect(state).toBeDefined();
    expect(Math.abs(state!.now - frame.captureNativeMs), "native rAF audit must pair with the metadata-timestamped compositor frame").toBeLessThanOrEqual(toleranceMs);
    const path = pathFor(percentage);
    const png = Buffer.from(frame.data, "base64");
    expect([...png.subarray(0, 8)], "CDP must return a real PNG compositor frame").toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(png.length, "the compositor PNG must contain a rendered world").toBeGreaterThan(1_000);
    const pixel = semanticPngFingerprint(png);
    semanticPixelDigests.push(pixel.digest);
    writeFileSync(path, png);
    frameTiming.push({
      path, sequence, viewport: viewport.id, requestedPercentage: percentage, requestedMs: target,
      phase: "requested-sample", startedAt, captureNativeMs: frame.captureNativeMs,
      receivedNativeMs: frame.receivedNativeMs, actualElapsedCaptureMs: frame.captureNativeMs - startedAt,
      callbackArrivalLagMs: frame.arrivalLagMs, captureMethod: "CDP Page.screencastFrame metadata-timestamped PNG",
      compositorTimestamp: frame.metadataTimestamp, rendererTimeOriginMs: recorded.rendererTimeOriginMs,
      timingToleranceMs: toleranceMs, auditNativeMs: state!.now, auditCompletedAt: state!.auditCompletedAt,
      auditOffsetMs: state!.now - frame.captureNativeMs,
      auditRelationship: "nearest native rAF DOM/WAAPI audit paired with the metadata-timestamped compositor PNG",
      semanticPixelDigest: pixel.digest, semanticPixelExclusion: "top-left 12x12 test-heartbeat region",
      width: pixel.width, height: pixel.height, colorType: pixel.colorType,
      documentTimeline: state!.timeline, animations: state!.animations,
    });
    frames.push(path); inspectVisibleFrame(path, state!);
  }
  expect(new Set(semanticPixelDigests).size, `${sequence}/${viewport.id}: all four active-timeline samples must have distinct product pixels outside the heartbeat region`).toBe(4);
  compositorSequences.push({
    sequence, viewport: viewport.id, startedAt, rewardStartedAt, durationMs, toleranceMs,
    trigger: "native Enter key against the filled real command field",
    acquisition: "pre-armed Page.screencastFrame PNG stream forced by a test-only rAF paint heartbeat; capture time comes from ScreencastFrameMetadata.timestamp mapped through performance.timeOrigin",
    rawFrameCount: recorded.rawFrameCount, rendererTimeOriginMs: recorded.rendererTimeOriginMs,
    semanticPixelDigests, selectedCheckpoints,
    frames: recorded.frames.map(({ metadataTimestamp, captureNativeMs, receivedNativeMs, arrivalLagMs, sessionId, checkpoint }) => ({ metadataTimestamp, captureNativeMs, receivedNativeMs, arrivalLagMs, sessionId, checkpoint })),
    states: recorded.states,
  });
  const final = await page.evaluate(readNativeFrameState);
  await page.screenshot({ path: pathFor(100), animations: "allow", caret: "hide" });
  const after = await page.evaluate(() => performance.now());
  frameTiming.push({ path: pathFor(100), sequence, viewport: viewport.id, requestedPercentage: 100, requestedMs: durationMs, phase: "settled", startedAt, nativeBeforeMs: final.now, nativeAfterMs: after, actualElapsedBeforeMs: final.now - startedAt, actualElapsedAfterMs: after - startedAt, documentTimeline: final.timeline, animations: final.animations });
  frames.push(pathFor(100)); inspectVisibleFrame(pathFor(100), final);
  await expect(page.locator("[data-transition-clone-count], [data-reward-wash], [data-reward-target]")).toHaveCount(0);
  await expect.poll(() => rewardLevel(page)).toMatchObject({ active: false });
  // Canonical samples are on disk and provenance retains only native metadata.
  // Release lossless snapshot payloads before the next signature so the
  // evidence collector cannot create a cross-sequence memory-pressure pause.
  for (const frame of recorded.frames) frame.data = "";
}

test.beforeAll(() => mkdirSync(evidenceRoot, { recursive: true }));
async function instrumentMotionPage(page: Page) {
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    if (request.url().startsWith("http://127.0.0.1:5176") && ["document", "script", "stylesheet", "fetch", "xhr"].includes(request.resourceType())) failedRequests.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText ?? "unknown"}`);
  });
  await page.route("https://api.open-meteo.com/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"daily":{"time":[]}}' }));
}
test.beforeEach(async ({ page }) => {
  await instrumentMotionPage(page);
  await installNativeAnimationClock(page, "2026-09-04T10:32:00");
});

function writeFrameEvidence() {
  if (!frames.length) return;
  // Failed Playwright tests replace the worker. Merge durable checkpoints from
  // preceding workers rather than overwriting their manifest with this array.
  const read = <T,>(name: string, fallback: T): T => existsSync(`${evidenceRoot}/${name}`) ? JSON.parse(readFileSync(`${evidenceRoot}/${name}`, "utf8")) as T : fallback;
  const previous = read("frame-manifest.json", { frames: [] as string[], inspected: [] as string[] });
  const allFrames = mergeEvidenceRows(previous.frames, frames, (path) => path);
  const allInspected = mergeEvidenceRows(previous.inspected, inspected, (path) => path);
  const allTiming = mergeEvidenceRows(read("frame-timing.json", { samples: [] as Array<Record<string, unknown>> }).samples, frameTiming, (row) => String(row.path));
  const allSequences = mergeEvidenceRows(read("compositor-provenance.json", { sequences: [] as Array<Record<string, unknown>> }).sequences, compositorSequences, (row) => `${row.sequence}/${row.viewport}`);
  const index = `<!doctype html><meta charset="utf-8"><title>Flow visual reward matrix</title><style>body{font:14px system-ui;background:#f5f1ed;color:#25303d;margin:24px}section{margin:32px 0}div{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}img{width:100%;border:1px solid #ded7d0;border-radius:12px;background:white}small{display:block;margin:4px 0 14px}</style><h1>Flow visual reward matrix</h1>${["tide-recovery", "focus-completion", "outcome-completion", "commitment-kept", "time-travel", "capture-to-outcome"].map((sequence) => `<section><h2>${sequence}</h2><div>${allFrames.filter((path) => path.includes(`/${sequence}/`)).map((path) => `<figure><img src="${path.replace(`${evidenceRoot}/`, "")}"><small>${path}</small></figure>`).join("")}</div></section>`).join("")}`;
  writeFileSync(`${evidenceRoot}/frame-index.html`, index);
  writeFileSync(`${evidenceRoot}/frame-manifest.json`, `${JSON.stringify({ expected: 144, frames: allFrames, inspected: allInspected, inspection: "Every listed inspected PNG passed its independent renderer containment/overflow/clone/target audit. Partial failed sequences remain listed; frame existence alone is not visual approval. Contact sheets are reviewed separately in docs/quality/design-qa.md." }, null, 2)}\n`);
  writeFileSync(`${evidenceRoot}/frame-timing.json`, `${JSON.stringify({ clock: "Native rAF, performance.now and WAAPI; Date-only domain offset", zeroFrame: "Before the real signature trigger", finalFrame: "After actual settled postconditions", samples: allTiming }, null, 2)}\n`);
  writeFileSync(`${evidenceRoot}/compositor-provenance.json`, `${JSON.stringify({ source: "Chromium Page.screencastFrame PNG bytes; ScreencastFrameMetadata.timestamp mapped to renderer performance.now through performance.timeOrigin", sequences: allSequences }, null, 2)}\n`);
}

test.afterEach(() => writeFrameEvidence());

test.afterAll(() => {
  writeFrameEvidence();
  const browserPath = `${evidenceRoot}/browser-evidence.json`;
  const previous = existsSync(browserPath)
    ? JSON.parse(readFileSync(browserPath, "utf8")) as { consoleErrors?: string[]; pageErrors?: string[]; failedRequests?: string[] }
    : {};
  writeFileSync(browserPath, `${JSON.stringify({
    consoleErrors: [...new Set([...(previous.consoleErrors ?? []), ...consoleErrors])],
    pageErrors: [...new Set([...(previous.pageErrors ?? []), ...pageErrors])],
    failedRequests: [...new Set([...(previous.failedRequests ?? []), ...failedRequests])],
  }, null, 2)}\n`);
});

interface SignatureScenario {
  id: string;
  durationMs: number;
  transcript: string;
  level: number;
  setup: (page: Page) => Promise<void>;
  verify?: (page: Page) => Promise<void>;
}

const signatureScenarios: SignatureScenario[] = [
  {
    id: "tide-recovery", durationMs: 1_120,
    transcript: "I'm 35 minutes behind, keep dinner at 7, move low priority work to tomorrow, and give me 20 minutes before the interview", level: 3,
    setup: (page) => prepare(page, "/today"),
    verify: async (page) => expect(page.locator("[data-mascot-renderer]")).toHaveCount(0),
  },
  {
    id: "focus-completion", durationMs: 1_120, transcript: "Stop focus", level: 3,
    setup: async (page) => {
      await prepare(page, "/focus");
      await committedCommand(page, "Give me five minutes");
      await elapseFocusFixture(page, 4);
    },
    verify: async (page) => expect(page.getByTestId("focus-space").getByText(/minutes protected\./)).toBeVisible(),
  },
  {
    id: "outcome-completion", durationMs: 1_120, transcript: "Complete this outcome", level: 3,
    setup: async (page) => {
      await prepare(page, "/outcomes");
      await committedCommand(page, "I need to draft a report");
      for (const step of ["Define the audience and outcome", "Draft the structure", "Review and deliver"]) await committedCommand(page, `Mark ${step} complete`);
    },
    verify: async (page) => expect(page.getByTestId("plan-detail").getByText("Outcome complete")).toBeVisible(),
  },
  {
    id: "commitment-kept", durationMs: 1_120, transcript: "Mark proposal promise to Maya complete", level: 3,
    setup: async (page) => {
      await prepare(page, "/people?view=commitments");
      await committedCommand(page, "I promised Maya the proposal by Friday");
    },
    verify: async (page) => expect(page.getByTestId("people-space").getByText("Promise kept")).toBeVisible(),
  },
  {
    id: "time-travel", durationMs: HOME_SCENE_DURATION_MS, transcript: "Tomorrow", level: 1,
    setup: async (page) => { await prepare(page, "/"); await command(page, "Home"); },
  },
  {
    id: "capture-to-outcome", durationMs: 1_220, transcript: "Turn that into an outcome", level: 2,
    setup: async (page) => {
      await prepare(page, "/capture");
      await committedCommand(page, "Capture renew passport before Senegal");
      await page.getByRole("button", { name: "Renew passport before Senegal" }).click();
    },
  },
];

// Each signature/viewport pair owns a fresh Playwright context and trace. This
// keeps native compositor snapshots independent from earlier PNG encoders and
// trace documents while preserving the exact 24 sequences and 144-frame gate.
for (const viewport of viewports) {
  for (const signature of signatureScenarios) {
    test(`captures native signature frames: ${signature.id}/${viewport.id}`, async ({ page }) => {
      test.setTimeout(120_000);
      const priorFrames = frames.length;
      const priorInspected = inspected.length;
      await captureSequence(page, signature.id, viewport, signature.durationMs, () => signature.setup(page), signature.transcript, signature.level);
      await signature.verify?.(page);
      expect(frames).toHaveLength(priorFrames + samples.length);
      expect(inspected).toHaveLength(priorInspected + samples.length);
    });
  }
}

test("records the deterministic 45-second portfolio journey through production actions", async ({ browser }) => {
  test.setTimeout(90_000);
  const videoDirectory = `${evidenceRoot}/portfolio-recording`;
  mkdirSync(videoDirectory, { recursive: true });
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:5176",
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: videoDirectory, size: { width: 1280, height: 800 } },
  });
  const page = await context.newPage();
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    if (request.url().startsWith("http://127.0.0.1:5176") && ["document", "script", "stylesheet", "fetch", "xhr"].includes(request.resourceType())) failedRequests.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText ?? "unknown"}`);
  });
  await page.route("https://api.open-meteo.com/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"daily":{"time":[]}}' }));
  const video = page.video();
  await prepare(page, "/");
  const beat = async (transcript: string, wait = 2_700) => {
    await command(page, transcript);
    await expect(page.locator('[data-flow-feedback][data-feedback-phase="error"]')).toHaveCount(0);
    await expect(page.locator('[data-flow-feedback][data-feedback-phase="clarification"]')).toHaveCount(0);
    await page.waitForTimeout(wait);
  };
  await page.waitForTimeout(2_500);
  await beat("Tomorrow");
  await beat("What should I wear?");
  await beat("Give me forty minutes");
  await beat("Do it");
  await beat("Today");
  await beat("Open today");
  await beat("Make the two PM meeting red and important");
  await beat("I'm 35 minutes behind. Keep dinner at seven");
  await beat("Capture renew passport before Senegal");
  await beat("Turn that into an outcome");
  for (const step of ["Documents", "Passport photos", "Book appointment"]) await beat(`Mark ${step} complete`, 1_800);
  await beat("Complete this outcome");
  const beforeRecommendation = await page.evaluate(() => localStorage.getItem("flow.life.v3"));
  await command(page, "What am I forgetting?");
  await expect(page.locator('[data-flow-feedback][data-feedback-phase="completed"]')).toContainText(/things fit|Keep this space free/);
  expect(await page.evaluate(() => localStorage.getItem("flow.life.v3"))).toBe(beforeRecommendation);
  await page.waitForTimeout(2_700);
  await beat("Undo");
  await page.waitForTimeout(3_500);
  await expect(page.locator("[data-transition-clone-count], [data-reward-wash], [data-reward-target]")).toHaveCount(0);
  await page.close();
  if (!video) throw new Error("Playwright video capture was unavailable.");
  await video.saveAs(`${evidenceRoot}/portfolio-demo.webm`);
  await context.close();
});
