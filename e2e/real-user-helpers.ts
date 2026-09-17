import { expect, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import type { LifeSnapshot } from "../src/domain/life-model";

export const acceptanceDirectory = process.env.REAL_USER_EVIDENCE_DIR ?? "artifacts/real-user-acceptance/browser";
export const acceptanceViewports = [
  [1280, 720], [1280, 800], [1366, 768], [1440, 900], [1512, 982], [1728, 1117], [1920, 1080],
] as const;

/** Only browser ASR is injected. getUserMedia, MediaRecorder, IndexedDB,
 * HTMLAudioElement, play(), seeking and native decoders are untouched. */
export async function installAcceptanceRecognition(page: Page) {
  await page.addInitScript(() => {
    class Recognition {
      continuous = true; interimResults = true; maxAlternatives = 1; lang = "en-US";
      onstart: (() => void) | null = null; onend: (() => void) | null = null;
      onresult: ((value: unknown) => void) | null = null; onerror: ((value: unknown) => void) | null = null;
      start() {
        Object.assign(window, { __acceptanceRecognition: this, __acceptanceReady: true, __acceptanceStarts: ((window as Window & { __acceptanceStarts?: number }).__acceptanceStarts ?? 0) + 1 });
        this.onstart?.();
      }
      stop() { Object.assign(window, { __acceptanceReady: false }); this.onend?.(); }
      abort() { this.stop(); }
      emit(transcript: string, final: boolean, duplicate = false) {
        const result = Object.assign({ 0: { transcript, confidence: 0.98 } }, { isFinal: final, length: 1 });
        const event = { resultIndex: 0, results: [result] };
        this.onresult?.(event);
        if (duplicate) this.onresult?.(event);
        if (final) { Object.assign(window, { __acceptanceReady: false }); this.onend?.(); }
      }
    }
    Object.assign(window, { SpeechRecognition: Recognition });
  });
}

export async function startAcceptance(page: Page, path = "/") {
  await page.goto(path);
  const mic = page.getByLabel("Start Flow Live", { exact: true });
  if (await mic.count()) await mic.click();
  await expect.poll(() => page.evaluate(() => Boolean((window as Window & { __acceptanceReady?: boolean }).__acceptanceReady))).toBe(true);
}

export async function finalSpeech(page: Page, transcript: string, duplicate = false) {
  await expect.poll(() => page.evaluate(() => Boolean((window as Window & { __acceptanceReady?: boolean }).__acceptanceReady))).toBe(true);
  await page.evaluate(({ transcript, duplicate }) => {
    const recognition = (window as Window & { __acceptanceRecognition?: { emit(text: string, final: boolean, duplicate?: boolean): void } }).__acceptanceRecognition!;
    recognition.emit(transcript, true, duplicate);
  }, { transcript, duplicate });
  await expect(page.getByLabel("Global Flow command")).toHaveAttribute("data-last-transcript", transcript);
}

export async function interimSpeech(page: Page, transcript: string) {
  await page.evaluate((transcript) => (window as Window & { __acceptanceRecognition?: { emit(text: string, final: boolean): void } }).__acceptanceRecognition!.emit(transcript, false), transcript);
}

export async function typedCommand(page: Page, transcript: string) {
  await page.keyboard.press("Control+k");
  const field = page.getByRole("textbox", { name: "Tell Flow what to change" });
  await expect(field).toBeFocused();
  await field.fill(transcript); await field.press("Enter");
  await expect(page.getByLabel("Global Flow command")).toHaveAttribute("data-last-transcript", transcript);
}

export function lifeSnapshot(page: Page): Promise<LifeSnapshot> {
  return page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!));
}

export async function acceptanceShot(page: Page, name: string) {
  await page.screenshot({ path: `${acceptanceDirectory}/${name}.png`, caret: "hide", animations: "allow" });
}

export async function settledHomeShot(page: Page, name: string) {
  const observe = () => page.evaluate(async () => {
    const samples: Array<{ phase?: string; running: number; opacity: number; rectangles: number[][] }> = [];
    for (let frame = 0; frame < 8; frame += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const home = document.querySelector<HTMLElement>("[data-testid='home-space']");
      const scene = home?.querySelector<HTMLElement>("[data-home-temporal-scene]");
      const rectangles = ["[data-home-hero]", "[data-home-domain='today']", "[data-home-mascot-flight]"].flatMap((selector) => {
        const rect = home?.querySelector(selector)?.getBoundingClientRect();
        return rect ? [[rect.x, rect.y, rect.width, rect.height]] : [];
      });
      samples.push({ phase: home?.dataset.voicePhase, running: home?.getAnimations({ subtree: true }).filter((animation) => animation.playState === "running" || animation.pending).length ?? -1, opacity: scene ? Number(getComputedStyle(scene).opacity) : 0, rectangles });
    }
    const first = samples[0]!;
    const maximumDrift = Math.max(...samples.flatMap((sample) => sample.rectangles.flatMap((rect, index) => rect.map((value, dimension) => Math.abs(value - (first.rectangles[index]?.[dimension] ?? Infinity))))));
    const stable = samples.every((sample) => sample.rectangles.length === 3 && sample.running === 0 && sample.opacity >= 0.99 && !["targeting", "executing"].includes(sample.phase ?? "")) && maximumDrift <= 0.5;
    return { stable, maximumDrift, samples };
  });
  await expect.poll(async () => (await observe()).stable, { message: "Home must finish its real entrance and hold stable geometry before settled evidence" }).toBe(true);
  const evidence = await observe(); expect(evidence.stable).toBe(true);
  writeFileSync(`${acceptanceDirectory}/${name}-settled.json`, JSON.stringify(evidence, null, 2));
  await acceptanceShot(page, name);
}

