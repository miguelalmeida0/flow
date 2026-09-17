import { mkdirSync, writeFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { createLifeCommandRunner, type ControllerOptions } from "../../app/lifeCommandController";
import type { CommandFeedback, PendingLifeChange } from "../../app/environment-types";
import type { LifeContext, LifeRoute, LifeSnapshot, Plan, TemporalScope } from "../../domain/life-model";
import { createFreshLifeSnapshot } from "../../domain/life-storage";
import { applyLifeTransaction } from "../../domain/life-transaction";
import { projectInstinctExposure } from "../elite/instinctExposure";
import { normalizeTranscript } from "../day-planner/interpretation/normalize";
import { resolveGlobalCommand, type GlobalIntent } from "../../shared/command/globalInterpreter";
import { languageInventory, type LanguageCase } from "./languageDatabase";
import { pendingStaticSourceCases } from "./staticSourceEditorial";
import { pendingAssistedEditorialCases } from "./assistedEditorialContracts";
import { pendingStaticDomainCases } from "./staticDomainEditorial";
import { pendingReviewedAssistedCases } from "./reviewedAssistedCases";
import { pendingLateAssistedCases } from "./lateAssistedEditorial";
import { pendingRichCalendarCases, pendingSupplementCases } from "./lateStaticEditorial";
import { pendingLateStudioCases } from "./lateStudioEditorial";
import { resolveEventReference } from "../day-planner/scheduling/resolution";
import { applyPendingChoice } from "../day-planner/plannerPreview";
import type { StudioPlaybackRequest } from "../studio/studioPlayback";
import type { StudioRuntimeCommand } from "../studio/studioCommandPlan";
import type { CalendarEvent, EventSelector } from "../day-planner/model";
import type { JournalEntry, MemoryArtifact, StudioMediaAsset } from "../../domain/studio-model";
import { cloneAtmosphereLayers } from "../../domain/studio-model";
import { acceptanceFixture } from "./acceptanceFixtures";
import { entityIdentityInventory, expectedDocument } from "./semanticExpectation";
import type { LifeAction } from "../../domain/life-actions";
import { proposedVoiceRebuildCases } from "./voiceRebuildEditorial";
import { calendarDialogueFixture } from "./calendarDialogueFixture";
import { literalCreationRegressions } from "./literalCreationRegressions";
import { initialCommitmentView, type CommitmentViewState } from "../people/commitmentView";
import { temporalScopeTransition } from "../../domain/temporalScopeTransition";

const now = new Date("2026-09-05T12:00:00.000Z");
const evidencePath = "artifacts/voice-intelligence/production-pipeline-report.json";
const pristineEvaluationSnapshot = createFreshLifeSnapshot("2026-09-05");

function stable(value: unknown) {
  return JSON.stringify(value);
}

function selectorQuery(selector: EventSelector): string | undefined {
  if (selector.type === "title" || selector.type === "filter") return selector.query;
  if (selector.type === "source" || selector.type === "position") return selector.query;
  if (selector.type === "relativeEvent") return selectorQuery(selector.anchor);
  if (selector.type === "multi") return selector.selectors.map(selectorQuery).find(Boolean);
  return undefined;
}

/** Corpus rows describe language, while this evaluator supplies the minimum
 * real entities named by that language. Fixtures are preconditions only: they
 * are inserted before execution, never through history, and every result still
 * travels through production resolution, planning, transaction, invariants,
 * and the same commit boundary as the application. */
function snapshotForCase(row?: LanguageCase): LifeSnapshot {
  if (!row) return pristineEvaluationSnapshot;
  if (row.fixtureId) {
    const snapshot = acceptanceFixture(row.fixtureId).snapshot;
    if (row.fixtureSpec?.collections) Object.assign(snapshot.document, structuredClone(row.fixtureSpec.collections));
    const target = row.fixtureSpec?.calendarTarget;
    if (target) {
      const plan = snapshot.document.calendars[target.dateKey];
      if (!plan || Object.values(snapshot.document.calendars).some((day) => day.events.some(({ id }) => id === target.id))) throw new Error(`Invalid independent target fixture: ${row.id}`);
      plan.events.push(structuredClone(target)); plan.events.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
      snapshot.document.calendar = structuredClone(snapshot.document.calendars[snapshot.document.calendar.dateKey]!);
    }
    const preset = row.fixtureSpec?.playingPreset;
    if (preset) {
      const studio = snapshot.document.studio;
      if (!studio.atmospherePresets.some(({ id }) => id === preset.id)) studio.atmospherePresets.push(structuredClone(preset));
      studio.activeAtmosphere = { presetId: preset.id, playing: true, muted: false, masterVolume: preset.masterVolume, layers: structuredClone(preset.layers) };
    }
    return snapshot;
  }
  const needsFixture = row.context.route === "journal"
    || row.context.topic === "journal"
    || Boolean(row.context.activeJournalEntryId)
    || row.context.route === "memories"
    || row.context.topic === "memory"
    || Boolean(row.context.activeMemoryId)
    || row.context.route === "atmosphere"
    || row.context.topic === "atmosphere"
    || Boolean(row.expected.intent?.startsWith("atmosphere"))
    || row.expected.intent === "focus-request"
    || row.expected.intent === "person-query"
    || row.expected.intent === "calendar";
  // Production transactions are pure and replace the document reference. The
  // immutable pristine snapshot is therefore safe to share for rows that need
  // no entity precondition; only fixture-bearing rows pay for a deep clone.
  if (!needsFixture) return pristineEvaluationSnapshot;
  const snapshot = structuredClone(pristineEvaluationSnapshot);
  const document = snapshot.document;
  const at = now.toISOString();

  const journalId = row.context.activeJournalEntryId ?? "evaluation-journal";
  if (row.context.route === "journal" || row.context.topic === "journal" || row.context.activeJournalEntryId) {
    const audio: StudioMediaAsset = { id: "evaluation-journal-audio", kind: "journal-audio", name: "evaluation.webm", mimeType: "audio/webm", size: 512, createdAt: at };
    const entry: JournalEntry = {
      id: journalId, kind: "journal-entry", title: "Evaluation journal", text: "A real passage for production evaluation.", status: "draft",
      recordingState: row.context.voiceMode === "journal-longform" ? "recording" : "idle", recordingDurationMs: 60_000,
      audioAssetId: audio.id, photoAssetIds: ["evaluation-photo"],
      bookmarks: [{ id: "evaluation-bookmark", timestampMs: 15_000, transcriptAnchor: "A real passage", createdAt: at }],
      transcriptSegments: [{ id: "evaluation-segment", text: "A real passage", startMs: 0, endMs: 15_000, source: "typed" }],
      drawings: [], tags: [], createdAt: at, updatedAt: at,
    };
    document.studio.journalEntries = [entry];
    document.studio.mediaAssets = [audio, { id: "evaluation-photo", kind: "journal-photo", name: "evaluation.jpg", mimeType: "image/jpeg", size: 512, createdAt: at }];
  }

  const memoryId = row.context.activeMemoryId ?? "evaluation-memory";
  if (row.context.route === "memories" || row.context.topic === "memory" || row.context.activeMemoryId) {
    if (!document.studio.journalEntries.length) {
      const entry: JournalEntry = {
        id: journalId, kind: "journal-entry", title: "Evaluation journal", text: "A real passage for production evaluation.", status: "saved",
        recordingState: "idle", recordingDurationMs: 60_000, audioAssetId: "evaluation-journal-audio", photoAssetIds: ["evaluation-photo"],
        bookmarks: [{ id: "evaluation-bookmark", timestampMs: 15_000, transcriptAnchor: "A real passage", createdAt: at }],
        transcriptSegments: [{ id: "evaluation-segment", text: "A real passage", startMs: 0, endMs: 15_000, source: "typed" }],
        drawings: [], tags: [], createdAt: at, updatedAt: at,
      };
      document.studio.journalEntries = [entry];
      document.studio.mediaAssets = [
        { id: "evaluation-journal-audio", kind: "journal-audio", name: "evaluation.webm", mimeType: "audio/webm", size: 512, createdAt: at },
        { id: "evaluation-photo", kind: "journal-photo", name: "evaluation.jpg", mimeType: "image/jpeg", size: 512, createdAt: at },
      ];
    }
    const memory: MemoryArtifact = {
      id: memoryId, kind: "memory", title: "Evaluation memory", journalEntryId: document.studio.journalEntries[0]!.id,
      composition: "page", passage: "A real passage", showDate: true, datePlacement: "inline", textScale: 1,
      textOffset: { x: 0, y: 0 }, audioEnabled: true, audioInMs: 0, audioOutMs: 30_000, status: "draft", createdAt: at, updatedAt: at,
    };
    document.studio.memories = [memory];
  }

  if (row.context.route === "atmosphere" || row.context.topic === "atmosphere" || row.expected.intent?.startsWith("atmosphere")) {
    const query = row.utterance.match(/^(?:play|start|put on|use) (?:my )?(.+?)(?: atmosphere)?$/i)?.[1]?.trim();
    const existing = document.studio.atmospherePresets[0]!;
    if (query && !document.studio.atmospherePresets.some(({ name }) => name.toLowerCase() === query.toLowerCase())) {
      document.studio.atmospherePresets.push({ ...existing, id: `evaluation-atmosphere-${normalizeTranscript(query).replaceAll(" ", "-")}`, name: query, builtIn: false, createdAt: at, updatedAt: at });
    }
    const preset = query
      ? document.studio.atmospherePresets.find(({ name }) => name.toLowerCase() === query.toLowerCase()) ?? existing
      : existing;
    document.studio.activeAtmosphere = { presetId: preset.id, playing: true, muted: false, masterVolume: preset.masterVolume, layers: cloneAtmosphereLayers(preset.layers) };
  }

  if (row.expected.intent === "focus-request") {
    const subject = normalizeTranscript(row.utterance).match(/^focus on (.+?) for\s+/)?.[1] ?? "evaluation focus";
    const plan: Plan = { id: "evaluation-plan", kind: "plan", title: subject, outcome: `Ready: ${subject}`, status: "active", stepIds: [], createdAt: at, updatedAt: at };
    document.plans = [plan];
  }

  if (row.expected.intent === "person-query") {
    const resolved = resolveGlobalCommand(row.utterance, row.context, document.calendar.dateKey);
    if (resolved.intent.type === "person-query") {
      document.people = [{ id: `evaluation-person-${normalizeTranscript(resolved.intent.query).replaceAll(" ", "-")}`, kind: "person", name: resolved.intent.query, createdAt: at, updatedAt: at }];
    }
  }

  if (row.expected.intent === "calendar") {
    // A day-boundary utterance is an executable request. Give its production
    // evaluation a legal but still fully populated day so the strict corpus
    // proves the commit/history path; the browser release test separately
    // proves that the ordinary seeded evening produces a focused alternative.
    if (row.id === "regression-end-day-boundary") {
      document.calendar.events = document.calendar.events.map((event) => {
        if (event.id === "workout") return { ...event, start: 15 * 60, end: 16 * 60 };
        if (event.id === "dinner") return { ...event, start: 16 * 60, end: 17 * 60 };
        return event;
      });
      document.calendars[document.calendar.dateKey] = structuredClone(document.calendar);
    }
    const parsed = resolveGlobalCommand(row.utterance, row.context, document.calendar.dateKey, document.steps, document.preferences.workdayEndMinutes);
    if (parsed.intent.type === "calendar") {
      const targetSelector = parsed.intent.request.actions
        .flatMap((action) => [
          ...("selector" in action ? [action.selector] : []),
          ...("destination" in action && action.destination?.type === "relative" ? [action.destination.anchor] : []),
        ])
        .find((selector) => Boolean(selectorQuery(selector)));
      const targetQuery = targetSelector ? selectorQuery(targetSelector) : undefined;
      if (targetQuery && !document.calendar.events.some(({ title }) => normalizeTranscript(title).includes(normalizeTranscript(targetQuery)))) {
        const requestedPeriod = targetSelector && "period" in targetSelector ? targetSelector.period : undefined;
        const targetStart = requestedPeriod === "morning" ? 8 * 60 + 30
          : requestedPeriod === "evening" ? 18 * 60
            : 15 * 60;
        const target: CalendarEvent = {
          id: `evaluation-event-${normalizeTranscript(targetQuery).replaceAll(" ", "-")}`,
          title: targetQuery.replace(/^./, (letter) => letter.toUpperCase()), dateKey: document.calendar.dateKey,
          start: targetStart, end: targetStart + 30, kind: "flexible", priority: "medium", protected: false, status: "planned", mobility: "light",
        };
        document.calendar.events.push(target);
        document.calendar.events.sort((left, right) => left.start - right.start);
        document.calendars[document.calendar.dateKey] = structuredClone(document.calendar);
      }
    }
  }

  return snapshot;
}

function evaluator(initialContext: LifeContext = { route: "home", activeMode: "command", nowMs: now.getTime() }, row?: LanguageCase, initialSnapshot?: LifeSnapshot) {
  const now = new Date(initialContext.nowMs ?? Date.parse("2026-09-05T12:00:00.000Z"));
  let snapshot: LifeSnapshot = initialSnapshot ?? snapshotForCase(row);
  let context: LifeContext = { activeMode: "command", nowMs: now.getTime(), ...initialContext };
  let route: LifeRoute = initialContext.route;
  let focusedEntityId = initialContext.focusedEntityId;
  let activePlanId = initialContext.activePlanId;
  let selectedCalendarEventId = initialContext.selected?.kind === "calendar-event" ? initialContext.selected.id : undefined;
  let pending: PendingLifeChange | undefined;
  let feedback: CommandFeedback = { phase: "ready", title: "Ready" };
  let lastIntent: GlobalIntent["type"] = "unsupported";
  let lastTranscript = "";
  let commitCount = 0;
  let commitmentView: CommitmentViewState = { ...initialCommitmentView };
  const committedActionBatches: string[][] = [];

  const setValue = <T>(read: () => T, write: (value: T) => void) => (next: T | ((value: T) => T)) => {
    write(typeof next === "function" ? (next as (value: T) => T)(read()) : next);
  };

  const performCommit: ControllerOptions["commit"] = (actions, transcript, source, summary, transition) => {
    const before = snapshot.document;
    const result = applyLifeTransaction(before, actions, () => now);
    if (result.status !== "success") {
      if (result.status === "confirmation" && result.calendarRequest) {
        pending = {
          actions: [{ type: "calendar.request", request: result.calendarRequest, confirmed: result.authorizationKey }],
          transcript,
          source,
          summary: result.title,
          confirmLabel: result.confirmLabel,
        };
        feedback = { phase: "confirmation", title: result.title, detail: result.detail, transcript };
      } else feedback = { phase: result.status === "clarification" ? "clarification" : "error", title: result.title, detail: result.detail, transcript };
      return false;
    }
    if (stable(before) === stable(result.document)) {
      feedback = { phase: "completed", title: "No change needed", detail: result.summary, transcript };
      return false;
    }
    const transaction = {
      id: `evaluation-${commitCount + 1}`,
      at: now.toISOString(),
      source,
      transcript,
      summary: summary ?? result.summary,
      before,
      after: result.document,
      actionTypes: actions.map(({ type }) => type),
    };
    snapshot = {
      ...snapshot,
      revision: snapshot.revision + 1,
      document: result.document,
      past: [...snapshot.past, { document: before, lastTransaction: snapshot.lastTransaction }],
      future: [],
      lastTransaction: transaction,
    };
    pending = undefined;
    commitCount += 1;
    committedActionBatches.push(transaction.actionTypes);
    feedback = { phase: "completed", title: transaction.summary, transcript };
    // The production provider reveals the canonical transition destination
    // after successful persistence. It is not a separate data transaction.
    if (transition) options.navigate(transition.route, transition.planId, false, transition.peopleView);
    return true;
  };

  const performUndo = () => {
    const prior = snapshot.past.at(-1);
    if (!prior) { feedback = { phase: "completed", title: "Nothing to undo", detail: "History is unchanged." }; return; }
    snapshot = {
      ...snapshot,
      revision: snapshot.revision + 1,
      document: prior.document,
      past: snapshot.past.slice(0, -1),
      future: [...snapshot.future, { document: snapshot.document, lastTransaction: snapshot.lastTransaction }],
      ...(prior.lastTransaction ? { lastTransaction: prior.lastTransaction } : {}),
    };
    feedback = { phase: "completed", title: "Undid the last change" };
  };

  const performRedo = () => {
    const later = snapshot.future.at(-1);
    if (!later) { feedback = { phase: "completed", title: "Nothing to redo", detail: "History is unchanged." }; return; }
    snapshot = {
      ...snapshot,
      revision: snapshot.revision + 1,
      document: later.document,
      past: [...snapshot.past, { document: snapshot.document, lastTransaction: snapshot.lastTransaction }],
      future: snapshot.future.slice(0, -1),
      ...(later.lastTransaction ? { lastTransaction: later.lastTransaction } : {}),
    };
    feedback = { phase: "completed", title: "Redid the last change" };
  };

  const options = {} as ControllerOptions;
  const syncOptions = () => {
    options.route = route;
    options.focusedEntityId = focusedEntityId;
    options.activePlanId = activePlanId;
    options.selectedCalendarEventId = selectedCalendarEventId;
  };

  Object.assign(options, {
    getSnapshot: () => snapshot,
    getContext: () => ({ ...context, pending: pending?.clarification ? "clarification" : pending ? "confirmation" : undefined, pendingChoices: pending?.clarification?.choices }),
    updateContext: (patch: Partial<LifeContext>) => { context = { ...context, ...patch }; },
    route,
    focusedEntityId,
    activePlanId,
    selectedCalendarEventId,
    getPending: () => pending,
    now: () => now,
    navigate: (nextRoute: LifeRoute, planId?: string, _replace?: boolean, peopleView?: LifeContext["peopleView"]) => {
      route = nextRoute;
      activePlanId = planId;
      context = { ...context, route: nextRoute, peopleView: peopleView ?? context.peopleView, pendingIntent: undefined };
      syncOptions();
    },
    setTemporalScope: (scope: TemporalScope) => {
      const previous = snapshot;
      snapshot = temporalScopeTransition(previous, scope, previous.temporal?.todayDateKey ?? previous.document.calendar.dateKey);
      if (snapshot !== previous) {
        pending = undefined; selectedCalendarEventId = undefined;
        context = { ...context, currentTimeScope: scope, nowMs: now.getTime(), turn: (context.turn ?? 0) + 1 };
      }
      feedback = { phase: "completed", title: scope.kind === "week" ? "Opened week" : `Opened ${scope.dateKey}` };
    },
    recordInstinctExposure: (ids) => { snapshot = projectInstinctExposure(snapshot, ids, new Date(context.nowMs!)); },
    commit: performCommit,
    undo: performUndo,
    redo: performRedo,
    confirm: () => {
      const active = pending;
      if (active) performCommit(active.actions, active.transcript, active.source, active.summary);
      else feedback = { phase: "completed", title: "Nothing is waiting for confirmation", detail: "Nothing changed." };
    },
    cancel: () => { pending = undefined; feedback = { phase: "completed", title: "Cancelled", detail: "Nothing changed." }; },
    setFocusedEntityId: setValue(() => focusedEntityId, (value) => { focusedEntityId = value; syncOptions(); }),
    setSelectedCalendarEventId: setValue(() => selectedCalendarEventId, (value) => { selectedCalendarEventId = value; syncOptions(); }),
    setActivePlanId: setValue(() => activePlanId, (value) => { activePlanId = value; syncOptions(); }),
    setFeedback: setValue(() => feedback, (value) => { feedback = value; }),
    setLastTranscript: setValue(() => lastTranscript, (value) => { lastTranscript = value; }),
    setPending: setValue(() => pending, (value) => { pending = value; }),
    setNowQuery: () => undefined,
    setNowExplanationOpen: () => undefined,
    showCalendarChange: () => undefined,
    choosePending: (choiceId: string) => {
      if (!pending?.calendarRequest || !pending.clarification) return;
      const request = applyPendingChoice({ type: "clarification", request: pending.calendarRequest, clarification: pending.clarification, source: pending.source }, choiceId);
      performCommit([{ type: "calendar.request", request }], request.transcript, pending.source);
    },
    setIntentType: (intent: GlobalIntent["type"]) => { lastIntent = intent; },
    acknowledgeVoiceIntent: () => undefined,
    updateCommitmentView: (patch) => { commitmentView = { ...commitmentView, ...patch }; return commitmentView; },
  } satisfies ControllerOptions);

  const run = (transcript: string, source: "type" | "voice" = "type") => {
    syncOptions();
    createLifeCommandRunner(options)(transcript, source, `evaluation-${transcript}`);
    return { feedback, lastIntent, commitCount, snapshot, context, pending, lastTranscript };
  };

  return {
    run,
    snapshot: () => snapshot,
    context: () => context,
    route: () => route,
    commitCount: () => commitCount,
    committedActionBatches,
    commitmentView: () => commitmentView,
  };
}

interface ProductionCaseEvidence {
  id: string;
  source: string;
  route: LifeRoute;
  resultingRoute: LifeRoute;
  expectedRoute?: LifeRoute;
  transcript: string;
  normalizedText: string;
  selectedIntent: GlobalIntent["type"];
  expectedIntent?: GlobalIntent["type"];
  expectedResolution: LanguageCase["expected"]["resolution"];
  selectedCandidate?: { id: string; domain: string; score: number; confidence: string };
  candidates: Array<{ id: string; domain: string; intent: GlobalIntent["type"]; score: number; positive: string[]; negative: string[] }>;
  context: LifeContext;
  actions: string[];
  historyDelta: number;
  stateChanged: boolean;
  feedback: CommandFeedback["phase"];
  latencyMs: number;
  fixtureId?: LanguageCase["fixtureId"];
  provenance?: LanguageCase["provenance"];
  semanticExpectation?: LanguageCase["semantic"];
  selectedSemanticIntent?: GlobalIntent;
  plannedSemanticActions?: LifeAction[];
}

function executeCase(row: LanguageCase, subject = evaluator(row.context, row), source: "type" | "voice" = "type"): ProductionCaseEvidence {
  const before = subject.snapshot();
  const beforeHistory = before.past.length;
  const beforeBatchCount = subject.committedActionBatches.length;
  const beforeCommits = subject.commitCount();
  const context = { ...subject.context(), route: subject.route() };
  const started = performance.now();
  const runtimeCommands: StudioRuntimeCommand[] = [];
  const sessionRequests: unknown[] = [];
  const observeSession = (event: Event) => { sessionRequests.push(structuredClone((event as CustomEvent).detail)); };
  const observeJournal = (event: Event) => { runtimeCommands.push(structuredClone((event as CustomEvent<StudioRuntimeCommand>).detail)); };
  const observePlayback = (event: Event) => {
    const request = (event as CustomEvent<StudioPlaybackRequest>).detail;
    runtimeCommands.push(structuredClone(request.command));
    // A requested side-effect sink only, not an assertion of media playback.
    request.accept(async () => undefined);
  };
  window.addEventListener("flow-studio-playback", observePlayback);
  window.addEventListener("flow-journal-runtime", observeJournal);
  window.addEventListener("flow-live-command", observeSession);
  const viewport = row.semantic?.viewport;
  const surface = viewport ? document.createElement("main") : undefined;
  if (surface && viewport) {
    surface.setAttribute("data-primary-content-rect", "");
    Object.defineProperties(surface, { clientHeight: { value: viewport.height }, scrollHeight: { value: viewport.scrollHeight } });
    surface.scrollTop = viewport.beforeTop;
    surface.scrollTo = ((options: ScrollToOptions) => { surface.scrollTop = Math.max(0, Math.min(viewport.scrollHeight - viewport.height, options.top ?? surface.scrollTop)); }) as typeof surface.scrollTo;
    document.body.append(surface);
  }
  let result: ReturnType<typeof subject.run>;
  try { result = subject.run(row.utterance, source); }
  finally { window.removeEventListener("flow-studio-playback", observePlayback); window.removeEventListener("flow-journal-runtime", observeJournal); window.removeEventListener("flow-live-command", observeSession); surface?.remove(); }
  const latencyMs = Number((performance.now() - started).toFixed(3));
  const trace = window.__FLOW_COMMAND_TRACE__;
  if (!trace) throw new Error(`${row.id}: production runner did not publish a command trace`);
  const selectedIntent = trace.intent as GlobalIntent;
  const after = result.snapshot;
  const historyDelta = after.past.length - beforeHistory;
  // The transaction layer is immutable: a committed mutation replaces the
  // document, while clarification, unsupported, navigation, and no-op paths
  // retain the exact reference. This avoids serializing the whole life model
  // twice for every one of the 33,500 evaluator cases.
  const stateChanged = after.document !== before.document;
  const actions = subject.committedActionBatches.slice(beforeBatchCount).flat();
  const actualResolution = selectedIntent.type === "unsupported" ? "unsupported" : selectedIntent.type === "clarification" ? "clarify" : "execute";
  const expectedRoute = row.expected.route
    ?? (selectedIntent.type === "navigate" && selectedIntent.route !== "back" ? selectedIntent.route : undefined)
    ?? (selectedIntent.type === "navigate-temporal" ? selectedIntent.route : undefined);

  expect(actualResolution, `${row.id}: production resolution ${JSON.stringify(selectedIntent)}`).toBe(row.expected.resolution);
  if (row.expected.intent) expect(selectedIntent.type, `${row.id}: production intent`).toBe(row.expected.intent);
  if (row.expected.domain) expect(trace.domain, `${row.id}: selected domain`).toBe(row.expected.domain);
  expect(result.lastIntent, row.id).toBe(selectedIntent.type);
  if (row.expected.resolution === "execute" && !row.semantic?.feedbackPhase) {
    expect(["completed", "confirmation"], `${row.id}: expected execution did not complete (${result.feedback.title}: ${result.feedback.detail ?? ""})`).toContain(result.feedback.phase);
  }
  if (expectedRoute) expect(subject.route(), `${row.id}: resulting route`).toBe(expectedRoute);
  expect(historyDelta, `${row.id}: one request may create at most one history entry`).toBeLessThanOrEqual(1);
  if (selectedIntent.type === "unsupported" || selectedIntent.type === "clarification") {
    expect(stateChanged, `${row.id}: unresolved speech mutated state`).toBe(false);
    expect(historyDelta, `${row.id}: unresolved speech entered history`).toBe(0);
  }
  // A person query may explicitly change its viewed date as well. The frozen
  // scope and whole-document oracle below prove that only that projection
  // changed; declaring a view is never permission to skip the complement.
  const isViewProjection = selectedIntent.type === "temporal" || selectedIntent.type === "navigate-temporal" || Boolean(row.semantic?.scope);
  if (stateChanged && selectedIntent.type !== "history" && !isViewProjection && !row.semantic?.ambientExposure) {
    expect(historyDelta, `${row.id}: state mutation was not an atomic history transaction`).toBe(1);
  }
  if (historyDelta === 1) expect(actions.length, `${row.id}: committed history has no typed action`).toBeGreaterThan(0);
  if (result.feedback.phase === "error") {
    expect(stateChanged, `${row.id}: failed production plan mutated state`).toBe(false);
    expect(historyDelta, `${row.id}: failed production plan entered history`).toBe(0);
  }
  if (row.semantic) {
    if (row.semantic.historyDelta === 0 && row.semantic.feedbackPhase === "completed" && !row.semantic.scope) expect(after.document, `${row.id}: full no-op state before history check`).toEqual(expectedDocument(before.document, row.semantic, new Date(context.nowMs!).toISOString()));
    expect(historyDelta, `${row.id}: exact history delta; ${result.feedback.phase}: ${result.feedback.title}; ${result.feedback.detail ?? ""}; intent=${JSON.stringify(selectedIntent)}`).toBe(row.semantic.historyDelta);
    if (row.semantic.feedbackPhase) expect(result.feedback.phase, `${row.id}: exact pending/completed/error outcome`).toBe(row.semantic.feedbackPhase);
    if (row.semantic.feedback) expect(result.feedback, `${row.id}: actual user-visible query result`).toMatchObject(row.semantic.feedback);
    if (row.semantic.resultEntityIds) expect(trace.entities, `${row.id}: exact query result identity`).toEqual(row.semantic.resultEntityIds);
    if (row.semantic.commitCount !== undefined) expect(subject.commitCount() - beforeCommits, `${row.id}: successful commits, not attempts`).toBe(row.semantic.commitCount);
    if (row.semantic.runtimeCommands) expect(runtimeCommands, `${row.id}: exact requested native commands (no playback claim)`).toEqual(row.semantic.runtimeCommands);
    if (row.semantic.sessionRequests) expect(sessionRequests, `${row.id}: exact adapter requests, not microphone acquisition`).toEqual(row.semantic.sessionRequests);
    if (row.semantic.contextAfter) expect(subject.context(), `${row.id}: resolved conversational references`).toMatchObject(row.semantic.contextAfter);
    for (const field of row.semantic.absentContextFields ?? []) expect(subject.context()[field], `${row.id}: context ${field} must be absent`).toBeUndefined();
    if (row.semantic.queryResult) expect(trace.queryResult, `${row.id}: factual query result`).toEqual(row.semantic.queryResult);
    if (row.semantic.queryWindow) expect(trace.queryWindow, `${row.id}: actual available geometry and occupied source`).toMatchObject(row.semantic.queryWindow);
    if (row.semantic.ambientExposure) expect(after.revision, `${row.id}: exactly one ambient projection plus user commits`).toBe(before.revision + 1 + row.semantic.historyDelta);
    if (viewport) expect(surface!.scrollTop, `${row.id}: actual main viewport destination`).toBe(viewport.afterTop);
    if (row.semantic.targetIds) {
      const targets = trace.actions.flatMap((action) => {
        if (action.type !== "calendar.request") return [];
        const calendar = before.document.calendars[action.sourceDateKey ?? before.document.calendar.dateKey]!;
        return action.request.actions.flatMap((operation) => {
          if (!("selector" in operation)) return [];
          const resolved = resolveEventReference(calendar, operation.selector, action.selectedId, action.request.nowMinutes, operation.type === "reopen", operation.type === "delete");
          expect(resolved.status, `${row.id}: actual selector must resolve`).toBe("resolved");
          return resolved.status === "resolved" ? resolved.events.map(({ id }) => id) : [];
        });
      });
      expect([...new Set(targets)], `${row.id}: actual selected target identities, including no-op requests`).toEqual(row.semantic.targetIds);
    }
    if (row.semantic.intent) expect(selectedIntent, `${row.id}: exact semantic slots`).toMatchObject(row.semantic.intent);
    for (const key of row.semantic.absentIntentFields ?? []) expect((selectedIntent as unknown as Record<string, unknown>)[key], `${row.id}: no invented ${key} slot`).toBeUndefined();
    if (row.semantic.calendarActionTypes) expect(selectedIntent?.type === "calendar" ? selectedIntent.request.actions.map(({ type }) => type) : undefined, `${row.id}: ordered Calendar capabilities`).toEqual(row.semantic.calendarActionTypes);
    if (row.semantic.actions) {
      expect(trace.actions, `${row.id}: canonical planned action count`).toHaveLength(row.semantic.actions.length);
      expect(trace.actions, `${row.id}: canonical action parameters`).toMatchObject(row.semantic.actions);
    }
    if (row.semantic.pendingActions) {
      expect(result.pending?.actions, `${row.id}: exact pending action count`).toHaveLength(row.semantic.pendingActions.length);
      expect(result.pending?.actions, `${row.id}: bound pending targets`).toMatchObject(row.semantic.pendingActions);
    }
    if (row.semantic.noPending) expect(result.pending, `${row.id}: no pending authority may remain`).toBeUndefined();
    if (row.semantic.scope) {
      const old = before.temporal?.scope, next = row.semantic.scope;
      const changed = old?.kind !== next.kind || old.dateKey !== next.dateKey || old.endDateKey !== next.endDateKey;
      expect(after.temporal, `${row.id}: exact view state`).toEqual(changed
        ? { todayDateKey: before.temporal?.todayDateKey ?? before.document.calendar.dateKey, scope: next, ...(old ? { previousScope: old } : {}) }
        : before.temporal);
      expect(after.revision, `${row.id}: view persistence revision`).toBe(before.revision + Number(changed));
    }
    if (row.semantic.commitmentView) expect(subject.commitmentView(), `${row.id}: exact transient commitment view`).toEqual(row.semantic.commitmentView);
    expect(after.document, `${row.id}: full document field oracle, including untouched domains`).toEqual(expectedDocument(before.document, row.semantic, new Date(context.nowMs!).toISOString()));
    if (row.semantic.noCreation) {
      expect(entityIdentityInventory(after.document), `${row.id}: no unintended entity creation or deletion`).toEqual(entityIdentityInventory(before.document));
    }
    if (historyDelta === 0 && !stateChanged) expect(after.document, row.id).toEqual(before.document);
    if (historyDelta === 0) {
      expect(after.past, `${row.id}: no consumed undo history`).toEqual(before.past);
      expect(after.future, `${row.id}: no consumed redo history`).toEqual(before.future);
    }
    if (historyDelta === 1) {
      // Diagnostic history checks must not inject user turns into the real
      // dialogue subject or change its revision, pending state or referents.
      const historyCheck = evaluator(structuredClone(subject.context()), undefined, structuredClone(after));
      const undoDocument = row.semantic.ambientExposure ? { ...before.document, instinctState: row.semantic.ambientExposure } : before.document;
      historyCheck.run("Undo"); expect(historyCheck.snapshot().document, `${row.id}: exact full undo`).toEqual(undoDocument);
      historyCheck.run("Redo"); expect(historyCheck.snapshot().document, `${row.id}: exact full redo`).toEqual(after.document);
    }
  }

  return {
    id: row.id,
    source: row.source,
    route: row.context.route,
    resultingRoute: subject.route(),
    ...(expectedRoute ? { expectedRoute } : {}),
    transcript: row.utterance,
    normalizedText: normalizeTranscript(row.utterance),
    selectedIntent: selectedIntent.type,
    ...(row.expected.intent ? { expectedIntent: row.expected.intent } : {}),
    expectedResolution: row.expected.resolution,
    ...(trace.selectedCandidate ? { selectedCandidate: { id: trace.selectedCandidate.definitionId, domain: trace.selectedCandidate.domain, score: trace.selectedCandidate.score, confidence: trace.selectedCandidate.confidence } } : {}),
    candidates: trace.candidates.map((item) => ({
      id: item.definitionId,
      domain: item.domain,
      intent: item.intentType as GlobalIntent["type"],
      score: item.score,
      positive: item.positiveEvidence,
      negative: item.negativeEvidence,
    })),
    context,
    actions,
    historyDelta,
    stateChanged,
    feedback: result.feedback.phase,
    latencyMs,
    ...(row.fixtureId ? { fixtureId: row.fixtureId, provenance: row.provenance, semanticExpectation: row.semantic, selectedSemanticIntent: selectedIntent, plannedSemanticActions: trace.actions } : {}),
  };
}

describe("production voice-intelligence planner and transaction evaluator", () => {
  it("projects an independently named calendar day without business history", () => {
    const fixture = acceptanceFixture("calendar-reference");
    fixture.snapshot.past = [{ document: structuredClone(fixture.snapshot.document) }];
    fixture.snapshot.future = [{ document: structuredClone(fixture.snapshot.document) }];
    const before = structuredClone(fixture.snapshot), expected = structuredClone(before);
    const day = { dateKey: "2026-09-09", events: [], deferred: [], breathingRooms: [] };
    expected.revision += 1; expected.document.calendar = day; expected.document.calendars[day.dateKey] = structuredClone(day);
    expected.temporal = { todayDateKey: "2026-09-08", previousScope: { kind: "day", dateKey: "2026-09-08" }, scope: { kind: "day", dateKey: "2026-09-09" } };
    const subject = evaluator(fixture.context, undefined, fixture.snapshot);
    expect(subject.run("Show tomorrow").snapshot).toEqual(expected);
    expect(subject.run("Show tomorrow").snapshot).toEqual(expected);
    expect(subject.commitCount()).toBe(0);
  });
  it.each([
    ["I owe someone a reply", "A reply"], ["I owe a friend a reply", "A reply"],
    ["I promised my manager the proposal", "The proposal"], ["I owe them a reply", "A reply"],
  ])("clarifies generic recipients without creating people: %s", (utterance, title) => {
    const fixture = acceptanceFixture("empty-home");
    fixture.snapshot.past = [{ document: structuredClone(fixture.snapshot.document) }];
    fixture.snapshot.future = [{ document: structuredClone(fixture.snapshot.document) }];
    const before = structuredClone(fixture.snapshot), expected = structuredClone(before.document), at = new Date(fixture.context.nowMs!).toISOString();
    expected.people.push({ id: "person-maya", kind: "person", name: "Maya", createdAt: at, updatedAt: at });
    expected.commitments.push({ id: title === "A reply" ? "commitment-person-maya-a-reply" : "commitment-person-maya-the-proposal", kind: "commitment", personId: "person-maya", title, direction: "i-owe", status: "open", createdAt: at, updatedAt: at });
    const subject = evaluator(fixture.context, undefined, fixture.snapshot);
    const asked = subject.run(utterance);
    expect(asked.feedback.phase).toBe("clarification");
    expect(subject.snapshot()).toEqual(before);
    expect(window.__FLOW_COMMAND_TRACE__?.actions).toEqual([]);
    const answered = subject.run("Maya");
    expect(answered.feedback.phase).toBe("completed");
    expect(answered.snapshot.past).toEqual([...before.past, { document: before.document, lastTransaction: before.lastTransaction }]);
    expect(answered.snapshot.future).toEqual([]);
    expect(answered.snapshot.document).toEqual(expected);
    expect(subject.run("Undo").snapshot.document).toEqual(before.document);
    expect(subject.run("Redo").snapshot.document).toEqual(expected);
  });
  it("does not create a promise or person for an explicitly absent recipient", () => {
    const fixture = acceptanceFixture("empty-home"), before = structuredClone(fixture.snapshot);
    const result = evaluator(fixture.context, undefined, fixture.snapshot).run("I owe no one a reply");
    expect(result.feedback.phase).toBe("error"); expect(result.snapshot).toEqual(before);
    expect(window.__FLOW_COMMAND_TRACE__?.actions).toEqual([]);
  });
  it.each(["What now?", "What's next?", "Weather forecast", "Tomorrow", "Help"])("does not consume a global replacement as a recipient: %s", (replacement) => {
    const fixture = acceptanceFixture("commitment-reference");
    fixture.snapshot.past = [{ document: structuredClone(fixture.snapshot.document) }];
    fixture.snapshot.future = [{ document: structuredClone(fixture.snapshot.document) }];
    const before = structuredClone(fixture.snapshot), subject = evaluator(fixture.context, undefined, fixture.snapshot);
    expect(subject.run("I owe someone a reply").feedback.phase).toBe("clarification");
    const result = subject.run(replacement);
    expect(result.lastIntent).not.toBe("commitment-create");
    const expected = structuredClone(before.document);
    if (replacement === "Tomorrow") {
      const viewed = { dateKey: "2026-09-09", events: [], deferred: [], breathingRooms: [] };
      expected.calendar = viewed; expected.calendars[viewed.dateKey] = structuredClone(viewed);
      expect(result.snapshot.temporal?.scope).toEqual({ kind: "day", dateKey: "2026-09-09" });
    }
    expect(result.snapshot.document).toEqual(expected);
    expect(result.snapshot.past).toEqual(before.past); expect(result.snapshot.future).toEqual(before.future);
    expect(window.__FLOW_COMMAND_TRACE__?.actions).toEqual([]);
  });
  it.each([
    ["I owe Maya someone else’s notes", "Maya", "Someone else’s notes", "commitment-p-maya-someone-else-s-notes"],
    ['I owe "Someone" a reply', "Someone", "A reply", "commitment-known-someone-a-reply"],
  ])("keeps recipient-like words inside obligation content: %s", (utterance, recipient, title, id) => {
    const fixture = acceptanceFixture("commitment-reference"), at = new Date(fixture.context.nowMs!).toISOString();
    fixture.snapshot.document.people.push({ id: "known-someone", kind: "person", name: "Someone", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" });
    const before = structuredClone(fixture.snapshot), expected = structuredClone(before.document);
    expected.commitments.push({ id, kind: "commitment", personId: recipient === "Maya" ? "P-Maya" : "known-someone", title, direction: "i-owe", status: "open", dueAt: undefined, createdAt: at, updatedAt: at });
    const subject = evaluator(fixture.context, undefined, fixture.snapshot), result = subject.run(utterance);
    expect(result.feedback.phase).toBe("completed"); expect(result.snapshot.document).toEqual(expected);
    expect(result.snapshot.past).toHaveLength(1); expect(result.snapshot.past[0]!.document).toEqual(before.document);
    expect(subject.run("Undo").snapshot.document).toEqual(before.document);
    expect(subject.run("Redo").snapshot.document).toEqual(expected);
  });
  it.each(['"Maya"', "The name is Maya"])("accepts an explicit recipient answer without rewriting the obligation: %s", (answer) => {
    const fixture = acceptanceFixture("commitment-reference"), subject = evaluator(fixture.context, undefined, fixture.snapshot);
    const before = structuredClone(fixture.snapshot.document), expected = structuredClone(before), at = new Date(fixture.context.nowMs!).toISOString();
    expected.commitments.push({ id: "commitment-p-maya-a-reply", kind: "commitment", personId: "P-Maya", title: "A reply", direction: "i-owe", status: "open", dueAt: "2026-09-11T17:00:00.000Z", createdAt: at, updatedAt: at });
    expect(subject.run("I owe someone a reply by Friday").feedback.phase).toBe("clarification");
    expect(subject.snapshot().document).toEqual(before);
    const result = subject.run(answer, "voice");
    expect(result.feedback.phase).toBe("completed"); expect(result.snapshot.document).toEqual(expected);
    expect(result.context.pendingIntent).toBeUndefined(); expect(result.snapshot.past).toHaveLength(1);
    expect(subject.run("Undo").snapshot.document).toEqual(before); expect(subject.run("Redo").snapshot.document).toEqual(expected);
  });
  it("cancels recipient authority without consuming existing undo or redo history", () => {
    const fixture = acceptanceFixture("commitment-reference");
    fixture.snapshot.past = [{ document: structuredClone(fixture.snapshot.document) }];
    fixture.snapshot.future = [{ document: structuredClone(fixture.snapshot.document) }];
    const before = structuredClone(fixture.snapshot), subject = evaluator(fixture.context, undefined, fixture.snapshot);
    expect(subject.run("I owe someone a reply").feedback.phase).toBe("clarification");
    expect(subject.run("Cancel").context.pendingIntent).toBeUndefined();
    expect(subject.snapshot()).toEqual(before);
    expect(subject.run("Maya").snapshot).toEqual(before); expect(subject.commitCount()).toBe(0);
  });
  it("does not inject diagnostic Undo/Redo into a shared dialogue subject", () => {
    const row = literalCreationRegressions[2]!;
    const dialogue = evaluator(row.context, row), direct = evaluator(row.context, row);
    direct.run(row.utterance);
    executeCase(row, dialogue);
    expect(dialogue.snapshot()).toEqual(direct.snapshot());
    expect(dialogue.context()).toEqual(direct.context());
    expect(dialogue.route()).toBe(direct.route());
  });
  it.each(literalCreationRegressions)("preserves literal creation $id through typed and final-voice transactions", (row) => {
    const typed = executeCase(row);
    const voice = executeCase(row, undefined, "voice");
    expect(voice.selectedSemanticIntent).toEqual(typed.selectedSemanticIntent);
    expect(voice.plannedSemanticActions).toEqual(typed.plannedSemanticActions);
  });
  it("confirms only the named anchored shift and restores its complete state with Undo and Redo", () => {
    const fixture = acceptanceFixture("calendar-reference");
    const before = structuredClone(fixture.snapshot.document);
    const subject = evaluator(fixture.context, undefined, fixture.snapshot);
    const pending = subject.run("Shift the interview by thirty minutes");
    expect(pending.feedback.phase).toBe("confirmation");
    expect(pending.feedback.title).toBe("Move anchored Interview?");
    expect(pending.pending?.actions).toMatchObject([{ type: "calendar.request", confirmed: "0:shift:E3", request: { actions: [{ type: "shift", selector: { type: "title", query: "interview" }, deltaMinutes: 30 }] } }]);
    expect(pending.snapshot.document).toEqual(before); expect(pending.snapshot.past).toHaveLength(0);
    const expected = expectedDocument(before, { historyDelta: 1, eventChanges: [{ id: "E3", patch: { start: 1050, end: 1110 } }] }, new Date(fixture.context.nowMs!).toISOString());
    const confirmed = subject.run("Confirm");
    expect(confirmed.snapshot.document).toEqual(expected); expect(confirmed.snapshot.past).toHaveLength(1);
    subject.run("Undo"); expect(subject.snapshot().document).toEqual(before);
    subject.run("Redo"); expect(subject.snapshot().document).toEqual(expected);
  });
  it("distinguishes a recognized Journal delete from a missing-entry execution clarification", () => {
    const fixture = acceptanceFixture("empty-home");
    executeCase({ id: "missing-entry-execution", utterance: "Delete the current journal entry", fixtureId: "empty-home", context: { ...fixture.context, route: "journal" }, source: "regression", expected: { intent: "journal-delete", resolution: "execute", route: "journal" }, semantic: { feedbackPhase: "clarification", historyDelta: 0, noCreation: true, actions: [], intent: { type: "journal-delete" } } });
  });
  it.each(["type", "voice"] as const)("resumes a near-time destructive clarification only through bound choice and confirmation: %s", (source) => {
    const fixture = acceptanceFixture("calendar-near");
    const before = structuredClone(fixture.snapshot);
    const subject = evaluator(fixture.context, undefined, fixture.snapshot);
    const question = subject.run("Delete the eleven o'clock meeting", source);
    expect(question.feedback.phase).toBe("clarification");
    expect(question.pending?.clarification).toMatchObject({ choices: [{ id: "E1", label: "Shareholders — Tuesday, Sep 8, 11:30 AM" }] });
    expect(subject.snapshot()).toEqual(before);
    subject.run("Cancel", source); expect(subject.snapshot()).toEqual(before);
    expect(subject.run("Confirm", source).pending).toBeUndefined(); expect(subject.snapshot()).toEqual(before);
    subject.run("Delete the eleven o'clock meeting", source);
    const preview = subject.run("The first one", source);
    expect(preview.feedback.phase).toBe("confirmation");
    expect(preview.pending?.actions).toMatchObject([{ type: "calendar.request", confirmed: "0:delete:E1", request: { actions: [{ type: "delete", selector: { type: "id", id: "E1" } }] } }]);
    expect(subject.snapshot()).toEqual(before);
    const after = structuredClone(before.document);
    after.calendar.events = []; after.calendars[after.calendar.dateKey]!.events = [];
    subject.run("Confirm", source); expect(subject.snapshot().document).toEqual(after); expect(subject.snapshot().past).toHaveLength(1);
    subject.run("Undo", source); expect(subject.snapshot().document).toEqual(before.document);
    subject.run("Redo", source); expect(subject.snapshot().document).toEqual(after);
  });
  it("keeps an initially flexible Lunch unchanged without adding persistent protection", () => {
    const row = pendingLateAssistedCases.find(({ id }) => id === "voice-rebuild-editorial-178")!;
    const fixture = acceptanceFixture("calendar-representative");
    const lunch = fixture.snapshot.document.calendar.events.find(({ id }) => id === "R-Lunch")!;
    Object.assign(lunch, { kind: "flexible", protected: false });
    fixture.snapshot.document.calendars[lunch.dateKey] = structuredClone(fixture.snapshot.document.calendar);
    executeCase(row, evaluator(row.context, undefined, fixture.snapshot));
  });
  it.each(["type", "voice"] as const)("completes an explicit Calendar creation only after its time answer via %s", (source) => {
    const row = languageInventory.curated.find(({ id }) => id === "curated-0543")!;
    const subject = evaluator(row.context, row);
    const before = structuredClone(subject.snapshot());
    executeCase(row, subject, source);
    expect(subject.snapshot()).toEqual(before);
    expect(subject.context().pendingIntent).toMatchObject({ type: "calendar-create", title: "Visa interview at the U.S. embassy", durationMinutes: 30 });
    subject.run("What now?", source);
    expect(subject.snapshot()).toEqual(before);
    const created: CalendarEvent = { id: "visa-interview-at-the-u-s-embassy", title: "Visa interview at the U.S. embassy", dateKey: "2026-09-06", start: 900, end: 930,
      kind: "flexible", priority: "medium", color: "neutral", labels: [], importance: "normal", mobility: "light", protected: false, status: "planned", bufferBeforeMinutes: 0, bufferAfterMinutes: 0 };
    executeCase({ ...row, id: `${row.id}-time-answer`, utterance: "Tomorrow at three pm", expected: { intent: "calendar", resolution: "execute", route: "home", domain: "calendar" },
      semantic: { historyDelta: 1, commitCount: 1, noPending: true, feedbackPhase: "completed", calendarInsertions: [created], calendarActionTypes: ["create"],
        actions: [{ type: "calendar.request", request: { actions: [{ type: "create", title: created.title, durationMinutes: 30, destination: { type: "absolute", date: "tomorrow", minutes: 900 } }], constraints: [] } }] } }, subject, source);
    expect(subject.context().pendingIntent).toBeUndefined();
    const after = structuredClone(subject.snapshot().document);
    subject.run("Undo", source); expect(subject.snapshot().document).toEqual(before.document);
    subject.run("Redo", source); expect(subject.snapshot().document).toEqual(after);
  });
  it.each(["Cancel", "Open journal"])("invalidates the pending Calendar creation with %s", (replacement) => {
    const row = languageInventory.curated.find(({ id }) => id === "curated-0543")!;
    const subject = evaluator(row.context, row);
    const before = structuredClone(subject.snapshot());
    subject.run(row.utterance); subject.run(replacement);
    expect(subject.context().pendingIntent).toBeUndefined();
    subject.run("Tomorrow at three pm");
    expect(subject.snapshot().document).toEqual(before.document);
    expect(subject.snapshot().past).toEqual(before.past);
    expect(subject.snapshot().future).toEqual(before.future);
  });
  const proposalEvidence: { id: string; status: "PASS" | "FAIL"; result?: ProductionCaseEvidence; failure?: string; failedTrace?: unknown; fixtureId?: string; provenance?: LanguageCase["provenance"] }[] = [];
  afterAll(() => {
    if (!proposalEvidence.length) return;
    const directory = "artifacts/voice-control-rebuild-20260908";
    mkdirSync(directory, { recursive: true });
    writeFileSync(`${directory}/pending-proposal-outcomes-${Date.now()}.json`, JSON.stringify({ admissionStatus: "PENDING_NOT_COUNTED_IN_RELEASE_QUOTA", cases: proposalEvidence }, null, 2), { flag: "wx" });
  });
  it.each([...proposedVoiceRebuildCases, ...pendingStaticSourceCases, ...pendingAssistedEditorialCases, ...pendingStaticDomainCases, ...pendingReviewedAssistedCases, ...pendingLateAssistedCases, ...pendingRichCalendarCases, ...pendingSupplementCases, ...pendingLateStudioCases])("reviews September 8 proposal $id through exact production semantics", (row) => {
    try { proposalEvidence.push({ id: row.id, status: "PASS", result: executeCase(row), fixtureId: row.fixtureId, provenance: row.provenance }); }
    catch (error) {
      proposalEvidence.push({ id: row.id, status: "FAIL", failure: error instanceof Error ? error.message : String(error), failedTrace: structuredClone(window.__FLOW_COMMAND_TRACE__), fixtureId: row.fixtureId, provenance: row.provenance });
      throw error;
    }
  });
  it.each(languageInventory.curated.filter((row) => row.provenance?.authoringMethod === "independent-legacy-review"))("validates independent legacy contract $id", (row) => {
    executeCase(row);
  });
  const directRows = [...languageInventory.curated, ...languageInventory.generated, ...languageInventory.negatives];
  const productionEvidence: ProductionCaseEvidence[] = [];
  const serializedProductionEvidence: string[] = [];
  const recordProductionEvidence = (rows: ProductionCaseEvidence | ProductionCaseEvidence[]) => {
    for (const row of Array.isArray(rows) ? rows : [rows]) {
      productionEvidence.push(row);
      // Serialize beside the partition that produced the row. The final
      // persistence test remains a cheap aggregate/write step even on a
      // contended clean-container host, while retaining every full trace.
      serializedProductionEvidence.push(JSON.stringify(row));
    }
  };
  it("executes semantic resolution, entity planning, atomic transactions, history, and no-mutation failures", () => {
    const subject = evaluator();
    const original = stable(subject.snapshot().document);

    const falseDelete = subject.run("remove the noisy thought");
    expect(["unsupported", "clarification"]).toContain(falseDelete.lastIntent);
    expect(falseDelete.commitCount).toBe(0);
    expect(stable(falseDelete.snapshot.document)).toBe(original);
    expect(falseDelete.snapshot.past).toHaveLength(0);

    const implicit = subject.run("I need to renew my passport before Senegal");
    expect(implicit.lastIntent).toBe("unsupported");
    expect(implicit.commitCount).toBe(0);
    expect(stable(implicit.snapshot.document)).toBe(original);
    expect(implicit.snapshot.past).toHaveLength(0);
    const outcome = subject.run("Create an outcome called Renew my passport before Senegal");
    expect(outcome.lastIntent).toBe("outcome-create");
    expect(outcome.commitCount).toBe(1);
    expect(outcome.snapshot.document.plans.some(({ title }) => /renew my passport/i.test(title))).toBe(true);
    expect(outcome.snapshot.past).toHaveLength(1);
    expect(subject.committedActionBatches[0]).toEqual(["plan.create", "plan.step.add", "plan.step.add", "plan.step.add"]);

    subject.run("open commitments");
    const incomplete = subject.run("add Miguel");
    expect(incomplete.lastIntent).toBe("clarification");
    expect(incomplete.commitCount).toBe(1);
    expect(incomplete.context.pendingIntent).toMatchObject({ type: "commitment-create", person: "Miguel" });

    const completed = subject.run("send the proposal Friday");
    expect(completed.lastIntent).toBe("commitment-create");
    expect(completed.commitCount).toBe(2);
    expect(completed.snapshot.document.people.some(({ name }) => name === "Miguel")).toBe(true);
    expect(completed.snapshot.document.commitments.some(({ title }) => /proposal/i.test(title))).toBe(true);
    expect(completed.snapshot.past).toHaveLength(2);
    expect(subject.committedActionBatches[1]).toEqual(["person.ensure", "commitment.create"]);

    const beforeMove = stable(subject.snapshot().document);
    const stableEventIds = subject.snapshot().document.calendar.events.map(({ id }) => id);
    const moved = subject.run("Move deep work to three");
    expect(moved.lastIntent).toBe("calendar");
    expect(moved.commitCount).toBe(3);
    expect(moved.snapshot.document.calendar.events.find(({ id }) => id === "deep-work")?.start).toBe(15 * 60);
    expect([...moved.snapshot.document.calendar.events.map(({ id }) => id)].sort()).toEqual([...stableEventIds].sort());
    expect(moved.snapshot.document.calendar.events.every((event, index, events) => index === 0 || events[index - 1]!.end <= event.start)).toBe(true);
    const afterMove = stable(moved.snapshot.document);

    const undone = subject.run("undo");
    expect(stable(undone.snapshot.document)).toBe(beforeMove);
    expect(undone.snapshot.future).toHaveLength(1);
    const redone = subject.run("redo");
    expect(stable(redone.snapshot.document)).toBe(afterMove);
    expect(redone.snapshot.future).toHaveLength(0);

    const beforeDelete = stable(subject.snapshot().document);
    const proposedDelete = subject.run("Cancel the dentist appointment");
    expect(proposedDelete.lastIntent).toBe("calendar");
    expect(proposedDelete.feedback.phase).toBe("confirmation");
    expect(proposedDelete.commitCount).toBe(3);
    expect(stable(proposedDelete.snapshot.document)).toBe(beforeDelete);
    const confirmedDelete = subject.run("confirm");
    expect(confirmedDelete.commitCount).toBe(4);
    expect(confirmedDelete.snapshot.document.calendar.events.some(({ id }) => id === "dentist")).toBe(false);

    const report = {
      generatedAt: new Date().toISOString(),
      evaluator: "resolveGlobalCommand → createLifeCommandRunner → applyLifeTransaction",
      probes: 9,
      commits: subject.commitCount(),
      noMutationOnUnsupported: stable(subject.snapshot().past[0]?.document) === original,
      atomicBatches: subject.committedActionBatches,
      historyEntries: subject.snapshot().past.length,
      exactUndoRedo: stable(redone.snapshot.document) === afterMove,
      destructiveConfirmation: proposedDelete.feedback.phase === "confirmation" && confirmedDelete.commitCount === 4,
      calendarStableIdsAcrossMove: stableEventIds.every((id) => redone.snapshot.document.calendar.events.some((event) => event.id === id)),
      resultingEntities: {
        plans: subject.snapshot().document.plans.length,
        people: subject.snapshot().document.people.length,
        commitments: subject.snapshot().document.commitments.length,
      },
    };
    mkdirSync("artifacts/voice-intelligence", { recursive: true });
    writeFileSync(evidencePath, `${JSON.stringify(report, null, 2)}\n`);
  });

  it.each([0, 1, 2, 3, 4, 5] as const)("runs direct production language partition %s through planning, transactions, and history", async (partition) => {
    localStorage.clear();
    const partitionSize = Math.ceil(directRows.length / 6);
    const start = partition * partitionSize;
    const failures: string[] = [];
    const rows = directRows.slice(start, start + partitionSize);
    for (let batchStart = 0; batchStart < rows.length; batchStart += 100) {
      for (const row of rows.slice(batchStart, batchStart + 100)) {
        try {
          recordProductionEvidence(executeCase(row));
        } catch (error) {
          failures.push(`${row.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    expect(failures, `production partition ${partition} failures`).toEqual([]);
  }, 120_000);

  it.each([0, 1] as const)("runs contextual dialogue partition %s through advancing production context", async (partition) => {
    const partitionSize = Math.ceil(languageInventory.dialogues.length / 2);
    const start = partition * partitionSize;
    const dialogues = languageInventory.dialogues.slice(start, start + partitionSize);
    for (let batchStart = 0; batchStart < dialogues.length; batchStart += 25) {
      recordProductionEvidence(dialogues.slice(batchStart, batchStart + 25).flatMap((dialogue) => {
        const subject = evaluator(dialogue.initialContext, undefined, dialogue.fixtureId === "calendar-next-day" ? calendarDialogueFixture() : undefined);
        return dialogue.turns.map((turn) => executeCase(turn, subject));
      }));
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }, 120_000);

  it("persists strict per-case production outcomes and derives the release accuracy report from them", () => {
    const evidence = productionEvidence;
    const totals = {
      mutations: 0, clarifications: 0, confirmations: 0, passed: 0,
      executeExpected: 0, executeCompleted: 0, plannerErrors: 0,
      unsafePlannerErrors: 0, atomicityViolations: 0, unresolvedMutations: 0,
      latencyTotalMs: 0, maxLatencyMs: 0,
    };
    for (const row of evidence) {
      if (row.stateChanged) totals.mutations += 1;
      if (row.feedback === "clarification") totals.clarifications += 1;
      if (row.feedback === "confirmation") totals.confirmations += 1;
      if (row.expectedResolution === "execute") {
        totals.executeExpected += 1;
        if (["completed", "confirmation"].includes(row.feedback)) totals.executeCompleted += 1;
        if (row.feedback === "error") totals.plannerErrors += 1;
      }
      if (row.feedback === "error" && (row.stateChanged || row.historyDelta !== 0)) totals.unsafePlannerErrors += 1;
      if (row.historyDelta > 1) totals.atomicityViolations += 1;
      if (["unsupported", "clarification"].includes(row.selectedIntent) && row.stateChanged) totals.unresolvedMutations += 1;
      totals.latencyTotalMs += row.latencyMs;
      totals.maxLatencyMs = Math.max(totals.maxLatencyMs, row.latencyMs);
      const didPass = row.expectedResolution === "execute"
        ? ["completed", "confirmation"].includes(row.feedback) && (!row.expectedIntent || row.selectedIntent === row.expectedIntent)
        : row.expectedResolution === "clarify"
          ? row.feedback === "clarification" && !row.stateChanged && row.historyDelta === 0
          : row.selectedIntent === "unsupported" && !row.stateChanged && row.historyDelta === 0;
      if (didPass) totals.passed += 1;
    }
    const report = {
      generatedAt: new Date().toISOString(),
      evaluator: "resolveGlobalCommand → createLifeCommandRunner → domain planner/entity resolution → applyLifeTransaction → invariant validation → atomic history",
      cases: evidence.length,
      directCases: directRows.length,
      dialogueTurns: languageInventory.dialogues.reduce((total, dialogue) => total + dialogue.turns.length, 0),
      stateMutations: totals.mutations,
      clarifications: totals.clarifications,
      confirmations: totals.confirmations,
      passed: totals.passed,
      failed: evidence.length - totals.passed,
      accuracy: Number((totals.passed / evidence.length).toFixed(6)),
      executeExpected: totals.executeExpected,
      executeCompleted: totals.executeCompleted,
      plannerErrors: totals.plannerErrors,
      unsafePlannerErrors: totals.unsafePlannerErrors,
      atomicityViolations: totals.atomicityViolations,
      unresolvedMutations: totals.unresolvedMutations,
      maxLatencyMs: totals.maxLatencyMs,
      averageLatencyMs: Number((totals.latencyTotalMs / evidence.length).toFixed(3)),
      physicalMicrophone: "NOT_PERFORMED — synthetic typed/final-transcript evaluation only",
      perCaseEvidence: "production-case-results.jsonl",
    };
    mkdirSync("artifacts/voice-intelligence", { recursive: true });
    writeFileSync("artifacts/voice-intelligence/production-case-results.jsonl", `${serializedProductionEvidence.join("\n")}\n`);
    writeFileSync(evidencePath, `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync("artifacts/voice-intelligence/accuracy-report.json", `${JSON.stringify({
      generatedAt: report.generatedAt,
      evaluator: report.evaluator,
      totalEvaluated: report.cases,
      passed: report.passed,
      failed: report.failed,
      accuracy: report.accuracy,
      executeExpected: report.executeExpected,
      executeCompleted: report.executeCompleted,
      note: "This release accuracy is derived from production planner/transaction outcomes. Resolver-only diagnostics are stored separately in resolver-accuracy-report.json.",
      physicalMicrophone: report.physicalMicrophone,
    }, null, 2)}\n`);
    expect(evidence).toHaveLength(33_700);
    expect(report.failed).toBe(0);
    expect(report.executeCompleted).toBe(report.executeExpected);
    expect(report.atomicityViolations).toBe(0);
    expect(report.unresolvedMutations).toBe(0);
    expect(report.unsafePlannerErrors).toBe(0);
    // The report and JSONL are now durable. Release the 33,500 full candidate
    // traces before Vitest reuses this worker for resolver and React suites.
    productionEvidence.length = 0;
    serializedProductionEvidence.length = 0;
  });
});
