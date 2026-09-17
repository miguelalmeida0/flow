export interface FlowMotionDiagnostics {
  activeClones: number;
  activeFrameLoops: number;
  peakClones: number;
  completedTransitions: number;
  durationsMs: number[];
  longestMainThreadTaskMs: number;
  droppedFrameEstimate: number;
}

declare global { interface Window { __FLOW_MOTION__?: FlowMotionDiagnostics } }

const activeMeasurements = new Set<() => void>();

export function motionDiagnostics() {
  return window.__FLOW_MOTION__ ??= {
    activeClones: 0, activeFrameLoops: 0, peakClones: 0, completedTransitions: 0,
    durationsMs: [], longestMainThreadTaskMs: 0, droppedFrameEstimate: 0,
  };
}

export function beginMeasuredTransition({ trackFrames = true }: { trackFrames?: boolean } = {}) {
  const started = performance.now();
  const diagnostics = motionDiagnostics();
  diagnostics.activeClones += 1;
  diagnostics.peakClones = Math.max(diagnostics.peakClones, diagnostics.activeClones);
  let frame = 0;
  let observerFrame = 0;
  let frameLoopActive = false;
  let observer: PerformanceObserver | undefined;
  let previousFrame: number | undefined;
  const sampleFrame = (timestamp: number) => {
    // The mount-to-first-paint interval is setup latency, not a missed
    // animation frame. Count only gaps between frames that were actually
    // presented while the flight was active.
    if (previousFrame !== undefined) {
      const gap = timestamp - previousFrame;
      if (gap > 25) diagnostics.droppedFrameEstimate += Math.max(1, Math.round(gap / 16.67) - 1);
    }
    previousFrame = timestamp;
    frame = requestAnimationFrame(sampleFrame);
  };
  const stopFrameLoop = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (frameLoopActive) diagnostics.activeFrameLoops = Math.max(0, diagnostics.activeFrameLoops - 1);
    frameLoopActive = false;
  };
  const stopLongTaskObserver = () => {
    if (observerFrame) cancelAnimationFrame(observerFrame);
    observerFrame = 0;
    observer?.disconnect();
    observer = undefined;
  };
  const startLongTaskObserver = () => {
    observerFrame = 0;
    if (document.hidden || typeof PerformanceObserver === "undefined") return;
    const observedFrom = performance.now();
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // Chromium can deliver the rAF task that installed this observer when
        // that same task later becomes long (for example, an immediate user
        // interruption). It began before the animation measurement window and
        // must not be attributed to the rendered flight.
        if (Number.isFinite(entry.startTime) && entry.startTime < observedFrom) continue;
        diagnostics.longestMainThreadTaskMs = Math.max(diagnostics.longestMainThreadTaskMs, Math.round(entry.duration * 10) / 10);
      }
    });
    try { observer.observe({ entryTypes: ["longtask"] }); } catch { stopLongTaskObserver(); }
  };
  if (trackFrames && !document.hidden) {
    frameLoopActive = true;
    diagnostics.activeFrameLoops += 1;
    frame = requestAnimationFrame(sampleFrame);
  }
  // Observe from the first painted animation frame. Registering during the
  // mounting task attributes command interpretation, React commit, and test
  // instrumentation to the motion itself even though none of that work can
  // interrupt an animation frame. Frame sampling likewise begins at the
  // first presented animation frame.
  if (!document.hidden) observerFrame = requestAnimationFrame(startLongTaskObserver);
  const visibility = () => {
    if (!document.hidden) return;
    stopFrameLoop();
    stopLongTaskObserver();
  };
  document.addEventListener("visibilitychange", visibility);
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    activeMeasurements.delete(finish);
    document.removeEventListener("visibilitychange", visibility);
    stopFrameLoop();
    stopLongTaskObserver();
    diagnostics.activeClones = Math.max(0, diagnostics.activeClones - 1);
    diagnostics.completedTransitions += 1;
    diagnostics.durationsMs.push(Math.round((performance.now() - started) * 10) / 10);
  };
  activeMeasurements.add(finish);
  return finish;
}

export function endMeasuredTransitions() {
  [...activeMeasurements].forEach((finish) => finish());
}