/** Prearm native frame observation: a screenshot requested after an assertion
 * can already show the destination. No product clock or animation is paused. */
export async function armTargetScreenshot(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const frames: Array<{ data: string; timestamp: number }> = [];
  cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    if (metadata.timestamp) frames.push({ data, timestamp: metadata.timestamp * 1000 });
    void cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => undefined);
  });
  await page.evaluate(() => {
    const observations: Array<{ at: number; route: string; phase?: string; domain?: string; actionId?: string }> = [];
    const runtime = window as Window & { __acceptanceTargetFrames?: typeof observations; __acceptanceTargetRaf?: number };
    runtime.__acceptanceTargetFrames = observations;
    const sample = () => {
      const home = document.querySelector<HTMLElement>("[data-testid='home-space']");
      const acknowledgement = document.querySelector<HTMLElement>("[data-voice-target-acknowledgement]");
      observations.push({ at: performance.timeOrigin + performance.now(), route: location.pathname, phase: home?.dataset.voicePhase, domain: home?.dataset.voiceDomain, actionId: acknowledgement?.dataset.voiceActionId });
      runtime.__acceptanceTargetRaf = requestAnimationFrame(sample);
    };
    sample();
  });
  await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 });
  return async (name: string) => {
    await cdp.send("Page.stopScreencast");
    const observations = await page.evaluate(() => {
      const runtime = window as Window & { __acceptanceTargetFrames?: Array<{ at: number; route: string; phase?: string; domain?: string; actionId?: string }>; __acceptanceTargetRaf?: number };
      cancelAnimationFrame(runtime.__acceptanceTargetRaf ?? 0);
      const value = runtime.__acceptanceTargetFrames ?? [];
      delete runtime.__acceptanceTargetFrames; delete runtime.__acceptanceTargetRaf;
      return value;
    });
    await cdp.detach();
    const eligible = frames.flatMap((frame) => {
      const previous = observations.findLast(({ at }) => at <= frame.timestamp);
      const next = observations.find(({ at }) => at >= frame.timestamp);
      const targeting = (sample: typeof previous) => sample?.route === "/" && sample.phase === "targeting" && sample.domain === "today" && Boolean(sample.actionId);
      return targeting(previous) && targeting(next) && previous!.actionId === next!.actionId && next!.at - previous!.at <= 100 ? [{ frame, previous, next }] : [];
    });
    writeFileSync(`${acceptanceDirectory}/${name}-provenance.json`, JSON.stringify({ source: "Chromium Page.screencastFrame metadata", rawFrameCount: frames.length, eligibleFrameCount: eligible.length, observations, eligible: eligible.map(({ frame, ...audit }) => ({ timestamp: frame.timestamp, ...audit })) }, null, 2));
    expect(eligible.length, "Native pre-dispatch Home targeting frame must exist; a destination screenshot is not substitute evidence").toBeGreaterThan(0);
    writeFileSync(`${acceptanceDirectory}/${name}.png`, Buffer.from(eligible[Math.floor(eligible.length / 2)]!.frame.data, "base64"));
  };
}

export function measureRegions(page: Page, selectors: Record<string, string>) {
  return page.evaluate((selectors) => {
    const rectangles = Object.entries(selectors).flatMap(([name, selector]) => {
      const element = document.querySelector(selector);
      if (!element) return [];
      const raw = element.getBoundingClientRect();
      let { left, top, right, bottom } = raw;
      // Scroll containers reserve space by clipping their content. Compare the
      // actually visible region, retaining the raw bounds for independent QA.
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        const clip = parent.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) { left = Math.max(left, clip.left); right = Math.min(right, clip.right); }
        if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) { top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.bottom); }
      }
      const width = Math.max(0, right - left); const height = Math.max(0, bottom - top);
      if (!width || !height) return [];
      return [{ name, left, top, right, bottom, width, height, unclipped: { left: raw.left, top: raw.top, right: raw.right, bottom: raw.bottom } }];
    });
    const overlaps: string[] = [];
    for (let i = 0; i < rectangles.length; i++) for (const other of rectangles.slice(i + 1)) {
      const a = rectangles[i]!;
      if (Math.min(a.right, other.right) - Math.max(a.left, other.left) > 1 && Math.min(a.bottom, other.bottom) - Math.max(a.top, other.top) > 1) overlaps.push(`${a.name}/${other.name}`);
    }
    return { viewport: { width: innerWidth, height: innerHeight }, rectangles, overlaps };
  }, selectors);
}

export async function nativeMediaEvidence(page: Page, assetId: string) {
  return page.evaluate(async (assetId) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("flow-studio-media", 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const record = await new Promise<{ blob: Blob }>((resolve, reject) => { const request = database.transaction("assets", "readonly").objectStore("assets").get(assetId); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    database.close();
    const context = new AudioContext();
    try {
      const decoded = await context.decodeAudioData(await record.blob.arrayBuffer());
      return { bytes: record.blob.size, mimeType: record.blob.type, decodedSeconds: decoded.duration, sampleRate: decoded.sampleRate, channels: decoded.numberOfChannels, frames: decoded.length };
    } finally { await context.close(); }
  }, assetId);
}
