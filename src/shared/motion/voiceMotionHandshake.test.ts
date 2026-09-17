import { describe, expect, it, vi } from "vitest";
import {
  advanceVoiceTargetMotion,
  isVisibleVoicePulseStart,
  motionStageReached,
  reportVoiceTargetMotion,
  VOICE_TARGET_MOTION_EVENT,
  type VoiceTargetMotionDetail,
} from "./voiceMotionHandshake";

describe("voice target motion handshake", () => {
  it("accepts only the authored eye, body, world, pulse order", () => {
    expect(advanceVoiceTargetMotion("eyes", "world")).toEqual({ accepted: false, next: "eyes", complete: false });
    expect(advanceVoiceTargetMotion("eyes", "eyes")).toEqual({ accepted: true, next: "body", complete: false });
    expect(advanceVoiceTargetMotion("body", "body")).toEqual({ accepted: true, next: "world", complete: false });
    expect(advanceVoiceTargetMotion("world", "world")).toEqual({ accepted: true, next: "pulse", complete: false });
    expect(advanceVoiceTargetMotion("pulse", "pulse")).toEqual({ accepted: true, next: undefined, complete: true });
  });

  it("compares reached stages without treating a missing stage as progress", () => {
    expect(motionStageReached(undefined, "eyes")).toBe(false);
    expect(motionStageReached("body", "eyes")).toBe(true);
    expect(motionStageReached("body", "world")).toBe(false);
    expect(motionStageReached("pulse", "world")).toBe(true);
  });

  it("accepts the first genuinely visible nonzero pulse instead of waiting for completion", () => {
    expect(isVisibleVoicePulseStart(0, 0.9)).toBe(false);
    expect(isVisibleVoicePulseStart(0.1, 0)).toBe(false);
    expect(isVisibleVoicePulseStart(0.011, 0.06)).toBe(true);
    expect(isVisibleVoicePulseStart(0.8, 0.9)).toBe(true);
  });

  it("reports the actual observation time with the owning action id", () => {
    const listener = vi.fn<(event: Event) => void>();
    window.addEventListener(VOICE_TARGET_MOTION_EVENT, listener);
    reportVoiceTargetMotion("voice-42", "world");
    window.removeEventListener(VOICE_TARGET_MOTION_EVENT, listener);
    const detail = (listener.mock.calls[0]![0] as CustomEvent<VoiceTargetMotionDetail>).detail;
    expect(detail).toMatchObject({ actionId: "voice-42", stage: "world" });
    expect(detail.observedAt).toBeGreaterThan(0);
  });
});
