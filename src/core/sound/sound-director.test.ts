import { beforeEach, describe, expect, it, vi } from "vitest";
import { RewardSoundDirector } from "./sound-director";

function audioHarness() {
  let state: AudioContextState = "suspended";
  const stopped: number[] = [];
  const context = {
    get state() { return state; },
    currentTime: 0,
    destination: {},
    resume: vi.fn(async () => { state = "running"; }),
    close: vi.fn(async () => { state = "closed"; }),
    createOscillator: () => ({
      type: "sine",
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(() => stopped.push(1)),
      onended: null,
    }),
    createGain: () => ({
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    }),
  } as unknown as AudioContext;
  return { context, stopped };
}

describe("RewardSoundDirector", () => {
  beforeEach(() => { delete window.__FLOW_SOUND__; });

  it("creates no context before an explicit enable gesture and reuses exactly one afterward", async () => {
    const { context } = audioHarness();
    const factory = vi.fn(() => context);
    const sound = new RewardSoundDirector(factory);
    expect(await sound.play("placed")).toBe(false);
    expect(factory).not.toHaveBeenCalled();
    expect(await sound.enableFromGesture()).toBe(true);
    expect(await sound.enableFromGesture()).toBe(true);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(await sound.play("placed")).toBe(true);
    expect(window.__FLOW_SOUND__).toMatchObject({ contextsCreated: 1, playCount: 1 });
  });

  it("cancels every active node and closes the context on disposal", async () => {
    const { context, stopped } = audioHarness();
    const sound = new RewardSoundDirector(() => context);
    await sound.enableFromGesture();
    await sound.play("completed");
    expect(window.__FLOW_SOUND__?.activeNodes).toBeGreaterThan(0);
    sound.cancel();
    expect(stopped.length).toBeGreaterThan(0);
    expect(window.__FLOW_SOUND__?.activeNodes).toBe(0);
    await sound.dispose();
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(sound.state).toBe("not-created");
  });
});
