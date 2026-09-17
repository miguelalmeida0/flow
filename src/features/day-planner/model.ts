export type EventKind = "fixed" | "protected" | "flexible" | "buffer";
export type EventPriority = "high" | "medium" | "low";
export type EventColor = "neutral" | "red" | "orange" | "yellow" | "green" | "cyan" | "blue" | "indigo";
export type EventImportance = "normal" | "important" | "critical";
export type EventMobility = "anchored" | "heavy" | "light" | "fluid";
export type EventStatus = "planned" | "confirmed" | "active" | "done" | "cancelled";
export type TransactionSource = "type" | "voice" | "drag" | "resize" | "quick" | "keyboard" | "tide";
export type PlannerPhase =
  | "ready"
  | "listening"
  | "understanding"
  | "applying"
  | "completed"
  | "clarification"
  | "confirmation"
  | "conflict"
  | "error";

export interface CalendarEvent {
  participantIds?: string[];
  id: string;
  title: string;
  dateKey: string;
  start: number;
  end: number;
  kind: EventKind;
  priority: EventPriority;
  color?: EventColor;
  labels?: string[];
  importance?: EventImportance;
  mobility?: EventMobility;
  protected?: boolean;
  status?: EventStatus;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  linkedGroupId?: string;
  completedAtMinutes?: number;
  mergedFromIds?: string[];
}

export interface BreathingRoom {
  id: string;
  dateKey: string;
  start: number;
  end: number;
  protected: boolean;
  label?: string;
  source: "user" | "tide";
  linkedEventId?: string;
  relation?: "before" | "after";
}

export interface DayPlan {
  dateKey: string;
  events: CalendarEvent[];
  deferred: CalendarEvent[];
  breathingRooms?: BreathingRoom[];
  endBoundaryMinutes?: number;
  /** Reference-only projection; never passed to a schedule transformation. */
  referenceEvents?: CalendarEvent[];
}

export type SourceDate = DateTarget | "yesterday" | { weekday: number; relation: "named" | "this" | "next" | "last" };
export type EventSelector = (
  | { type: "id"; id: string }
  | { type: "selected" }
  | { type: "title"; query: string; fallbackQuery?: string }
  | {
      type: "source";
      at?: number;
      period?: "morning" | "afternoon" | "evening";
      query?: string;
      literalQuery?: string;
      allowOverlap?: boolean;
    }
  | { type: "position"; position: "current" | "next" | "previous" | "last"; query?: string }
  | {
      type: "filter";
      cardinality: "one" | "many";
      query?: string;
      color?: EventColor;
      label?: string;
      status?: EventStatus;
      importance?: EventImportance;
      mobility?: EventMobility;
      protected?: boolean;
    }
  | { type: "relativeEvent"; relation: "before" | "after"; anchor: EventSelector }
  | { type: "anaphor"; ordinal?: number }
  | { type: "multi"; selectors: EventSelector[] }
  | {
      type: "all";
      kind?: "flexible" | "fixed";
      priority?: EventPriority;
      color?: EventColor;
      label?: string;
      status?: EventStatus;
      importance?: EventImportance;
      mobility?: EventMobility;
      protected?: boolean;
      period?: "morning" | "afternoon";
      after?: EventSelector;
    }) & { date?: SourceDate; participantIds?: string[]; literalDateQuery?: string };

export type DateTarget = "today" | "tomorrow" | { dateKey: string };
export type Destination =
  | { type: "absolute"; minutes: number; date?: DateTarget }
  | { type: "relative"; relation: "before" | "after"; anchor: EventSelector; preserveIfSatisfied?: boolean }
  | { type: "dayPart"; date: DateTarget; part: "morning" | "afternoon" }
  | { type: "window"; start: number; end: number; date?: DateTarget }
  | { type: "nextFree"; date?: DateTarget }
  | { type: "unresolved"; kind: "time" };

