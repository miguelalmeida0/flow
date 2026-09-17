import type { ChangeRecord, DayPlan, TransactionSource } from "../features/day-planner/model";
import type { StudioState } from "./studio-model";
import type { CalendarCreationContinuation } from "../shared/command/calendarCreationContext";
import type { FriendsState } from "./friends-model";

export type LifeEntityId = string;
export type WorldDestination = "home" | "today" | "focus" | "weather-outfit" | "people" | "good-to-know" | "capture" | "outcomes" | "journal" | "atmosphere" | "memories";
/** Legacy names remain accepted at API boundaries so old links and trusted UI
 * actions migrate without creating a second runtime world. Provider state is
 * always canonicalized to WorldDestination. */
export type LifeRoute = WorldDestination | "calendar" | "inbox" | "plans" | "now";
export type PeopleView = "default" | "commitments";
export type LifeEntityKind = "calendar-event" | "capture" | "plan" | "plan-step" | "person" | "commitment" | "journal-entry" | "atmosphere" | "memory" | "ritual";

export type TemporalScopeKind = "day" | "week";

export interface TemporalScope {
  kind: TemporalScopeKind;
  dateKey: string;
  endDateKey?: string;
}

export interface WeatherObservation {
  dateKey: string;
  observedAt: string;
  validUntil?: string;
  source: "fixture" | "open-meteo" | "cache";
  quality: "live" | "cached" | "partial" | "unavailable";
  confidence: "high" | "medium" | "low";
  temperatureC?: number;
  apparentTemperatureC?: number;
  minimumC?: number;
  maximumC?: number;
  precipitationProbability?: number;
  windKph?: number;
  uvIndex?: number;
  weatherCode?: number;
  sunrise?: string;
  sunset?: string;
}

export interface FocusSession {
  id: string;
  dateKey: string;
  startMinutes: number;
  durationMinutes: number;
  status: "active" | "completed";
  subjectId?: string;
  startedAt: string;
  completedAt?: string;
}

export interface FocusProposal {
  id: string;
  dateKey: string;
  requestedMinutes: number;
  availableMinutes: number;
  startMinutes: number;
  anchorTitle?: string;
  subjectId?: string;
  createdAt: string;
}

export interface ConversationEntityReference {
  id: LifeEntityId;
  kind: LifeEntityKind;
  at: number;
  transactionId?: string;
}

export interface Capture {
  id: LifeEntityId;
  kind: "capture";
  title: string;
  status: "unresolved" | "resolved" | "archived";
  source: "voice" | "typed";
  provenance?: { routerVersion: 2; transcript: string; commandId: string };
  createdAt: string;
  updatedAt: string;
}

export interface Plan {
  id: LifeEntityId;
  kind: "plan";
  title: string;
  outcome: string;
  status: "active" | "paused" | "completed";
  dueAt?: string;
  targetCondition?: string;
  nextStepId?: LifeEntityId;
  stepIds: LifeEntityId[];
  createdAt: string;
  updatedAt: string;
}

