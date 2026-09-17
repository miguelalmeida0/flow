import type { LifeAction } from "../domain/life-actions";
import type { LifeContext } from "../domain/life-model";
import { normalizeTranscript } from "../features/day-planner/interpretation/normalize";
import type { GlobalIntentCandidate } from "../shared/command/globalInterpreter";
import type { JournalSegmentEvidence } from "../shared/command/journalSegmentDecision";

export interface FlowCommandTrace {
  commandId: string;
  parentCommandId?: string;
  transcript: string;
  normalizedInput: string;
  domain: string;
  intent: unknown;
  entities: string[];
  contextUsed: Pick<LifeContext, "route" | "topic" | "peopleView" | "focusedEntityId" | "currentTimeScope" | "selected" | "voiceMode" | "activeMode" | "activeJournalEntryId" | "activeMemoryId" | "selectedPhotoAssetId" | "selectedBookmarkId" | "selectedInsightId" | "lastIntent" | "lastTargets" | "pendingIntent" | "recentRoutes" | "recentActionTypes">;
  confidenceTier: "high" | "needs-clarification" | "unsupported";
  actions: LifeAction[];
  actualActions: LifeAction[];
  transactionId?: string;
  socialContext?: Pick<LifeContext, "focusedPersonId" | "focusedGroupId" | "activeMessageId" | "activeVoiceNoteId" | "selectedVoiceMarkerId">;
  pendingAuthority?: { id: string; revision?: number; messageRevision?: number; kind?: string };
  delivery?: { status: "sending" | "delivered" | "failed"; messageId: string; messageRevision: number; receiptId?: string; transport?: string; scope?: string; error?: string };
  recording?: { targetId: string; kind?: string; state: string; elapsedMs?: number; error?: string };
  queryResult?: object;
  queryWindow?: object;
  selectedCandidate?: Pick<GlobalIntentCandidate, "definitionId" | "domain" | "score" | "positiveEvidence" | "negativeEvidence" | "confidence"> & { intentType: string };
  candidates: Array<Pick<GlobalIntentCandidate, "definitionId" | "domain" | "score" | "positiveEvidence" | "negativeEvidence" | "confidence"> & { intentType: string }>;
  unresolvedReason?: string;
  segmentClassification?: JournalSegmentEvidence["classification"];
  segmentReason?: string;
  contentDestination?: JournalSegmentEvidence["destination"];
  interpretedAt?: number;
  committedAt?: number;
  navigationAppliedAt?: number;
  destinationRoute?: string;
}

declare global {
  interface Window {
    __FLOW_COMMAND_TRACE__?: FlowCommandTrace;
    __FLOW_COMMAND_TRACES__?: FlowCommandTrace[];
  }
}

function domainFor(intentType: string) {
  if (intentType.startsWith("journal")) return "journal";
  if (intentType.startsWith("atmosphere")) return "atmosphere";
  if (intentType.startsWith("memory")) return "memory";
  if (intentType.startsWith("workspace")) return "workspace";
  if (intentType.startsWith("ritual")) return "ritual";
  if (intentType.startsWith("calendar")) return "calendar";
  return intentType.split("-")[0] ?? "global";
}

function publishTrace() {
  const current = window.__FLOW_COMMAND_TRACE__;
  if (current) {
    const traces = window.__FLOW_COMMAND_TRACES__ ?? [];
    window.__FLOW_COMMAND_TRACES__ = [...traces.filter(({ commandId }) => commandId !== current.commandId), structuredClone(current)].slice(-100);
  }
  window.dispatchEvent(new Event("flow-command-trace"));
}

/** Late native outcomes amend their own trace without becoming the current command. */
export function patchCommandTrace(commandId: string | undefined, patch: Partial<FlowCommandTrace>) {
  if (!import.meta.env.DEV || typeof window === "undefined" || !commandId) return;
  window.__FLOW_COMMAND_TRACES__ = (window.__FLOW_COMMAND_TRACES__ ?? []).map((trace) => trace.commandId === commandId ? { ...trace, ...structuredClone(patch) } : trace);
  if (window.__FLOW_COMMAND_TRACE__?.commandId === commandId) window.__FLOW_COMMAND_TRACE__ = { ...window.__FLOW_COMMAND_TRACE__, ...structuredClone(patch) };
  window.dispatchEvent(new Event("flow-command-trace"));
}

