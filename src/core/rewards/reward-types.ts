import type { TransactionSource } from "../../features/day-planner/model";
import type { TemporalScope, WorldDestination } from "../../domain/life-model";

export type RewardLevel = 0 | 1 | 2 | 3;
export type RewardFamily = "none" | "tide" | "anchor" | "bloom" | "neutral";
export type MascotState = "resting" | "attentive" | "listening" | "understood" | "thinking" | "resolved" | "focused" | "small-win" | "big-win" | "uncertain";
export type SoundCue = "listening" | "understood" | "placed" | "protected" | "resolved" | "completed" | "undo" | "uncertain";
export type MotionPreference = "system" | "full" | "reduced";
export type MascotPreference = "helpful" | "minimal";

export interface RewardPreferences {
  motion: MotionPreference;
  sound: boolean;
  mascot: MascotPreference;
}

export type RewardFact =
  | { type: "event-created"; eventId: string }
  | { type: "event-moved"; eventId: string; from: { dateKey: string; start: number; end: number }; to: { dateKey: string; start: number; end: number } }
  | { type: "event-resized"; eventId: string; previousMinutes: number; nextMinutes: number }
  | { type: "event-styled"; eventId: string; changed: Array<"color" | "label" | "importance" | "mobility"> }
  | { type: "event-deferred"; eventId: string; destinationDateKey: string }
  | { type: "event-removed"; eventId: string }
  | { type: "time-protected"; entityId: string; minutes: number }
  | { type: "time-released"; entityId: string; minutes: number }
  | { type: "time-reclaimed"; minutes: number; sourceId?: string }
  | { type: "day-recovered"; movedCount: number; deferredCount: number; reclaimedMinutes: number }
  | { type: "breathing-room-created"; roomId: string; minutes: number }
  | { type: "focus-started"; focusId: string; minutes: number }
  | { type: "focus-completed"; focusId: string; minutes: number; elapsedMinutes: number; meaningful: boolean }
  | { type: "capture-created"; captureId: string }
  | { type: "capture-routed"; captureId: string; destination: "today" | "outcome" | "commitment"; destinationId: string }
  | { type: "outcome-created"; outcomeId: string }
  | { type: "outcome-step-scheduled"; outcomeId: string; stepId: string; eventId: string }
  | { type: "outcome-advanced"; outcomeId: string; completedStepId: string; nextStepId?: string }
  | { type: "outcome-completed"; outcomeId: string }
  | { type: "commitment-created"; commitmentId: string; personId: string }
  | { type: "commitment-protected"; commitmentId: string; eventId: string }
  | { type: "commitment-kept"; commitmentId: string; personId?: string }
  | { type: "instinct-acted-on"; instinctId: string };

export type RewardEvent =
  | { type: "transaction-committed"; id: string; at: number; source: TransactionSource; facts: RewardFact[] }
  | { type: "world-opened"; id: string; at: number; from: WorldDestination; to: WorldDestination; source: "pointer" | "voice" | "typed" | "browser-back" }
  | { type: "time-scope-changed"; id: string; at: number; from: TemporalScope; to: TemporalScope; source: "pointer" | "voice" | "typed" }
  | { type: "voice-understood"; id: string; at: number; intent: string }
  | { type: "history-restored"; id: string; at: number; direction: "undo" | "redo"; originalRewardType?: RewardFact["type"] }
  | { type: "uncertain"; id: string; at: number; reason: "clarification" | "unsupported" | "conflict" };

export interface RewardRecipe {
  id: string;
  family: RewardFamily;
  durationMs: number;
  sound?: SoundCue;
  mascot: MascotState;
  label: string;
}

export interface RewardPlan {
  event: RewardEvent;
  level: RewardLevel;
  recipe: RewardRecipe;
  facts: RewardFact[];
  entityIds: string[];
  reducedMotion: boolean;
}

export type RewardSuppressionReason =
  | "none"
  | "level-zero"
  | "hidden-tab"
  | "duplicate-transaction"
  | "coalesced"
  | "ceremony-busy"
  | "ceremony-cooldown"
  | "interrupted"
  | "cancelled"
  | "hydration";

export interface RewardRuntimeSnapshot {
  sequence: number;
  active: boolean;
  event?: RewardEvent;
  plan?: RewardPlan;
  suppressionReason: RewardSuppressionReason;
  activeMotionOwner: "none" | "motion" | "measured-transform";
  animationCount: number;
  transitionClones: number;
  audioContextState: string;
  soundCue?: SoundCue;
  mascotState: MascotState;
  completedCount: number;
  cancelledCount: number;
}

export interface RewardRuntimeEventLogEntry {
  id: string;
  type: RewardEvent["type"];
  level: RewardLevel;
  suppressionReason: RewardSuppressionReason;
}

export const DEFAULT_REWARD_PREFERENCES: RewardPreferences = { motion: "system", sound: false, mascot: "helpful" };