export interface PlanStep {
  id: LifeEntityId;
  kind: "plan-step";
  planId: LifeEntityId;
  title: string;
  status: "planned" | "scheduled" | "completed" | "deferred";
  estimatedMinutes?: number;
  deferredUntil?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Person {
  id: LifeEntityId;
  kind: "person";
  name: string;
  displayName?: string;
  aliases?: string[];
  avatar?: { initials: string; tone: "tide" | "clay" | "ochre" | "sage" };
  preferredChannel?: "flow-local";
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Commitment {
  id: LifeEntityId;
  kind: "commitment";
  personId: LifeEntityId;
  title: string;
  /** `mine`/`theirs` are accepted only while reading pre-v3 documents. */
  direction: "i-owe" | "waiting-on" | "next-conversation" | "mine" | "theirs";
  status: "open" | "completed" | "deferred" | "waiting";
  dueAt?: string;
  deferredUntil?: string;
  deferReason?: string;
  createdAt: string;
  updatedAt: string;
}

export type EntityLinkType =
  | "capture-origin-of-plan"
  | "capture-origin-of-event"
  | "capture-origin-of-commitment"
  | "step-scheduled-as-event"
  | "commitment-about-plan"
  | "commitment-reserved-by-event";

export interface EntityLink {
  id: LifeEntityId;
  type: EntityLinkType;
  fromId: LifeEntityId;
  toId: LifeEntityId;
  createdAt: string;
}

export interface LifeDocument {
  schemaVersion: 5 | 6;
  /** Active day projection consumed by the proven Calendar engine. */
  calendar: DayPlan;
  /** Canonical multi-day schedule. The active projection is mirrored here. */
  calendars: Record<string, DayPlan>;
  captures: Capture[];
  plans: Plan[];
  steps: PlanStep[];
  people: Person[];
  commitments: Commitment[];
  links: EntityLink[];
  focus: { active?: FocusSession; lastCompleted?: FocusSession };
  environment: {
    location: { label: string; latitude: number; longitude: number; timezone: string };
    weatherByDate: Record<string, WeatherObservation>;
  };
  instinctState: {
    dismissedUntil: Record<string, string>;
    lastShownAt: Record<string, string>;
    actedOnAt?: Record<string, string>;
  };
  studio: StudioState;
  /** Optional at the pre-v6 compatibility boundary; hydration always supplies it. */
  friends?: FriendsState;
  preferences: { workdayEndMinutes: number; firstName: string; weekStartsOn: 0 | 1 };
}

export interface LifeTransactionRecord {
  id: string;
  at: string;
  source: TransactionSource;
  transcript: string;
  summary: string;
  /** Present on the active record. Historical entries omit these duplicate
   * documents because their surrounding history entries already own the exact
   * before/after snapshots; they are rehydrated when restored. */
  before?: LifeDocument;
  after?: LifeDocument;
  actionTypes: string[];
  rewardFactType?: string;
  calendarChange?: ChangeRecord;
  primaryEntity?: ConversationEntityReference;
}

export interface LifeHistoryEntry {
  document: LifeDocument;
  lastTransaction?: LifeTransactionRecord;
}

export interface LifeSnapshot {
  revision: number;
  document: LifeDocument;
  temporal?: {
    todayDateKey: string;
    scope: TemporalScope;
    previousScope?: TemporalScope;
  };
  past: LifeHistoryEntry[];
  future: LifeHistoryEntry[];
  lastTransaction?: LifeTransactionRecord;
}

export interface LifeContext {
  route: LifeRoute;
  activeEditor?: { kind: "capture" | "step"; id: string };
  weekStartsOn?: 0 | 1;
  previousRoute?: LifeRoute;
  currentWorld?: WorldDestination;
  previousWorld?: WorldDestination;
  currentTimeScope?: TemporalScope;
  topic?: "calendar" | "focus" | "weather" | "person" | "capture" | "outcome" | "commitment" | "recommendation" | "journal" | "atmosphere" | "memory" | "workspace" | "ritual";
  peopleView?: PeopleView;
  focusedPersonId?: string;
  friendPending?: boolean;
  friendPendingKind?: string;
  friendsCollection?: "Recent" | "Plans" | "Voice notes" | "Groups";
  focusedGroupId?: string;
  activeGroupPlanId?: string;
  activeVoiceNoteId?: string;
  activeMessageId?: string;
  selectedVoiceMarkerId?: string;
  lastReferencedEntityId?: string;
  lastChangedEntityId?: string;
  pendingClarification?: { question: string; choices: Array<{ id: string; label: string }> };
  lastCommittedActionId?: string;
  turn?: number;
  focusedEntityId?: string;
  activePlanId?: string;
  lastCreatedEntityId?: string;
  selected?: ConversationEntityReference;
  lastReferenced?: ConversationEntityReference;
  lastChanged?: ConversationEntityReference;
  lastCreated?: ConversationEntityReference;
  pending?: "clarification" | "confirmation";
  pendingChoices?: Array<{ id: string; label: string }>;
  captureMode?: boolean;
  capturePrompt?: boolean;
  activePlayback?: { kind: "journal" | "voice-note" | "shared-message"; id: string; status: "playing" | "paused" | "stopped" };
  pendingMedia?: { entryId: string; mode: "pause" | "resume" | "stop"; expiresAt: number };
  voiceMode?: "command" | "dictation" | "journal-longform" | "voice-note-longform";
  friendPrompt?: "recipient" | "payload" | "time" | "direction" | "friend";
  activeJournalEntryId?: string;
  journalPositionMs?: number;
  activeMemoryId?: string;
  recentJournalSegment?: { entryId: string; segmentId: string; text: string; at: number };
  selectedJournalPassage?: string;
  selectedPhotoAssetId?: string;
  selectedBookmarkId?: string;
  /** Bounded, deterministic interaction state consumed by global ranking. */
  activeMode?: "command" | "journal-recording" | "journal-editing" | "memory-editing" | "atmosphere-editing";
  selectedInsightId?: string;
  lastIntent?: string;
  lastViewportAction?: { direction: "up" | "down"; fraction: number; route: LifeRoute; at: number };
  lastTargets?: ConversationEntityReference[];
  recentActionTypes?: string[];
  recentRoutes?: LifeRoute[];
  pendingIntent?: (CalendarCreationContinuation | { type: "commitment-create"; person: string } | { type: "commitment-recipient"; title: string; direction: "i-owe" | "waiting-on" | "next-conversation"; status: "open"; dueAt?: string } | { type: "instinct-act"; instinctId: string }) & { expiresAt: number };
  nowMs?: number;
  epoch?: number;
}
