import type { Page } from "@playwright/test";
import { fork, type ChildProcess } from "node:child_process";

/** Read-only observation: native animation time, actual layout, and paint state. */
export function readNativeFrameState() {
  const observedAt = performance.now();
  const dockElement = document.querySelector<HTMLElement>('[aria-label="Global Flow command"]');
  const dock = dockElement?.getBoundingClientRect();
  const visiblyPainted = (element: HTMLElement | null) => {
    for (let current = element; current; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) < 0.01) return false;
    }
    return Boolean(element);
  };
  const mascotElement = document.querySelector<HTMLElement>("[data-mascot-renderer]");
  const mascot = mascotElement && visiblyPainted(mascotElement) ? mascotElement.getBoundingClientRect() : undefined;
  const intersects = (left?: DOMRect, right?: DOMRect) => Boolean(left && right && left.width > 0 && left.height > 0 && right.width > 0 && right.height > 0 && left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top);
  const primaryRects = [...document.querySelectorAll<HTMLElement>("[data-event-id], [data-time-scope-control], [aria-label='Global Flow command'], [data-elite-lens-grid] > div, [data-elite-lens-grid] button, [data-elite-lens-grid] h2")].map((element) => element.getBoundingClientRect());
  const label = document.querySelector<HTMLElement>("[data-reward-label]")?.getBoundingClientRect();
  const headings = [...document.querySelectorAll<HTMLElement>("h1, h2, [data-page-eyebrow]")].map((element) => element.getBoundingClientRect());
  const now = document.querySelector<HTMLElement>('[data-testid="calendar-space"] [data-testid="now-space"]')?.getBoundingClientRect();
  const routeText = [...document.querySelectorAll<HTMLElement>('[data-world-heading] h1, [data-world-heading] h2, [data-world-heading] p, [data-testid="calendar-space"] h1, [data-testid="calendar-space"] [data-page-eyebrow], [data-testid="calendar-space"] > div:first-child > div:last-child > p:first-child')].map((element) => {
    const rect = element.getBoundingClientRect();
    return { text: element.textContent, scaleX: rect.width / element.offsetWidth, scaleY: rect.height / element.offsetHeight, overlapsNow: intersects(rect, now), top: rect.top, bottom: rect.bottom };
  });
  const rectInside = (rect?: DOMRect) => !rect || rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1;
  const auditCompletedAt = performance.now();
  return {
    now: observedAt, auditCompletedAt, timeline: document.timeline.currentTime,
    routeText,
    homeSceneAnimations: document.querySelector("[data-home-date-scene]")?.getAnimations().map((animation) => ({ currentTime: animation.currentTime, startTime: animation.startTime, duration: animation.effect?.getComputedTiming().duration })) ?? [],
    animations: [...document.querySelectorAll<HTMLElement>("[data-reward-wash], [data-reward-target], [data-reward-label], [data-transition-clone-count], [data-home-temporal-scene], [data-home-date-scene], [data-mascot-renderer]")]
      .flatMap((element) => element.getAnimations())
      .filter(({ playState }) => playState === "running")
      .map((animation) => ({ currentTime: animation.currentTime, startTime: animation.startTime, timing: animation.effect?.getComputedTiming() })),
    audit: {
      hasWorld: Boolean(document.querySelector("[data-space-shell]")), overflow: document.documentElement.scrollWidth - innerWidth,
      dockInside: Boolean(dock && dock.width > 0 && dock.height > 0 && rectInside(dock)), dockPainted: visiblyPainted(dockElement),
      mascotInside: rectInside(mascot), mascotPrimaryCollisions: primaryRects.filter((rect) => intersects(mascot, rect)).length,
      rewardLabelHeadingCollisions: headings.filter((rect) => intersects(label, rect)).length,
      clones: document.querySelectorAll("[data-transition-clone-count]").length,
      rewardTargets: document.querySelectorAll("[data-reward-target]").length,
    },
  };
}

export type NativeFrameState = ReturnType<typeof readNativeFrameState>;
interface CompositorFrame {
  data: string;
  metadataTimestamp: number;
  captureNativeMs: number;
  receivedNativeMs: number;
  arrivalLagMs: number;
  sessionId: number;
  checkpoint: number;
  metadata: Record<string, unknown>;
}
interface WorkerCapture {
  type: "captured";
  startedAt: number;
  frames: CompositorFrame[];
  states: NativeFrameState[];
  rawFrameCount: number;
  rendererTimeOriginMs: number;
}