export function recordCommandOutcome(outcome: Pick<FlowCommandTrace, "committedAt" | "navigationAppliedAt" | "destinationRoute">) {
  if (!import.meta.env.DEV || typeof window === "undefined" || !window.__FLOW_COMMAND_TRACE__) return;
  window.__FLOW_COMMAND_TRACE__ = { ...window.__FLOW_COMMAND_TRACE__, ...outcome };
  publishTrace();
}

export function recordCommandQuery(queryResult: object, queryWindow?: object) {
  if (!import.meta.env.DEV || typeof window === "undefined" || !window.__FLOW_COMMAND_TRACE__) return;
  window.__FLOW_COMMAND_TRACE__ = { ...window.__FLOW_COMMAND_TRACE__, queryResult: structuredClone(queryResult), ...(queryWindow ? { queryWindow: structuredClone(queryWindow) } : {}) };
  publishTrace();
}

export function beginCommandTrace(transcript: string, intent: { type: string }, context: LifeContext, candidates: readonly GlobalIntentCandidate[] = [], segment?: JournalSegmentEvidence, commandId: string = crypto.randomUUID(), parentCommandId?: string) {
  if (!import.meta.env.DEV || typeof window === "undefined") return;
  const selectedCandidate = candidates.find(({ intent: candidateIntent }) => JSON.stringify(candidateIntent) === JSON.stringify(intent));
  const selected = selectedCandidate ? {
    definitionId: selectedCandidate.definitionId,
    domain: selectedCandidate.domain,
    score: selectedCandidate.score,
    positiveEvidence: [...selectedCandidate.positiveEvidence],
    negativeEvidence: [...selectedCandidate.negativeEvidence],
    confidence: selectedCandidate.confidence,
    intentType: selectedCandidate.intent.type,
  } : undefined;
  window.__FLOW_COMMAND_TRACE__ = {
    commandId, parentCommandId,
    actualActions: [],
    socialContext: { focusedPersonId: context.focusedPersonId, focusedGroupId: context.focusedGroupId, activeMessageId: context.activeMessageId, activeVoiceNoteId: context.activeVoiceNoteId, selectedVoiceMarkerId: context.selectedVoiceMarkerId },
    transcript,
    interpretedAt: performance.now(),
    ...(segment ? { segmentClassification: segment.classification, segmentReason: segment.reason, contentDestination: segment.destination } : {}),
    normalizedInput: normalizeTranscript(transcript),
    domain: selectedCandidate?.domain ?? domainFor(intent.type),
    intent: structuredClone(intent),
    entities: [...new Set([context.selected?.id, ...(context.lastTargets ?? []).map(({ id }) => id)].filter((id): id is string => Boolean(id)))],
    contextUsed: {
      route: context.route,
      topic: context.topic,
      peopleView: context.peopleView,
      focusedEntityId: context.focusedEntityId,
      currentTimeScope: context.currentTimeScope,
      selected: context.selected,
      voiceMode: context.voiceMode,
      activeMode: context.activeMode,
      activeJournalEntryId: context.activeJournalEntryId,
      activeMemoryId: context.activeMemoryId,
      selectedPhotoAssetId: context.selectedPhotoAssetId,
      selectedBookmarkId: context.selectedBookmarkId,
      selectedInsightId: context.selectedInsightId,
      lastIntent: context.lastIntent,
      lastTargets: context.lastTargets,
      pendingIntent: context.pendingIntent,
      recentRoutes: context.recentRoutes,
      recentActionTypes: context.recentActionTypes,
    },
    confidenceTier: intent.type === "clarification" ? "needs-clarification" : intent.type === "unsupported" ? "unsupported" : "high",
    actions: [],
    ...(selected ? { selectedCandidate: selected } : {}),
    candidates: candidates.map(({ definitionId, domain, score, positiveEvidence, negativeEvidence, confidence, intent: candidateIntent }) => ({
      definitionId, domain, score, positiveEvidence: [...positiveEvidence], negativeEvidence: [...negativeEvidence], confidence, intentType: candidateIntent.type,
    })),
  };
  publishTrace();
}

export function completeCommandTrace(actions: readonly LifeAction[], entities: readonly string[] = [], unresolvedReason?: string) {
  if (!import.meta.env.DEV || typeof window === "undefined" || !window.__FLOW_COMMAND_TRACE__) return;
  window.__FLOW_COMMAND_TRACE__ = {
    ...window.__FLOW_COMMAND_TRACE__,
    actions: structuredClone(actions) as LifeAction[],
    entities: [...entities],
    ...(unresolvedReason ? { unresolvedReason, confidenceTier: "needs-clarification" as const } : {}),
  };
  publishTrace();
}
