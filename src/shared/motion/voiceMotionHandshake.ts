export type VoiceTargetMotionStage = "eyes" | "body" | "world" | "pulse";

export const VOICE_TARGET_MOTION_EVENT = "flow:voice-target-motion";

export interface VoiceTargetMotionDetail {
  actionId: string;
  stage: VoiceTargetMotionStage;
  observedAt: number;
}

export const voiceTargetMotionOrder: readonly VoiceTargetMotionStage[] = ["eyes", "body", "world", "pulse"];

export function advanceVoiceTargetMotion(expected: VoiceTargetMotionStage, observed: VoiceTargetMotionStage) {
  if (observed !== expected) return { accepted: false, next: expected, complete: false } as const;
  const next = voiceTargetMotionOrder[voiceTargetMotionOrder.indexOf(expected) + 1];
  return next
    ? { accepted: true, next, complete: false } as const
    : { accepted: true, next: undefined, complete: true } as const;
}

export function motionStageReached(current: VoiceTargetMotionStage | undefined, required: VoiceTargetMotionStage) {
  if (!current) return false;
  return voiceTargetMotionOrder.indexOf(current) >= voiceTargetMotionOrder.indexOf(required);
}

export function isVisibleVoicePulseStart(progress: number, opacity: number) {
  return progress > 0.01 && opacity > 0.05;
}

/** Components report the first real, non-zero presentation update. The
 * command controller owns sequencing and execution; renderers cannot advance
 * application state directly. */
export function reportVoiceTargetMotion(actionId: string | undefined, stage: VoiceTargetMotionStage) {
  if (!actionId) return;
  window.dispatchEvent(new CustomEvent<VoiceTargetMotionDetail>(VOICE_TARGET_MOTION_EVENT, {
    detail: { actionId, stage, observedAt: performance.now() },
  }));
}