function waitForWorker<T extends { type: string }>(worker: ChildProcess, expectedType: string, trigger?: () => void) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error(`Compositor capture worker did not report ${expectedType}`)), 20_000);
    const onMessage = (message: T & { message?: string }) => {
      if (message.type === "error") finish(new Error(message.message ?? "Compositor capture worker failed"));
      else if (message.type === expectedType) finish(undefined, message);
    };
    const onError = (error: Error) => finish(error);
    const onExit = (code: number | null) => finish(new Error(`Compositor capture worker exited before ${expectedType} (${code ?? "signal"})`));
    const finish = (error?: Error, value?: T) => {
      clearTimeout(timeout);
      worker.off("message", onMessage);
      worker.off("error", onError);
      worker.off("exit", onExit);
      if (error) reject(error); else resolve(value!);
    };
    worker.on("message", onMessage);
    worker.once("error", onError);
    worker.once("exit", onExit);
    trigger?.();
  });
}

/** Metadata-timestamped Chromium compositor frames, never synthetic poses. */
export async function startNativeFrameCapture(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const viewport = page.viewportSize();
  const frames: CompositorFrame[] = [];
  const states: NativeFrameState[] = [];
  const errors: string[] = [];
  const { targetInfo } = await cdp.send("Target.getTargetInfo");
  const workerPort = Number(process.env.FLOW_MOTION_CDP_PORT ?? 9223);
  const worker = fork(new URL("./compositor-capture-worker.mjs", import.meta.url), [], { stdio: ["ignore", "ignore", "pipe", "ipc"] });
  let diagnostics = "";
  worker.stderr?.on("data", (chunk) => { diagnostics += chunk.toString(); });
  try {
    await waitForWorker(worker, "ready", () => worker.send({ type: "initialize", port: workerPort, targetId: targetInfo.targetId }));
  } catch (error) {
    worker.kill();
    throw new Error(`${error instanceof Error ? error.message : String(error)}${diagnostics ? `: ${diagnostics}` : ""}`);
  }
  let captureResult: Promise<WorkerCapture> | undefined;
  let rawFrameCount = 0;
  let rendererTimeOriginMs = 0;
  return {
    frames,
    async armCheckpoints(options: {
      startKind: "animation" | "reward";
      durationMs: number;
      selector?: string;
      checkpoints: Array<{ checkpoint: number; offsetMs: number; toleranceMs: number }>;
    }) {
      captureResult = waitForWorker<WorkerCapture>(worker, "captured");
      await waitForWorker(worker, "armed", () => worker.send({
        type: "arm", startKind: options.startKind, durationMs: options.durationMs, selector: options.selector,
        checkpoints: options.checkpoints, stateExpression: `(${readNativeFrameState.toString()})()`, viewport,
      }));
    },
    async submitCommand() {
      // Native keyboard input reaches the already-filled production field.
      // Avoid a trace recorder DOM snapshot in the first painted cue frames.
      await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r", unmodifiedText: "\r" });
      await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    },
    async takePublishedRewardStart(timeoutMs = 5_000) {
      // Stay on the CDP transport used for the native key event. A traced
      // Playwright wait can be delayed by DOM snapshotting long enough to miss
      // the first 20% checkpoint after the preceding stress workload.
      const deadline = Date.now() + timeoutMs;
      while (Date.now() <= deadline) {
        const result = await cdp.send("Runtime.evaluate", {
          expression: `(() => {
            const runtime = window;
            if (!runtime.__FLOW_CAPTURE_IS_STARTED__?.()) return null;
            const startedAt = runtime.__FLOW_CAPTURE_START__?.();
            return typeof startedAt === "number" ? startedAt : null;
          })()`,
          returnByValue: true,
        });
        if (typeof result.result.value === "number") return result.result.value;
        await new Promise((resolve) => setTimeout(resolve, 2));
      }
      throw new Error("Signature did not publish its expected active reward after the real trigger");
    },
    async captureCheckpoints() {
      if (!captureResult) throw new Error("Native compositor checkpoints were not armed before the production trigger");
      try {
        const result = await captureResult;
        frames.push(...result.frames);
        states.push(...result.states);
        rawFrameCount = result.rawFrameCount;
        rendererTimeOriginMs = result.rendererTimeOriginMs;
        return [result.startedAt];
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
        throw error;
      }
    },
    async stop() {
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => { worker.kill(); resolve(); }, 2_000);
        worker.once("exit", () => { clearTimeout(timeout); resolve(); });
        if (worker.connected) worker.send({ type: "shutdown" }); else { clearTimeout(timeout); resolve(); }
      });
      await cdp.detach();
      return { frames, states, errors, rawFrameCount, rendererTimeOriginMs };
    },
  };
}
