import { afterEach, describe, expect, it, vi } from "vitest";
import { beginMeasuredTransition, endMeasuredTransitions, motionDiagnostics } from "./transitionDiagnostics";

afterEach(() => {
  delete window.__FLOW_MOTION__;
  vi.restoreAllMocks();
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
});

describe("transition diagnostics lifecycle", () => {
  it("never starts a frame loop for reduced motion", () => {
    const finish = beginMeasuredTransition({ trackFrames: false });
    expect(motionDiagnostics()).toMatchObject({ activeClones: 1, activeFrameLoops: 0 });
    finish();
    expect(motionDiagnostics()).toMatchObject({ activeClones: 0, activeFrameLoops: 0, completedTransitions: 1 });
  });

  it("stops the active frame loop as soon as the tab becomes hidden", () => {
    const cancelFrame = vi.spyOn(window, "cancelAnimationFrame");
    const finish = beginMeasuredTransition();
    expect(motionDiagnostics().activeFrameLoops).toBe(1);
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(motionDiagnostics().activeFrameLoops).toBe(0);
    expect(cancelFrame).toHaveBeenCalled();
    finish();
    expect(motionDiagnostics().activeClones).toBe(0);
  });

  it("starts long-task observation on the first animation frame, then disconnects it", () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextFrame = 0;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      nextFrame += 1;
      callbacks.set(nextFrame, callback);
      return nextFrame;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((frame) => { callbacks.delete(frame); });
    const observe = vi.fn();
    const disconnect = vi.fn();
    class Observer {
      observe = observe;
      disconnect = disconnect;
    }
    vi.stubGlobal("PerformanceObserver", Observer);

    const finish = beginMeasuredTransition({ trackFrames: false });
    expect(observe).not.toHaveBeenCalled();
    callbacks.get(1)?.(performance.now());
    expect(observe).toHaveBeenCalledWith({ entryTypes: ["longtask"] });
    finish();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("does not attribute the task that installed the observer to the flight", () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextFrame = 0;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      nextFrame += 1;
      callbacks.set(nextFrame, callback);
      return nextFrame;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((frame) => { callbacks.delete(frame); });
    let now = 100;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    let deliver: PerformanceObserverCallback | undefined;
    class Observer {
      constructor(callback: PerformanceObserverCallback) { deliver = callback; }
      observe() { /* test seam */ }
      disconnect() { /* test seam */ }
    }
    vi.stubGlobal("PerformanceObserver", Observer);

    const finish = beginMeasuredTransition({ trackFrames: false });
    now = 200;
    callbacks.get(1)?.(now);
    deliver?.({ getEntries: () => [
      { startTime: 190, duration: 80 },
      { startTime: 205, duration: 40 },
    ] } as PerformanceObserverEntryList, {} as PerformanceObserver);
    expect(motionDiagnostics().longestMainThreadTaskMs).toBe(40);
    finish();
  });

  it("counts gaps only between presented animation frames", () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextFrame = 0;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      nextFrame += 1;
      callbacks.set(nextFrame, callback);
      return nextFrame;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((frame) => { callbacks.delete(frame); });

    const finish = beginMeasuredTransition();
    callbacks.get(1)?.(1_000);
    expect(motionDiagnostics().droppedFrameEstimate).toBe(0);
    callbacks.get(3)?.(1_040);
    expect(motionDiagnostics().droppedFrameEstimate).toBe(1);
    finish();
  });

  it("ends active measurement synchronously when presentation is interrupted", () => {
    const first = beginMeasuredTransition({ trackFrames: false });
    const second = beginMeasuredTransition({ trackFrames: false });
    endMeasuredTransitions();
    expect(motionDiagnostics()).toMatchObject({ activeClones: 0, activeFrameLoops: 0, completedTransitions: 2 });
    first(); second();
    expect(motionDiagnostics().completedTransitions).toBe(2);
  });
});
