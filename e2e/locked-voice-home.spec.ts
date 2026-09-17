import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { useNativeAnimationClock } from "./native-clock";

const evidenceDir = process.env.LOCKED_HOME_EVIDENCE_DIR ?? "artifacts/locked-voice-home";
const errors = new WeakMap<Page, { console: string[]; page: string[]; requests: string[] }>();

async function installGrantedRecognition(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("flow.voice.permission-granted.v1", "granted");
    class Recognition {
      continuous = false; interimResults = false; maxAlternatives = 1; lang = ""; phrases: unknown[] = [];
      onstart: (() => void) | null = null; onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null; onend: (() => void) | null = null;
      generation = 0;
      start() {
        const runtime = window as Window & { __lockedRecognition?: Recognition; __lockedGeneration?: number; __lockedReady?: boolean };
        this.generation = (runtime.__lockedGeneration ?? 0) + 1;
        runtime.__lockedGeneration = this.generation;
        runtime.__lockedRecognition = this;
        runtime.__lockedReady = true;
        this.onstart?.();
      }
      stop() { (window as Window & { __lockedReady?: boolean }).__lockedReady = false; this.onend?.(); }
      abort() { (window as Window & { __lockedReady?: boolean }).__lockedReady = false; this.onend?.(); }
      emit(transcript: string) {
        const runtime = window as Window & { __lockedReady?: boolean };
        runtime.__lockedReady = false;
        const result = Object.assign({ 0: { transcript, confidence: 0.96 } }, { isFinal: true, length: 1 });
        this.onresult?.({ results: [result] });
        this.onend?.();
      }
    }
    (window as Window & { SpeechRecognition?: typeof Recognition }).SpeechRecognition = Recognition;
  });
}