export type CalendarAction =
  | { type: "create"; title: string; literalTitle?: boolean; durationMinutes: number; destination: Destination; participantIds?: string[] }
  | { type: "move"; selector: EventSelector; destination: Destination; origin?: "tide" }
  | { type: "shift"; selector: EventSelector; deltaMinutes: number }
  | { type: "resize"; selector: EventSelector; mode: "set" | "add" | "end"; minutes: number }
  | { type: "protect"; selector: EventSelector }
  | { type: "unprotect"; selector: EventSelector }
  | { type: "fit"; title: string; literalTitle?: boolean; durationMinutes: number; destination: Destination; participantIds?: string[] }
  | { type: "recover"; delayMinutes: number; assumedDelay?: boolean }
  | { type: "defer"; selector: EventSelector; date: DateTarget; part?: "morning" | "afternoon"; atMinutes?: number; origin?: "tide" }
  | { type: "delete"; selector: EventSelector }
  | {
      type: "update";
      selector: EventSelector;
      patch: {
        title?: string;
        color?: EventColor;
        addLabels?: string[];
        removeLabels?: string[];
        importance?: EventImportance;
        mobility?: EventMobility;
        status?: EventStatus;
      };
    }
  | {
      type: "createBreathingRoom";
      durationMinutes: number;
      destination: Destination;
      label?: string;
      protected?: boolean;
    }
  | { type: "split"; selector: EventSelector; durations: number[] }
  | { type: "merge"; selector: EventSelector; title?: string; expectedCount?: number }
  | { type: "complete"; selector: EventSelector; atMinutes?: number; earlyByMinutes?: number }
  | { type: "reopen"; selector: EventSelector }
  | { type: "setDayBoundary"; endMinutes: number }
  | { type: "reflow"; reason: "make-room" | "delay" | "boundary" | "early-completion" | "user" }
  | { type: "commitPreview" }
  | { type: "cancelPreview" }
  | { type: "adjustPreview"; destination?: Destination; durationMinutes?: number }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset" }
  | { type: "whatChanged" }
  | { type: "confirm" }
  | { type: "cancel" };

export type CalendarPreservedField = "title" | "start" | "end" | "dateKey" | "duration";
export type CalendarConstraint = {
  type: "keep";
  selector: EventSelector;
  at?: number;
} | { type: "preserve"; selector: EventSelector; fields: CalendarPreservedField[]; expectedDurationMinutes?: number }
  | { type: "avoidTime"; selector: EventSelector; minutes: number };

export interface CalendarRequest {
  transcript: string;
  normalized: string;
  actions: CalendarAction[];
  constraints: CalendarConstraint[];
  mode?: "commit" | "preview";
  nowMinutes?: number;
}

export type InterpretationResult =
  | { status: "ready"; request: CalendarRequest }
  | { status: "unsupported"; title: string; detail: string };

export interface EventClarificationChoice {
  id: string;
  label: string;
}

export interface EventClarificationRequest {
  type: "event";
  question: string;
  selector: EventSelector;
  choices: EventClarificationChoice[];
}

export interface DestinationClarificationChoice {
  id: string;
  label: string;
  destination: Exclude<Destination, { type: "unresolved" }>;
}

export interface DestinationClarificationRequest {
  type: "destination";
  question: string;
  actionIndex: number;
  choices: DestinationClarificationChoice[];
}

export interface BoundaryClarificationRequest {
  type: "boundary";
  question: string;
  actionIndex: number;
  choices: { id: string; label: string; endMinutes: number }[];
}

export type ClarificationRequest = EventClarificationRequest | DestinationClarificationRequest | BoundaryClarificationRequest;

export interface ConfirmationRequest {
  title: string;
  detail: string;
  request: CalendarRequest;
  confirmLabel?: string;
  authorizationKey?: string;
}

export interface PlannerFeedback {
  phase: PlannerPhase;
  title: string;
  summary: string;
  detail: string;
  transcript?: string;
  changedIds: string[];
  anchoredIds?: string[];
  deferredIds?: string[];
  markerMinutes?: number;
  markerLabel?: string;
  originById?: Record<string, { start: number; end: number }>;
  transactionKind?: "move" | "paint" | "resize" | "protect" | "split" | "merge" | "complete" | "tide";
  targetEventId?: string;
  /** Present only for feedback produced by a committed calendar transaction. */
  transactionId?: string;
}

export type PendingInteraction =
  | { type: "clarification"; request: CalendarRequest; clarification: ClarificationRequest; source?: TransactionSource }
  | { type: "confirmation"; confirmation: ConfirmationRequest; source?: TransactionSource };

export interface ChangeRecord {
  transactionId?: string;
  timestamp?: string;
  summary: string;
  detail: string;
  transcript: string;
  source?: TransactionSource;
  actions?: CalendarAction[];
  before?: DayPlan;
  after?: DayPlan;
}

export interface HistoryEntry {
  plan: DayPlan;
  lastChange?: ChangeRecord;
}

export interface PlannerSnapshot {
  plan: DayPlan;
  past: HistoryEntry[];
  future: HistoryEntry[];
  lastChange?: ChangeRecord;
}

export interface PlannerPreview {
  basePlan: DayPlan;
  proposedPlan: DayPlan;
  request: CalendarRequest;
  summary: string;
  detail: string;
  source: TransactionSource;
}
