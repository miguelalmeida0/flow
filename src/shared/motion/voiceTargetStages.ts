export const voiceTargetStageSeconds = {
  eyes: 0,
  body: 0.03,
  world: 0.075,
} as const;

export const voiceTargetStageMilliseconds = {
  eyes: voiceTargetStageSeconds.eyes * 1_000,
  body: voiceTargetStageSeconds.body * 1_000,
  world: voiceTargetStageSeconds.world * 1_000,
} as const;