async function fresh(page: Page) {
  await page.route("https://api.open-meteo.com/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"daily":{"time":[]}}' }));
  await page.goto("/");
  await expect(page.getByTestId("home-space")).toHaveAttribute("data-home-entrance", "wake-armed");
  await expect.poll(() => page.evaluate(() => Boolean((window as Window & { __lockedReady?: boolean }).__lockedReady))).toBe(true);
}

async function speak(page: Page, transcript: string) {
  const generation = await beginSpeech(page, transcript);
  await expect.poll(() => page.evaluate(() => (window as Window & { __lockedGeneration?: number }).__lockedGeneration ?? 0), { timeout: 15_000 }).toBeGreaterThan(generation);
  await expect(page.getByLabel("Global Flow command")).toHaveAttribute("data-last-transcript", transcript);
}

async function beginSpeech(page: Page, transcript: string) {
  const generation = await page.evaluate(() => (window as Window & { __lockedGeneration?: number }).__lockedGeneration ?? 0);
  await page.evaluate((value) => (window as Window & { __lockedRecognition?: { emit(value: string): void } }).__lockedRecognition!.emit(value), transcript);
  return generation;
}

async function typeCommand(page: Page, transcript: string) {
  const input = page.getByLabel("Tell Flow what to change");
  // Focus with the real keyboard shortcut. A visibility probe alone races the
  // deliberate 850 ms recede timer while the previous result is unfocused.
  await page.keyboard.press("Control+k");
  await expect(input).toBeFocused();
  await input.fill(transcript);
  await input.press("Enter");
  await expect(page.getByLabel("Global Flow command")).toHaveAttribute("data-last-transcript", transcript);
}

async function observeNextCompoundAcknowledgement(page: Page) {
  await page.evaluate(() => {
    window.addEventListener("flow:voice-target-painted", () => {
      const runtime = window as Window & { __lockedCompoundAck?: { text?: string; domain?: string; route: string; past: number } };
      runtime.__lockedCompoundAck = {
        text: document.querySelector("[data-voice-target-acknowledgement]")?.textContent?.trim(),
        domain: document.querySelector<HTMLElement>("[data-voice-target-pulse]")?.dataset.targetDomain,
        route: location.pathname,
        past: JSON.parse(localStorage.getItem("flow.life.v3")!).past.length,
      };
    }, { once: true });
  });
}

async function beginWakeSpeech(page: Page, transcript: string) {
  const generation = await page.evaluate(() => (window as Window & { __lockedGeneration?: number }).__lockedGeneration ?? 0);
  const wakeFrame = await page.evaluate((value) => new Promise<{
    entrance?: string; heading?: string; face?: string; lift?: string; leafCount: number;
    ceremony?: string; transcriptAt?: number; firstFrameAt?: number; paintedAt?: number; acknowledgementMs?: number; paintSource?: string;
  }>((resolve, reject) => {
    const deadline = window.setTimeout(() => {
      reject(new Error("Flow did not render the wake response"));
    }, 2_500);
    window.addEventListener("flow:wake-painted", () => {
      const home = document.querySelector<HTMLElement>("[data-home-entrance]");
      const heading = [...document.querySelectorAll("h1")].find((node) => node.textContent?.trim() === "Hi there!");
      const mascot = document.querySelector<HTMLElement>("[data-mascot-form='sprout']");
      const ceremony = document.querySelector<HTMLElement>("[data-wake-ceremony]");
      const diagnostics = (window as Window & { __FLOW_LOCKED_HOME__?: {
        wakeTranscriptAt?: number; wakeFirstFrameAt?: number; wakePaintedAt?: number; wakeAcknowledgementMs?: number; wakePaintSource?: string;
      } }).__FLOW_LOCKED_HOME__;
      window.clearTimeout(deadline);
      resolve({
        entrance: home?.dataset.homeEntrance,
        heading: heading.textContent?.trim(),
        face: mascot?.dataset.mascotFace,
        lift: mascot?.dataset.wakeLiftPx,
        leafCount: document.querySelectorAll("[data-authored-wake-leaf]").length,
        ceremony: ceremony?.dataset.wakeCeremony,
        transcriptAt: diagnostics?.wakeTranscriptAt,
        firstFrameAt: diagnostics?.wakeFirstFrameAt,
        paintedAt: diagnostics?.wakePaintedAt,
        acknowledgementMs: diagnostics?.wakeAcknowledgementMs,
        paintSource: diagnostics?.wakePaintSource,
      });
    }, { once: true });
    (window as Window & { __lockedRecognition?: { emit(value: string): void } }).__lockedRecognition!.emit(value);
  }), transcript);
  return { generation, wakeFrame };
}

interface WakeSample {
  at: number;
  interval: number;
  elapsed: number;
  entrance?: string;
  ceremony?: string;
  body: string;
  eyes: string;
  sprout: string;
  leftArm: string;
  leafOpacities: number[];
  rippleOpacity: number;
  runningWakeAnimations: number;
}

async function armWakeChoreography(page: Page) {
  await page.evaluate(() => {
    const thresholds = [120, 420, 850, 1_250, 1_420, 1_760];
    const samples: WakeSample[] = [];
    const runtime = window as Window & { __lockedWakeSamples?: WakeSample[]; __lockedWakeSamplingDone?: boolean; __FLOW_LOCKED_HOME__?: { wakeTranscriptAt?: number } };
    runtime.__lockedWakeSamples = samples;
    runtime.__lockedWakeSamplingDone = false;
    const armedAt = performance.now();
    let nextInterval = 0;
    const read = (at: number, elapsed: number, interval: number): WakeSample => {
      const style = (selector: string) => {
        const element = document.querySelector<Element>(selector);
        return element ? getComputedStyle(element).transform : "missing";
      };
      return {
        at,
        interval,
        elapsed,
        entrance: document.querySelector<HTMLElement>("[data-home-entrance]")?.dataset.homeEntrance,
        ceremony: document.querySelector<HTMLElement>("[data-wake-ceremony]")?.dataset.wakeCeremony,
        body: style("[data-mascot-motion-stage='body-follow']"),
        eyes: style("[data-wake-eyes]"),
        sprout: style("[data-wake-sprout]"),
        leftArm: style("[data-wake-arm='left']"),
        leafOpacities: [...document.querySelectorAll("[data-authored-wake-leaf]")].map((node) => Number(getComputedStyle(node).opacity)),
        rippleOpacity: Number(document.querySelector("[data-wake-ripple]") ? getComputedStyle(document.querySelector("[data-wake-ripple]")!).opacity : 0),
        runningWakeAnimations: [...document.querySelectorAll("[data-wake-ripple], [data-authored-wake-leaf], [data-mascot-motion-stage='body-follow'], [data-wake-sprout], [data-wake-arm], [data-wake-eyes]")]
          .flatMap((node) => node.getAnimations()).filter((animation) => animation.playState === "running").length,
      };
    };
    const tick = () => {
      const at = performance.now();
      const startedAt = runtime.__FLOW_LOCKED_HOME__?.wakeTranscriptAt;
      if (startedAt !== undefined) {
        const elapsed = at - startedAt;
        if (nextInterval < thresholds.length && elapsed >= thresholds[nextInterval]) {
          // Record one real frame only. If a frame misses an entire interval,
          // skip that interval so the assertion reports missing evidence.
          while (nextInterval + 1 < thresholds.length && elapsed >= thresholds[nextInterval + 1]) nextInterval += 1;
          samples.push(read(at, elapsed, nextInterval));
          nextInterval += 1;
        }
      }
      if (nextInterval === thresholds.length || at - armedAt >= 5_000) runtime.__lockedWakeSamplingDone = true;
      else window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
  });
}

async function sampleWakeChoreography(page: Page) {
  await expect.poll(() => page.evaluate(() => (window as Window & { __lockedWakeSamplingDone?: boolean }).__lockedWakeSamplingDone), { timeout: 6_000 }).toBe(true);
  return page.evaluate(() => (window as Window & { __lockedWakeSamples?: WakeSample[] }).__lockedWakeSamples ?? []);
}

async function captureNormalized(page: Page, filename: string) {
  const image = await page.screenshot({ path: `${evidenceDir}/${filename}` });
  expect(image.readUInt32BE(16), `${filename} width`).toBe(1_440);
  expect(image.readUInt32BE(20), `${filename} height`).toBe(1_000);
}

async function assertHomeReadability(page: Page) {
  const measure = () => page.evaluate(() => {
    const selectors = { mascot: "[data-mascot-form='sprout']", heading: "[data-home-hero] h1", transcript: "[data-home-transcript]", dock: "[aria-label='Global Flow command']" };
    const rectangles = Object.entries(selectors).map(([name, selector]) => ({ name, bounds: document.querySelector(selector)!.getBoundingClientRect().toJSON() as { left: number; right: number; top: number; bottom: number } }));
    const intersections: string[] = [];
    for (let index = 0; index < rectangles.length; index += 1) {
      const first = rectangles[index];
      for (const second of rectangles.slice(index + 1)) {
        if (Math.min(first.bounds.right, second.bounds.right) > Math.max(first.bounds.left, second.bounds.left)
          && Math.min(first.bounds.bottom, second.bounds.bottom) > Math.max(first.bounds.top, second.bounds.top)) intersections.push(`${first.name}/${second.name}`);
      }
    }
    return { width: innerWidth, height: innerHeight, rectangles, intersections };
  });
  await expect.poll(async () => (await measure()).intersections).toEqual([]);
  const geometry = await measure();
  expect(geometry.intersections).toEqual([]);
  console.info("LOCKED_HOME_READABILITY", JSON.stringify(geometry));
}

interface EntranceMascotGeometry {
  mascot: { x: number; y: number; width: number; height: number; centerX: number; centerY: number };
  dock: { x: number; y: number; width: number; height: number };
  viewportVisibleRatio: number;
  dockOverlapArea: number;
  opacity: number;
  visibility: string;
}

async function entranceMascotGeometry(page: Page): Promise<EntranceMascotGeometry> {
  return page.evaluate(() => {
    const mascot = document.querySelector<HTMLElement>("[data-mascot-form='sprout']")!;
    const dock = document.querySelector<HTMLElement>("[aria-label='Global Flow command']")!;
    const mascotRect = mascot.getBoundingClientRect();
    const dockRect = dock.getBoundingClientRect();
    const visibleWidth = Math.max(0, Math.min(innerWidth, mascotRect.right) - Math.max(0, mascotRect.left));
    const visibleHeight = Math.max(0, Math.min(innerHeight, mascotRect.bottom) - Math.max(0, mascotRect.top));
    const overlapWidth = Math.max(0, Math.min(mascotRect.right, dockRect.right) - Math.max(mascotRect.left, dockRect.left));
    const overlapHeight = Math.max(0, Math.min(mascotRect.bottom, dockRect.bottom) - Math.max(mascotRect.top, dockRect.top));
    const style = getComputedStyle(mascot);
    return {
      mascot: {
        x: mascotRect.x,
        y: mascotRect.y,
        width: mascotRect.width,
        height: mascotRect.height,
        centerX: mascotRect.x + mascotRect.width / 2,
        centerY: mascotRect.y + mascotRect.height / 2,
      },
      dock: { x: dockRect.x, y: dockRect.y, width: dockRect.width, height: dockRect.height },
      viewportVisibleRatio: mascotRect.width * mascotRect.height > 0 ? visibleWidth * visibleHeight / (mascotRect.width * mascotRect.height) : 0,
      dockOverlapArea: overlapWidth * overlapHeight,
      opacity: Number(style.opacity),
      visibility: style.visibility,
    };
  });
}

function expectVisibleEntranceMascot(geometry: EntranceMascotGeometry) {
  expect(geometry.mascot.width * geometry.mascot.height).toBeGreaterThan(30_000);
  expect(geometry.viewportVisibleRatio).toBeGreaterThanOrEqual(0.98);
  expect(geometry.dockOverlapArea).toBe(0);
  expect(geometry.mascot.y).toBeGreaterThan(0);
  expect(geometry.mascot.y + geometry.mascot.height).toBeLessThanOrEqual(1_000);
  expect(geometry.opacity).toBeGreaterThan(0.95);
  expect(geometry.visibility).toBe("visible");
}

async function beginTargetedSpeech(page: Page, transcript: string) {
  const generation = await page.evaluate(() => (window as Window & { __lockedGeneration?: number }).__lockedGeneration ?? 0);
  const paintedFrame = await page.evaluate((value) => new Promise<{
    cardTargeted?: string; mascotDomain?: string; mascotDirection?: string; pulseMode?: string;
  }>((resolve) => {
    window.addEventListener("flow:voice-target-painted", () => {
      const card = document.querySelector<HTMLElement>("[data-home-domain='today']");
      const mascot = document.querySelector<HTMLElement>("[data-mascot-attention-domain]");
      const pulse = document.querySelector<HTMLElement>("[data-voice-target-pulse]");
      resolve({
        cardTargeted: card?.dataset.voiceTargeted,
        mascotDomain: mascot?.dataset.mascotAttentionDomain,
        mascotDirection: mascot?.dataset.mascotAttentionDirection,
        pulseMode: pulse?.dataset.voiceEnergyMode,
      });
    }, { once: true });
    (window as Window & { __lockedRecognition?: { emit(value: string): void } }).__lockedRecognition!.emit(value);
  }), transcript);
  return { generation, paintedFrame };
}

interface TargetMotionSample {
  at: number;
  elapsed: number;
  eyeX?: number;
  bodyX?: number;
  cardY?: number;
  travelerProgress?: number;
  travelerOpacity?: number;
  route: string;
  continuity?: { x: number; y: number; width: number; height: number };
}

async function sampleTargetMotion(page: Page, transcript: string) {
  const generation = await page.evaluate(() => (window as Window & { __lockedGeneration?: number }).__lockedGeneration ?? 0);
  const timeline = await page.evaluate((value) => new Promise<{
    samples: TargetMotionSample[];
    eyeStartedAt?: number;
    bodyStartedAt?: number;
    worldStartedAt?: number;
    targetStageScheduleMs?: { eyes: number; body: number; world: number };
    pulseOrigin?: { x: number; y: number };
    pulseTarget?: { x: number; y: number };
    paintedFrame?: { cardTargeted?: string; mascotDomain?: string; mascotDirection?: string; pulseMode?: string };
  }>((resolve, reject) => {
    const matrix = (element: Element | null) => {
      if (!element) return undefined;
      const transform = getComputedStyle(element).transform;
      if (!transform || transform === "none") return { x: 0, y: 0 };
      const parsed = new DOMMatrixReadOnly(transform);
      return { x: parsed.m41, y: parsed.m42 };
    };
    const rect = (element: Element | null) => {
      if (!element) return undefined;
      const bounds = element.getBoundingClientRect();
      return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    };
    const emittedAt = performance.now();
    const samples: TargetMotionSample[] = [];
    let settledFrames = 0;
    let eyeStartedAt: number | undefined;
    let bodyStartedAt: number | undefined;
    let worldStartedAt: number | undefined;
    let pulseOrigin: { x: number; y: number } | undefined;
    let pulseTarget: { x: number; y: number } | undefined;
    let paintedFrame: { cardTargeted?: string; mascotDomain?: string; mascotDirection?: string; pulseMode?: string } | undefined;
    window.addEventListener("flow:voice-target-painted", () => {
      const currentCard = document.querySelector<HTMLElement>("[data-home-domain='today']");
      const mascot = document.querySelector<HTMLElement>("[data-mascot-attention-domain]");
      const pulse = document.querySelector<HTMLElement>("[data-voice-target-pulse]");
      paintedFrame = {
        cardTargeted: currentCard?.dataset.voiceTargeted,
        mascotDomain: mascot?.dataset.mascotAttentionDomain,
        mascotDirection: mascot?.dataset.mascotAttentionDirection,
        pulseMode: pulse?.dataset.voiceEnergyMode,
      };
    }, { once: true });
    const deadline = emittedAt + 5_000;
    const tick = () => {
      const now = performance.now();
      const diagnostics = (window as Window & { __FLOW_LOCKED_HOME__?: {
        targetAcknowledgedAt?: number; targetStageScheduleMs?: { eyes: number; body: number; world: number };
      } }).__FLOW_LOCKED_HOME__;
      const targetStartedAt = diagnostics?.targetAcknowledgedAt;
      const elapsed = now - (targetStartedAt ?? emittedAt);
      const currentEyes = matrix(document.querySelector("[data-mascot-motion-stage='gaze-first']"));
      const currentBody = matrix(document.querySelector("[data-mascot-motion-stage='body-follow']"));
      const currentCard = matrix(document.querySelector("[data-home-domain='today']"));
      if (targetStartedAt !== undefined) {
        if (eyeStartedAt === undefined && currentEyes && currentEyes.x < -0.05) eyeStartedAt = elapsed;
        if (bodyStartedAt === undefined && currentBody && currentBody.x < -0.05) bodyStartedAt = elapsed;
        if (worldStartedAt === undefined && currentCard && currentCard.y < -0.05) worldStartedAt = elapsed;
      }
      const pulse = document.querySelector<HTMLElement>("[data-voice-target-pulse]");
      const traveler = document.querySelector("[data-voice-pulse-traveler]");
      let travelerProgress: number | undefined;
      if (pulse) {
        pulseOrigin ??= { x: Number(pulse.dataset.voiceOriginX), y: Number(pulse.dataset.voiceOriginY) };
        pulseTarget ??= { x: Number(pulse.dataset.voiceTargetX), y: Number(pulse.dataset.voiceTargetY) };
        const travel = matrix(traveler);
        const distance = Math.hypot(pulseTarget.x - pulseOrigin.x, pulseTarget.y - pulseOrigin.y);
        if (travel && distance > 0) travelerProgress = Math.hypot(travel.x, travel.y) / distance;
      }
      samples.push({
        at: now,
        elapsed,
        eyeX: currentEyes?.x,
        bodyX: currentBody?.x,
        cardY: currentCard?.y,
        travelerProgress,
        travelerOpacity: traveler ? Number(getComputedStyle(traveler).opacity) : undefined,
        route: window.location.pathname,
        continuity: rect(document.querySelector("[data-calendar-event-continuity='deep-work']")),
      });
      const currentGeometry = samples.at(-1)?.continuity;
      const priorGeometry = samples.at(-2)?.continuity;
      const destinationStable = window.location.pathname === "/today" && currentGeometry && priorGeometry
        && ["x", "y", "width", "height"].every((key) => Math.abs(currentGeometry[key as keyof typeof currentGeometry] - priorGeometry[key as keyof typeof priorGeometry]) < 0.25);
      settledFrames = destinationStable ? settledFrames + 1 : 0;
      if (targetStartedAt !== undefined && elapsed >= 900 && settledFrames >= 3) resolve({
        samples, eyeStartedAt, bodyStartedAt, worldStartedAt,
        targetStageScheduleMs: diagnostics?.targetStageScheduleMs,
        pulseOrigin, pulseTarget, paintedFrame,
      });
      else if (now >= deadline) reject(new Error("Target timeline never reached its settled frame"));
      else window.requestAnimationFrame(tick);
    };
    window.setTimeout(() => reject(new Error("Target timeline did not settle")), 5_500);
    (window as Window & { __lockedRecognition?: { emit(value: string): void } }).__lockedRecognition!.emit(value);
    window.requestAnimationFrame(tick);
  }), transcript);
  return { generation, timeline };
}

async function waitForRestart(page: Page, generation: number) {
  await expect.poll(() => page.evaluate(() => (window as Window & { __lockedGeneration?: number }).__lockedGeneration ?? 0), { timeout: 15_000 }).toBeGreaterThan(generation);
}

async function waitForRestartEntrance(page: Page, generation: number) {
  return page.evaluate((previous) => new Promise<string>((resolve, reject) => {
    const deadline = performance.now() + 1_350;
    const check = () => {
      const current = (window as Window & { __lockedGeneration?: number }).__lockedGeneration ?? 0;
      if (current > previous) {
        resolve(document.querySelector<HTMLElement>("[data-home-entrance]")?.dataset.homeEntrance ?? "missing");
        return;
      }
      if (performance.now() >= deadline) {
        reject(new Error("Flow Live did not restart during the wake transition"));
        return;
      }
      window.requestAnimationFrame(check);
    };
    check();
  }), generation);
}

test.beforeAll(() => mkdirSync(evidenceDir, { recursive: true }));
test.beforeEach(async ({ page }) => {
  const found = { console: [] as string[], page: [] as string[], requests: [] as string[] };
  errors.set(page, found);
  page.on("console", (message) => { if (message.type() === "error") found.console.push(message.text()); });
  page.on("pageerror", (error) => found.page.push(error.message));
  page.on("requestfailed", (request) => {
    if (request.url().startsWith("http://127.0.0.1:5173") && ["document", "script", "stylesheet", "fetch", "xhr"].includes(request.resourceType())) found.requests.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText ?? "unknown"}`);
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installGrantedRecognition(page);
});
test.afterEach(async ({ page }, testInfo) => {
  expect(errors.get(page)).toEqual({ console: [], page: [], requests: [] });
  console.info("LOCKED_BROWSER_RESULT", JSON.stringify({ title: testInfo.title, status: testInfo.status, errors: errors.get(page) }));
});

test("permission-once Live Session wakes autonomously without persisting pre-wake speech", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await fresh(page);
  await expect(page.getByRole("heading", { name: "Say “Flow” to wake me up." })).toBeVisible();

  const restingMascot = await entranceMascotGeometry(page);
  expectVisibleEntranceMascot(restingMascot);

  await speak(page, "Open my journal");
  await expect(page).toHaveURL(/\/$/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).past.length)).toBe(0);

  await armWakeChoreography(page);
  const { generation: wakeGeneration, wakeFrame } = await beginWakeSpeech(page, "Flow");
  expect(wakeFrame).toMatchObject({ entrance: "wake-reward", heading: "Hi there!", face: "happy", lift: "22", leafCount: 3, ceremony: "active" });
  expect(wakeFrame.transcriptAt).toBeDefined();
  expect(wakeFrame.firstFrameAt).toBeDefined();
  expect(wakeFrame.paintedAt).toBeDefined();
  expect(["element-timing", "frame-fence"]).toContain(wakeFrame.paintSource);
  expect(wakeFrame.acknowledgementMs).toBeGreaterThan(0);
  expect.soft(wakeFrame.acknowledgementMs, "wake first-paint ceiling remains a release requirement").toBeLessThan(100);
  expect(wakeFrame.firstFrameAt!).toBeGreaterThanOrEqual(wakeFrame.transcriptAt!);
  expect(wakeFrame.paintedAt!).toBeGreaterThanOrEqual(wakeFrame.firstFrameAt!);
  expect(wakeFrame.paintedAt! - wakeFrame.transcriptAt!).toBeCloseTo(wakeFrame.acknowledgementMs!, 1);
  const rewardMascot = await entranceMascotGeometry(page);
  expectVisibleEntranceMascot(rewardMascot);
  expect(Math.hypot(
    rewardMascot.mascot.centerX - restingMascot.mascot.centerX,
    rewardMascot.mascot.centerY - restingMascot.mascot.centerY,
  )).toBeLessThanOrEqual(24);

  const wakeSamples = await sampleWakeChoreography(page);
  // Soft assertions still fail this test and the release gate. Continue only
  // to preserve complete functional/visual evidence when the host drops frames.
  expect.soft(wakeSamples.map((sample) => sample.interval), "every choreography interval needs its own observed native frame").toEqual([0, 1, 2, 3, 4, 5]);
  expect.soft(new Set(wakeSamples.map((sample) => sample.at)).size).toBe(6);
  expect.soft(wakeSamples.some((sample) => sample.entrance === "wake-reward")).toBe(true);
  expect.soft(wakeSamples.some((sample) => sample.entrance === "preparing")).toBe(true);
  expect.soft(wakeSamples.filter((sample) => sample.entrance !== "wake-armed").every((sample) => sample.ceremony === "active")).toBe(true);
  expect.soft(new Set(wakeSamples.map((sample) => sample.body)).size).toBeGreaterThanOrEqual(4);
  expect.soft(new Set(wakeSamples.map((sample) => sample.eyes)).size).toBeGreaterThanOrEqual(2);
  expect.soft(new Set(wakeSamples.map((sample) => sample.sprout)).size).toBeGreaterThanOrEqual(3);
  expect.soft(new Set(wakeSamples.map((sample) => sample.leftArm)).size).toBeGreaterThanOrEqual(2);
  expect.soft(wakeSamples.some((sample) => sample.leafOpacities.some((opacity) => opacity > 0.15))).toBe(true);
  expect.soft(wakeSamples.some((sample) => sample.rippleOpacity > 0.15)).toBe(true);
  expect.soft(wakeSamples.at(-1)?.runningWakeAnimations).toBe(0);

  await expect(page.getByRole("heading", { name: "I’m listening…" })).toBeVisible({ timeout: 3_200 });
  await waitForRestart(page, wakeGeneration);
  for (const name of ["Calendar", "Journal", "Atmosphere", "Memories"]) await expect(page.getByRole("button", { name: `Open ${name}` })).toBeVisible();
  const timings = await page.evaluate(() => (window as Window & { __FLOW_LOCKED_HOME__?: {
    wakeAcknowledgementMs?: number; wakeTranscriptAt?: number; wakeFirstFrameAt?: number; wakePaintedAt?: number; wakeToHomeMs?: number;
    wakeRewardMs?: number; preparingMs?: number; preparingPainted?: boolean; preparingPresentedAt?: number; preparingPaintedAt?: number;
    preparingStartedAt?: number;
    wakeRewardPublishedAt?: number;
    wakeElementEntries?: string[]; wakeElementPaintedAt?: number; wakeElementPaintMs?: number; wakePaintSource?: string;
  } }).__FLOW_LOCKED_HOME__);
  expect(timings?.wakeAcknowledgementMs).toBeGreaterThan(0);
  expect.soft(timings?.wakeAcknowledgementMs).toBeLessThan(100);
  expect(timings?.wakeElementEntries).toContain("flow-wake-shell-2");
  expect(timings?.wakeElementPaintedAt).toBeDefined();
  expect(timings?.wakeElementPaintMs).toBeGreaterThan(0);
  expect.soft(timings?.wakeElementPaintMs).toBeLessThan(100);
  expect(timings!.wakePaintedAt! - timings!.wakeTranscriptAt!).toBeCloseTo(timings!.wakeAcknowledgementMs!, 1);
  expect(timings?.wakeRewardMs).toBeGreaterThanOrEqual(1_200);
  expect.soft(timings?.wakeRewardMs).toBeLessThanOrEqual(2_000);
  expect(timings?.preparingMs).toBeGreaterThanOrEqual(800);
  expect.soft(timings?.preparingMs).toBeLessThanOrEqual(1_400);
  expect(timings?.wakeToHomeMs).toBeGreaterThanOrEqual(2_000);
  expect.soft(timings?.wakeToHomeMs).toBeLessThanOrEqual(3_000);
  expect.soft(timings?.preparingPainted, "missing preparation paint still fails release; retain visual evidence").toBe(true);
  expect.soft(timings?.preparingPresentedAt).toBeLessThanOrEqual(timings!.preparingPaintedAt!);
  for (const sample of wakeSamples) {
    expect.soft(sample.entrance, `observed phase at native frame ${sample.at}`).toBe(sample.at < timings!.wakeRewardPublishedAt! ? "wake-armed" : sample.at < timings!.preparingStartedAt! ? "wake-reward" : "preparing");
  }
  console.info("LOCKED_WAKE_TIMING", JSON.stringify(timings));
  console.info("LOCKED_WAKE_CHOREOGRAPHY", JSON.stringify(wakeSamples));
  await captureNormalized(page, "02-active-home.png");

  // Screenshot capture itself can block Chromium's main thread long enough to
  // corrupt a wake-duration measurement. Preserve the reward evidence in an
  // isolated untimed page after the performance contract has passed.
  const evidencePage = await page.context().newPage();
  await evidencePage.emulateMedia({ reducedMotion: "no-preference" });
  await installGrantedRecognition(evidencePage);
  await evidencePage.setViewportSize({ width: 1_440, height: 1_000 });
  await fresh(evidencePage);
  const evidenceRestingMascot = await entranceMascotGeometry(evidencePage);
  expectVisibleEntranceMascot(evidenceRestingMascot);
  await captureNormalized(evidencePage, "01-wake-armed.png");
  const evidenceWake = await beginWakeSpeech(evidencePage, "Flow");
  expect(evidenceWake.wakeFrame).toMatchObject({ entrance: "wake-reward", heading: "Hi there!", face: "happy", lift: "22", leafCount: 3, ceremony: "active" });
  const evidenceRewardMascot = await entranceMascotGeometry(evidencePage);
  expectVisibleEntranceMascot(evidenceRewardMascot);
  expect(Math.hypot(
    evidenceRewardMascot.mascot.centerX - evidenceRestingMascot.mascot.centerX,
    evidenceRewardMascot.mascot.centerY - evidenceRestingMascot.mascot.centerY,
  )).toBeLessThanOrEqual(24);
  await captureNormalized(evidencePage, "02-wake-reward.png");
  await expect(evidencePage.getByRole("heading", { name: "All set." })).toBeVisible({ timeout: 2_200 });
  await expect(evidencePage.locator("[data-wake-ceremony='active']")).toBeVisible();
  await captureNormalized(evidencePage, "02-preparing-overlap.png");
  await evidencePage.close();
});

test("speech interrupts wake reward and the locked compound commits and rewinds exactly once", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await fresh(page);
  const { generation: wakeGeneration, wakeFrame } = await beginWakeSpeech(page, "Flow");
  expect(wakeFrame.entrance).toBe("wake-reward");
  expect(["wake-reward", "preparing"]).toContain(await waitForRestartEntrance(page, wakeGeneration));
  await speak(page, "Open my journal");
  await expect(page).toHaveURL(/\/journal$/);
  await speak(page, "Home");
  await expect(page.getByTestId("home-space")).toHaveAttribute("data-home-entrance", "active");

  await observeNextCompoundAcknowledgement(page);
  await speak(page, "Open my journal and leave Sunday evening playing");
  const acknowledgement = await page.evaluate(() => (window as Window & { __lockedCompoundAck?: unknown }).__lockedCompoundAck);
  expect(acknowledgement).toEqual({ text: "“Open my journal and leave Sunday evening playing”", domain: "journal", route: "/", past: 0 });
  console.info("LOCKED_COMPOUND_ACK", JSON.stringify(acknowledgement));
  await expect(page).toHaveURL(/\/journal$/);
  const committed = await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!));
  expect(committed.past).toHaveLength(1);
  expect(committed.document.studio.activeAtmosphere).toMatchObject({ playing: true });
  expect(committed.document.studio.workspace).toMatchObject({ primary: "journal", secondary: "atmosphere" });
  await captureNormalized(page, "03-journal-atmosphere-compound.png");

  await speak(page, "Undo");
  const undone = await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!));
  expect(undone.past).toHaveLength(0);
  expect(undone.document.studio.activeAtmosphere).toBeUndefined();
  await speak(page, "Redo");
  const redone = await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!));
  expect(redone.past).toHaveLength(1);
  expect(redone.document.studio.activeAtmosphere).toMatchObject({ playing: true });

  await speak(page, "New entry");
  await speak(page, "Start with my voice");
  await speak(page, "The street was quiet after the rain");
  await speak(page, "Stop recording");
  const journal = await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!));
  expect(journal.document.studio.journalEntries).toContainEqual(expect.objectContaining({
    text: expect.stringContaining("The street was quiet after the rain"), recordingState: "idle",
  }));
  expect(journal.document.captures).toHaveLength(0);
});

test("semantic target is painted before execution and Calendar identity morphs in both directions", async ({ page }) => {
  test.setTimeout(60_000);
  // Deep work is genuinely near-term at this domain time. Only Date is
  // shifted; native rAF, performance.now and WAAPI remain unmodified.
  await useNativeAnimationClock(page, "2026-09-07T09:00:00");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await fresh(page);
  await speak(page, "Flow");
  await expect(page.getByRole("heading", { name: "I’m listening…" })).toBeVisible({ timeout: 5_000 });
  await expect(page.locator("[data-calendar-event-continuity='deep-work']")).toBeVisible();
  await page.waitForTimeout(700);

  const { generation, timeline } = await sampleTargetMotion(page, "Open my calendar");
  console.info("LOCKED_TARGET_RAW_TIMELINE", JSON.stringify({
    eyeStartedAt: timeline.eyeStartedAt,
    bodyStartedAt: timeline.bodyStartedAt,
    worldStartedAt: timeline.worldStartedAt,
    targetStageScheduleMs: timeline.targetStageScheduleMs,
    paintedFrame: timeline.paintedFrame,
    firstSamples: timeline.samples.slice(0, 18),
  }));
  expect(timeline.paintedFrame).toEqual({ cardTargeted: "true", mascotDomain: "today", mascotDirection: "left", pulseMode: "semantic-travel" });
  expect(timeline.eyeStartedAt).toBeDefined();
  expect(timeline.bodyStartedAt).toBeDefined();
  expect(timeline.worldStartedAt).toBeDefined();
  expect(timeline.targetStageScheduleMs).toEqual({ eyes: 0, body: 30, world: 75 });
  expect(timeline.eyeStartedAt!).toBeLessThan(timeline.bodyStartedAt!);
  expect(timeline.bodyStartedAt!).toBeLessThan(timeline.worldStartedAt!);
  // RESPONSE is the first painted semantic target below. The authored world
  // follow-through may cross a frame boundary under a loaded compositor, but
  // it must still start inside the MICRO presentation window.
  expect.soft(timeline.worldStartedAt!).toBeLessThanOrEqual(320);

  expect(timeline.pulseOrigin).toBeDefined();
  expect(timeline.pulseTarget).toBeDefined();
  expect(Math.hypot(timeline.pulseTarget!.x - timeline.pulseOrigin!.x, timeline.pulseTarget!.y - timeline.pulseOrigin!.y)).toBeGreaterThan(100);
  const pulseSamples = timeline.samples.filter((sample) => sample.travelerProgress !== undefined);
  expect.soft(pulseSamples.some((sample) => sample.travelerProgress! > 0.1 && sample.travelerProgress! < 0.9 && sample.travelerOpacity! > 0.1), "a real intermediate traveler frame must remain observable").toBe(true);
  expect(Math.max(...pulseSamples.map((sample) => sample.travelerProgress!))).toBeGreaterThan(0.8);

  const source = timeline.samples.find((sample) => sample.route === "/" && sample.continuity)?.continuity;
  const destination = [...timeline.samples].reverse().find((sample) => sample.route === "/today" && sample.continuity)?.continuity;
  expect(source).toBeDefined();
  expect(destination).toBeDefined();
  const centerDistance = (from: NonNullable<typeof source>, to: NonNullable<typeof source>) => Math.hypot(
    from.x + from.width / 2 - (to.x + to.width / 2),
    from.y + from.height / 2 - (to.y + to.height / 2),
  );
  const continuityDistance = centerDistance(source!, destination!);
  expect(continuityDistance).toBeGreaterThan(80);
  const intermediateContinuity = timeline.samples.find((sample) => sample.route === "/today" && sample.continuity
    && centerDistance(source!, sample.continuity) > 8
    && centerDistance(sample.continuity, destination!) > 8);
  expect.soft(intermediateContinuity, "the preview event visibly travels between Home and Calendar geometry").toBeDefined();
  await expect(page).toHaveURL(/\/today$/);
  await captureNormalized(page, "04-calendar-morph.png");
  await waitForRestart(page, generation);
  await expect(page.locator("[data-calendar-event-continuity='deep-work']")).toBeVisible();
  const timing = await page.evaluate(() => (window as Window & { __FLOW_LOCKED_HOME__?: {
    targetAcknowledgementMs?: number; targetAcknowledgedAt?: number; targetFirstFrameAt?: number; targetPaintedAt?: number; targetResponsePaintMs?: number; executionStartedAt?: number; navigationAppliedAt?: number; targetPresentedMs?: number; targetPaintBeforeExecute?: boolean;
    targetEyeMotionAt?: number; targetBodyMotionAt?: number; targetWorldMotionAt?: number; targetPulseMotionAt?: number; targetMotionReadyAt?: number; targetHandshakeStalled?: boolean;
    targetElementPainted?: boolean; targetPulsePainted?: boolean; mascotAttentionPainted?: boolean;
  } }).__FLOW_LOCKED_HOME__);
  expect(timing?.targetPaintBeforeExecute).toBe(true);
  expect(timing?.targetAcknowledgementMs).toBeGreaterThan(0);
  expect.soft(timing?.targetAcknowledgementMs).toBeLessThanOrEqual(140);
  expect(timing?.targetResponsePaintMs).toBeGreaterThanOrEqual(0);
  expect.soft(timing?.targetResponsePaintMs).toBeLessThanOrEqual(140);
  expect(timing?.targetPresentedMs).toBeGreaterThanOrEqual(140);
  expect.soft(timing?.targetPresentedMs).toBeLessThanOrEqual(320);
  expect(timing?.targetElementPainted).toBe(true);
  expect(timing?.targetPulsePainted).toBe(true);
  expect(timing?.mascotAttentionPainted).toBe(true);
  expect(timing?.targetEyeMotionAt).toBeLessThan(timing!.targetBodyMotionAt!);
  expect(timing?.targetBodyMotionAt).toBeLessThan(timing!.targetWorldMotionAt!);
  expect(timing?.targetWorldMotionAt).toBeLessThan(timing!.targetPulseMotionAt!);
  expect(timing?.targetMotionReadyAt).toBe(timing?.targetPulseMotionAt);
  expect(timing?.targetPulseMotionAt).toBeLessThanOrEqual(timing!.executionStartedAt!);
  expect(timing?.targetHandshakeStalled).not.toBe(true);
  expect(timing?.targetPaintedAt).toBeLessThanOrEqual(timing!.executionStartedAt!);
  expect(timing?.executionStartedAt).toBeLessThanOrEqual(timing!.navigationAppliedAt!);
  console.info("LOCKED_TARGET_TIMING", JSON.stringify(timing));
  console.info("LOCKED_TARGET_STAGING", JSON.stringify({
    eyeStartedAt: timeline.eyeStartedAt,
    bodyStartedAt: timeline.bodyStartedAt,
    worldStartedAt: timeline.worldStartedAt,
    targetStageScheduleMs: timeline.targetStageScheduleMs,
    pulseOrigin: timeline.pulseOrigin,
    pulseTarget: timeline.pulseTarget,
    pulseIntermediateFrames: pulseSamples.filter((sample) => sample.travelerProgress! > 0.1 && sample.travelerProgress! < 0.9).length,
    continuityDistance,
    continuityIntermediateFrame: intermediateContinuity,
    frameIntervalsMs: timeline.samples.slice(1).map((sample, index) => sample.at - timeline.samples[index].at),
  }));

  await speak(page, "Home");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("[data-calendar-event-continuity='deep-work']")).toBeVisible();
  await page.waitForTimeout(700);
  await captureNormalized(page, "04-calendar-return-continuity.png");

  // Capture the actual in-flight states on an unmeasured second transition.
  // The strict response/staging measurement above remains free of screenshot
  // encoding stalls; these frames provide visually reviewable corroboration.
  const evidenceGeneration = await beginSpeech(page, "Open my calendar");
  await expect(page.locator("[data-voice-pulse-traveler]")).toBeVisible();
  await page.waitForTimeout(70);
  await captureNormalized(page, "04-target-pulse-intermediate.png");
  await expect(page).toHaveURL(/\/today$/);
  await waitForRestart(page, evidenceGeneration);

  await speak(page, "Home");
  await expect(page).toHaveURL(/\/$/);
  await page.waitForTimeout(700);
  const continuityGeneration = await beginSpeech(page, "Open my calendar");
  await expect(page).toHaveURL(/\/today$/);
  await page.waitForFunction(() => {
    const event = document.querySelector("[data-calendar-event-continuity='deep-work']");
    const width = event?.getBoundingClientRect().width ?? 0;
    return width > 0 && width < 1_000;
  }, undefined, { timeout: 1_000 });
  await captureNormalized(page, "04-calendar-continuity-intermediate.png");
  await waitForRestart(page, continuityGeneration);
});

test("wake session moves a Calendar event and undo returns the same stable object", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await fresh(page);
  await speak(page, "Flow");
  await expect(page.getByRole("heading", { name: "I’m listening…" })).toBeVisible({ timeout: 5_000 });
  await speak(page, "Open my calendar");
  await expect(page).toHaveURL(/\/today$/);
  await speak(page, "Move deep work to four PM");
  await expect(page.getByRole("button", { name: /Deep work — project brief, 4 PM–5 PM/ })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).past.length)).toBe(1);
  await speak(page, "Undo");
  await expect(page.getByRole("button", { name: /Deep work — project brief, 9 AM–10 AM/ })).toBeVisible();
  await expect(page.locator("[data-calendar-event-continuity='deep-work']")).toBeVisible();
  await captureNormalized(page, "05-calendar-voice-undo.png");
});

test("typed keyboard edits preserve near-term Home, exact history and reload on a narrow viewport", async ({ page }) => {
  test.setTimeout(60_000);
  await useNativeAnimationClock(page, "2026-09-07T14:22:00");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await fresh(page);
  await typeCommand(page, "Home");
  const preview = page.locator("[data-home-calendar-preview] [data-life-entity-id]");
  await expect.poll(() => preview.evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.lifeEntityId)))
    .toEqual(["roadmap", "workout", "interview", "dinner"]);
  await assertHomeReadability(page);
  await captureNormalized(page, "08-near-term-home.png");
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!));
  await typeCommand(page, "Make roadmap red and important");
  const changed = await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!));
  expect(changed.past.length).toBe(before.past.length + 1);
  expect(changed.document.calendar.events.find((event: { id: string }) => event.id === "roadmap")).toMatchObject({ color: "red", importance: "important" });
  await typeCommand(page, "Undo");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).document)).toEqual(before.document);
  await typeCommand(page, "Redo");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).document)).toEqual(changed.document);
  await page.reload();
  await expect(page.getByTestId("home-space")).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).document)).toEqual(changed.document);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).past.length)).toBe(changed.past.length);
  await typeCommand(page, "Home");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Open Calendar" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await expect(page.getByLabel("Global Flow command")).toBeVisible();
  await assertHomeReadability(page);
  await page.screenshot({ path: `${evidenceDir}/09-narrow-home-reload.png`, animations: "allow" });
  console.info("LOCKED_TYPED_RELOAD", JSON.stringify({ keyboard: true, documentExact: true, historyExact: true, narrowWidth: 390, overflow: false }));
});

test("Atmosphere follow-up and visible last-one reference use the same live context", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await fresh(page);
  await speak(page, "Flow");
  await expect(page.getByRole("heading", { name: "I’m listening…" })).toBeVisible({ timeout: 5_000 });

  await speak(page, "Play Sunday evening");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).document.studio.activeAtmosphere?.playing)).toBe(true);
  const rainBefore = await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).document.studio.activeAtmosphere.layers.find((layer: { id: string }) => layer.id === "rain").volume);
  await speak(page, "Less rain");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).document.studio.activeAtmosphere.layers.find((layer: { id: string }) => layer.id === "rain").volume)).toBeLessThan(rainBefore);
  await expect(page.locator("[data-atmosphere-preview-layer='rain']")).toHaveAttribute("data-layer-volume", String(Math.max(0, rainBefore - 0.12)));

  const lastGeneration = await beginSpeech(page, "Make the last one red");
  await expect(page.locator("[data-visible-reference='resolved']")).toContainText("Dinner");
  await expect(page.locator("[data-visible-reference='resolved']")).toHaveAttribute("data-color", "red");
  await waitForRestart(page, lastGeneration);
  await speak(page, "Make it important");
  await expect.poll(() => page.evaluate(() => {
    const events = JSON.parse(localStorage.getItem("flow.life.v3")!).document.calendar.events;
    return events.find((event: { id: string }) => event.id === "dinner")?.importance;
  })).toBe("important");
  await captureNormalized(page, "06-atmosphere-reference-followup.png");
  await speak(page, "Make this one blue");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).document.calendar.events.find((event: { id: string }) => event.id === "dinner")?.color)).toBe("blue");
});

test("ambiguous Home references reveal candidates and accept a spoken choice without premature history", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await fresh(page);
  await speak(page, "Flow");
  await expect(page.getByRole("heading", { name: "I’m listening…" })).toBeVisible({ timeout: 5_000 });
  await speak(page, "Add a 30 minute product meeting at 10");
  await speak(page, "Add a 30 minute hiring meeting at 3");
  await speak(page, "Home");
  const beforeClarification = await page.evaluate(() => localStorage.getItem("flow.life.v3"));
  await speak(page, "Move the meeting to 8:30 am");
  await expect(page.getByText("Which meeting do you mean?")).toBeVisible();
  await expect(page.locator("[data-visible-reference='candidate']")).toHaveCount(2);
  await expect(page.locator("[data-visible-reference='candidate']").filter({ hasText: "Product meeting" })).toContainText("Possible match");
  expect(await page.evaluate(() => localStorage.getItem("flow.life.v3"))).toBe(beforeClarification);
  await speak(page, "The first one");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).document.calendar.events.find((event: { title: string }) => event.title === "Product meeting")?.start)).toBe(510);
});

test("reduced motion preserves wake, targeting, and semantic continuity without travel", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await fresh(page);
  const { generation: wakeGeneration, wakeFrame } = await beginWakeSpeech(page, "Flow");
  expect(wakeFrame.leafCount).toBe(0);
  await waitForRestart(page, wakeGeneration);
  await expect(page.getByRole("heading", { name: "I’m listening…" })).toBeVisible({ timeout: 700 });
  const { generation: commandGeneration, paintedFrame } = await beginTargetedSpeech(page, "Open my calendar");
  expect(paintedFrame).toMatchObject({ cardTargeted: "true", mascotDomain: "today", mascotDirection: "left", pulseMode: "reduced-target" });
  await expect(page).toHaveURL(/\/today$/);
  await waitForRestart(page, commandGeneration);
  await expect(page.locator("[data-space-transition-mode='reduced']")).toBeVisible();
  await expect(page.locator("[data-calendar-event-continuity='deep-work']")).toBeVisible();
  await captureNormalized(page, "07-reduced-motion-calendar.png");
});
