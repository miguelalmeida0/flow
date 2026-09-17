import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVoiceWorld } from "./useVoiceWorld";
import { reportVoiceTargetMotion } from "../../shared/motion/voiceMotionHandshake";

describe("wake lifecycle ownership", () => {
  beforeEach(() => { vi.useFakeTimers(); delete window.__FLOW_LOCKED_HOME__; });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren(); });

  it("cancels reward frames and preparation when a following command takes ownership", () => {
    const { result, unmount } = renderHook(() => useVoiceWorld(false, false));
    act(() => result.current.wake("Flow"));
    expect(result.current.snapshot.entrance).toBe("wake-reward");
    act(() => result.current.activate("listening", "Open my journal"));
    act(() => vi.advanceTimersByTime(3_000));
    expect(result.current.snapshot).toMatchObject({ entrance: "active", transcript: "Open my journal" });
    expect(window.__FLOW_LOCKED_HOME__?.preparingStartedAt).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
    unmount();
  });

  it("disposes all pending wake callbacks on unmount", () => {
    const { result, unmount } = renderHook(() => useVoiceWorld(false, false));
    act(() => result.current.wake("Flow"));
    unmount();
    const diagnostics = structuredClone(window.__FLOW_LOCKED_HOME__);
    act(() => vi.advanceTimersByTime(4_000));
    expect(window.__FLOW_LOCKED_HOME__).toEqual(diagnostics);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a replacement wake owns the single remaining ceremony", () => {
    const { result, unmount } = renderHook(() => useVoiceWorld(false, true));
    act(() => result.current.wake("Flow"));
    act(() => vi.advanceTimersByTime(100));
    act(() => result.current.wake("Hey Flow"));
    act(() => vi.advanceTimersByTime(100));
    expect(result.current.snapshot).toMatchObject({ entrance: "wake-reward", transcript: "Hey Flow" });
    act(() => vi.advanceTimersByTime(210));
    expect(result.current.snapshot).toMatchObject({ entrance: "active", transcript: "Hey Flow" });
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses an observed frame when advertised Element Timing emits no entry", async () => {
    vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(1_440);
    vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(1_000);
    vi.stubGlobal("PerformanceObserver", class {
      static supportedEntryTypes = ["element"];
      observe() {}
      disconnect() {}
    });
    const heading = document.createElement("output");
    heading.dataset.voiceTargetAcknowledgement = "";
    heading.dataset.voiceActionId = "fallback-action";
    heading.textContent = "Calendar found";
    const pulse = document.createElement("div");
    pulse.dataset.voiceTargetPulse = "";
    document.body.append(heading, pulse);
    for (const element of [heading, pulse]) vi.spyOn(element, "getBoundingClientRect").mockReturnValue({ width: 100, height: 30 } as DOMRect);
    const { result, unmount } = renderHook(() => useVoiceWorld(true, true));
    act(() => result.current.target({ actionId: "fallback-action", transcript: "Open calendar", source: "voice", domain: "today", confidenceTier: "high" }));
    let completed = false;
    act(() => { void result.current.waitForTargetPaint("fallback-action")?.then(() => { completed = true; }); });
    await act(async () => vi.advanceTimersByTimeAsync(400));
    expect(completed).toBe(true);
    expect(window.__FLOW_LOCKED_HOME__?.targetPaintSource).toBe("frame-fence");
    expect(window.__FLOW_LOCKED_HOME__?.targetElementPainted).toBe(true);
    expect(result.current.snapshot.phase).toBe("executing");
    unmount();
  });

  it("observes the painted pulse when its last Motion callback preceded the DOM update", async () => {
    vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(1_440);
    vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(1_000);
    const heading = document.createElement("output");
    heading.dataset.voiceTargetAcknowledgement = "";
    heading.dataset.voiceActionId = "late-pulse";
    const pulse = document.createElement("div");
    Object.assign(pulse.dataset, { voiceTargetPulse: "", voiceActionId: "late-pulse", voiceOriginX: "0", voiceOriginY: "0", voiceTargetX: "100", voiceTargetY: "0" });
    const traveler = document.createElement("span");
    traveler.dataset.voicePulseTraveler = "";
    traveler.style.opacity = "0.9";
    pulse.append(traveler);
    document.body.append(heading, pulse);
    for (const element of [heading, pulse]) vi.spyOn(element, "getBoundingClientRect").mockReturnValue({ width: 100, height: 30 } as DOMRect);
    let paintedX = 0;
    vi.spyOn(traveler, "getBoundingClientRect").mockImplementation(() => ({ left: paintedX, top: 0, width: 0, height: 0 } as DOMRect));
    const { result, unmount } = renderHook(() => useVoiceWorld(true, false));
    act(() => result.current.target({ actionId: "late-pulse", transcript: "Undo", source: "voice", domain: "today", confidenceTier: "high" }));
    let completed = false;
    act(() => { void result.current.waitForTargetPaint("late-pulse")?.then(() => { completed = true; }); });
    act(() => reportVoiceTargetMotion("late-pulse", "world"));
    expect(completed).toBe(false);
    paintedX = 100; // Browser paints after Motion's final update; no second callback.
    await act(async () => vi.advanceTimersByTimeAsync(400));
    expect(completed).toBe(true);
    expect(window.__FLOW_LOCKED_HOME__?.targetPulseMotionAt).toBeGreaterThanOrEqual(window.__FLOW_LOCKED_HOME__!.targetWorldMotionAt!);
    expect(result.current.snapshot.phase).toBe("executing");
    // A pending observation cannot acknowledge the next command or survive
    // interruption, even if its old traveler becomes visible afterwards.
    paintedX = 0;
    pulse.dataset.voiceActionId = "interrupted-pulse";
    act(() => result.current.target({ actionId: "interrupted-pulse", transcript: "Redo", source: "voice", domain: "today", confidenceTier: "high" }));
    act(() => { void result.current.waitForTargetPaint("interrupted-pulse"); });
    act(() => reportVoiceTargetMotion("interrupted-pulse", "world"));
    act(() => result.current.interruptTargetPresentation());
    act(() => result.current.target({ actionId: "replacement", transcript: "Home", source: "voice", domain: "home", confidenceTier: "high" }));
    paintedX = 100;
    await act(async () => vi.advanceTimersByTimeAsync(400));
    expect(result.current.snapshot.actionId).toBe("replacement");
    expect(result.current.snapshot.phase).toBe("targeting");
    expect(window.__FLOW_LOCKED_HOME__?.targetPulseMotionAt).toBeUndefined();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not let a new interim or listening reset steal a pending final command", async () => {
    vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(1_440);
    vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(900);
    const heading = document.createElement("output");
    heading.dataset.voiceTargetAcknowledgement = ""; heading.dataset.voiceActionId = "final-navigation";
    document.body.append(heading);
    vi.spyOn(heading, "getBoundingClientRect").mockReturnValue({ width: 180, height: 30 } as DOMRect);
    const { result, unmount } = renderHook(() => useVoiceWorld(true, false));
    act(() => result.current.target({ actionId: "final-navigation", transcript: "Open calendar", source: "voice", domain: "today", confidenceTier: "high" }));
    let completed = false;
    act(() => { void result.current.waitForTargetPaint("final-navigation")?.then(() => { completed = true; }); });
    act(() => result.current.preview({ actionId: "interim", transcript: "open", source: "voice", domain: "home", confidenceTier: "contextual" }));
    act(() => result.current.activate("listening"));
    expect(result.current.snapshot.actionId).toBe("final-navigation");
    expect(result.current.snapshot.domain).toBe("today");
    await act(async () => vi.advanceTimersByTimeAsync(2_100));
    expect(completed).toBe(true);
    expect(result.current.snapshot.phase).toBe("executing");
    expect(window.__FLOW_LOCKED_HOME__?.targetMotionDegraded).toBe(true);
    expect(window.__FLOW_LOCKED_HOME__?.targetEyeMotionAt).toBeUndefined();
    expect(window.__FLOW_LOCKED_HOME__?.targetPaintSource).toBe("frame-fence");
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["removed", "hidden"])("releases semantic work when target acknowledgement is %s without fabricating paint", async (visibility) => {
    vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(1_440);
    vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(900);
    if (visibility === "hidden") vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    vi.stubGlobal("PerformanceObserver", class {
      static supportedEntryTypes = ["element"];
      observe() {}
      disconnect() {}
    });
    const { result, unmount } = renderHook(() => useVoiceWorld(true, false));
    act(() => result.current.target({ actionId: "missing-heading", transcript: "Move email to three", source: "voice", domain: "today", confidenceTier: "high" }));
    let completed = false;
    act(() => { void result.current.waitForTargetPaint("missing-heading")?.then(() => { completed = true; }); });
    await act(async () => vi.advanceTimersByTimeAsync(2_100));
    expect(completed).toBe(true);
    expect(window.__FLOW_LOCKED_HOME__?.targetMotionDegraded).toBe(true);
    expect(window.__FLOW_LOCKED_HOME__?.targetPaintedAt).toBeUndefined();
    expect(window.__FLOW_LOCKED_HOME__?.targetElementPainted).not.toBe(true);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
