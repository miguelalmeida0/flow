import type { LifeAction } from "../domain/life-actions";
import type { CalendarRequest, ClarificationRequest, TransactionSource } from "../features/day-planner/model";
import type { StudioRuntimeCommand } from "../features/studio/studioCommandPlan";
import type { LifeContext, TemporalScope } from "../domain/life-model";
import type { NativeStudioContinuation } from "../features/studio/nativeStudioCapability";
import type { NowRecommendation } from "../domain/life-selectors";
import type { FriendPending } from "../features/friends/pending";

/** Acquisition context only. The document is always read at execution and
 * committed through the current CAS boundary, never copied from the utterance. */
export interface CapturedCommandContext {
  context: LifeContext;
  scope: TemporalScope;
  selectedCalendarEventId?: string;
  recommendations?: NowRecommendation[];
  boundaryClarification?: string;
  finalSegments?: string[];
  /** Opaque identity of the exact immutable pending/preview authority, or null
   * when none existed at acquisition. Never an alternative document source. */
  confirmationAuthority: object | null;
}

export type TransitionBeat = "focus-source" | "release-tide" | "transfer-path" | "destination-shell" | "resolve-content" | "settled";

export interface TransitionBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ActiveLifeTransition {
  kind: "capture-to-plan" | "step-to-calendar" | "promise-thread";
  sourceId: string;
  destinationId: string;
  beat: TransitionBeat;
  sourceBounds?: TransitionBounds;
  destinationBounds?: TransitionBounds;
  reducedMotion?: boolean;
}

export interface CommandFeedback {
  speechKey?: string;
  phase: "ready" | "listening" | "understanding" | "completed" | "clarification" | "confirmation" | "error";
  title: string;
  detail?: string;
  transcript?: string;
}

export interface PendingLifeChange {
  capture?: { expiresAt: number };
  media?: { entryId: string; mode: "pause" | "resume" | "stop"; expiresAt: number };
  promptId?: string;
  commandId?: string;
  friend?: FriendPending;
  actions: LifeAction[];
  baseRevision?: number;
  transcript: string;
  source: TransactionSource;
  summary: string;
  confirmLabel?: string;
  calendarRequest?: CalendarRequest;
  clarification?: ClarificationRequest;
  alternatives?: { request: CalendarRequest; clarification: ClarificationRequest };
  runtimeCommands?: StudioRuntimeCommand[];
  nativeContinuation?: NativeStudioContinuation;
}
