import type { Dispatch, SetStateAction } from "react";
import type { LifeAction } from "../domain/life-actions";
import { createLifeLink, initialPlanSteps, uniqueLifeId } from "../domain/life-factories";
import { selectNowCandidates, selectNowWindow, type NowQuery, type NowRecommendation } from "../domain/life-selectors";
import type { Capture, Commitment, LifeContext, LifeDocument, LifeRoute, LifeSnapshot, LifeTransactionRecord, PeopleView, Person, Plan, PlanStep, TemporalScope } from "../domain/life-model";
import { freshReference, referenceFor } from "./conversationContext";
import type { CalendarEvent, CalendarRequest, TransactionSource } from "../features/day-planner/model";
import { interpretTranscript } from "../features/day-planner/parser";
import { dateKeyAfter } from "../features/day-planner/interpretation/temporal";
import { uniqueId as uniqueCalendarId } from "../features/day-planner/scheduling/schedulePlacement";
import { firstAvailable } from "../features/day-planner/scheduling/slots";
import { resolveEventReference } from "../features/day-planner/scheduling/resolution";
import { DAY_END, DAY_START, formatTime } from "../features/day-planner/time";
import { resolveGlobalCommand, type GlobalIntent, type GlobalIntentResolution } from "../shared/command/globalInterpreter";
import type { ActiveLifeTransition, CommandFeedback, PendingLifeChange } from "./environment-types";
import { buildEliteHomeModel, focusWindowBefore } from "../features/elite/eliteViewModel";
import { planStudioCommand } from "../features/studio/studioCommandPlan";
import type { StudioIntent } from "../features/studio/interpretation/studioInterpreter";
import { beginCommandTrace, completeCommandTrace, recordCommandQuery } from "./commandTrace";
import { executeViewportScroll } from "../shared/command/viewportCapability";
import { prefersReducedRewardMotion, readRewardPreferences } from "../core/rewards/reward-preferences";
import { calendarReferenceScope, calendarRequestSourceDate } from "./calendarCommandScope";
import { requestStudioPlayback } from "../features/studio/studioPlayback";
import { contextualCaptureContent } from "../features/inbox/contextualCapture";
import { visibleCommitments, type CommitmentViewState } from "../features/people/commitmentView";
import { planEntityView } from "../features/entity-navigation/planEntityView";
import type { EntityEditor } from "../features/entity-navigation/entityView";
import type { PresentationIntent } from "../shared/command/presentationCapability";
import { namedEntities } from "../domain/namedEntities";
import { runFriendCommand } from "../features/friends/friendController";
import { bindCalendarParticipants } from "../features/friends/calendarParticipants";
import type { FriendIntent } from "../features/friends/friendIntents";
import type { MarkerIntent } from "../features/studio/markerIntents";

type TransitionIntent = Omit<ActiveLifeTransition, "beat"> & { route: LifeRoute; planId?: string; peopleView?: PeopleView };

export interface ControllerOptions {
  getSnapshot: () => LifeSnapshot;
  getContext: () => LifeContext;
  updateContext: (patch: Partial<LifeContext>) => void;
  route: LifeRoute;
  focusedEntityId?: string;
  activePlanId?: string;
  selectedCalendarEventId?: string;
  getPending: () => PendingLifeChange | undefined;
  now: () => Date;
  navigate: (route: LifeRoute, planId?: string, replace?: boolean, peopleView?: PeopleView) => void;
  setTemporalScope: (scope: TemporalScope, transcript?: string) => void;
  recordInstinctExposure: (instinctIds: string[]) => void;
  commit: (actions: LifeAction[], transcript: string, source: TransactionSource, summary?: string, transition?: TransitionIntent) => boolean;
  undo: (transcript?: string) => void;
  redo: (transcript?: string) => void;
  confirm: () => void;
  cancel: () => void;
  setFocusedEntityId: Dispatch<SetStateAction<string | undefined>>;
  setSelectedCalendarEventId: Dispatch<SetStateAction<string | undefined>>;
  setActivePlanId: Dispatch<SetStateAction<string | undefined>>;
  setFeedback: Dispatch<SetStateAction<CommandFeedback>>;
  setLastTranscript: Dispatch<SetStateAction<string>>;
  setPending: Dispatch<SetStateAction<PendingLifeChange | undefined>>;
  setNowQuery: Dispatch<SetStateAction<NowQuery | null | undefined>>;
  setNowExplanationOpen: Dispatch<SetStateAction<boolean>>;
  showCalendarChange: (change: LifeTransactionRecord) => void;
  choosePending: (choiceId: string, transcript?: string) => void;
  setIntentType: (intent: GlobalIntent["type"], resolved?: GlobalIntent) => void;
  acknowledgeVoiceIntent: (intent: GlobalIntent["type"]) => void;
  presentResolvedIntent?: (resolution: GlobalIntentResolution, document: LifeDocument, context: LifeContext, transcript: string, source: TransactionSource, commandId: string) => void;
  isCurrentCommand?: () => boolean;
  prepareVoiceNote?: (noteId: string, transcript: string, source: TransactionSource, operation?: "review" | "delete-tail-review") => void;
  prepareMarkerShare?: (intent: MarkerIntent, transcript: string, source: TransactionSource) => void;
  prepareMemoryShare?: (intent: Extract<FriendIntent, { type: "friend-memory" }>, transcript: string, source: TransactionSource) => void;
  updateCommitmentView?: (patch: Partial<CommitmentViewState>) => CommitmentViewState;
  setEntityEditor?: (editor: Omit<EntityEditor, "session"> | undefined) => void;
  getNowCandidates?: () => NowRecommendation[];
  presentCommandSurface?: (intent: PresentationIntent, fromGesture: boolean) => { status: "completed" | "clarification"; title: string; detail: string };
}

export interface PreparedCommandResolution {
  parentCommandId?: string;
  resolution: GlobalIntentResolution;
  presented: boolean;
  fromGesture?: boolean;
}

function focusedCaptures(document: LifeDocument, focusedEntityId?: string, query?: string) {
  const unresolved = document.captures.filter(({ status }) => status === "unresolved");
  if (query?.toLowerCase() === "latest") return [...unresolved].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 1);
  if (query) return unresolved.filter(({ title }) => title.toLowerCase().includes(query.toLowerCase()));
  const focused = unresolved.find(({ id }) => id === focusedEntityId);
  return focused ? [focused] : [];
}

function matchingSteps(document: LifeDocument, activePlanId?: string, focusedEntityId?: string, query?: string) {
  const pool = document.steps.filter((step) => !activePlanId || step.planId === activePlanId);
  const contextual = !query || /^(?:this|selected|current)(?: step)?$/i.test(query);
  const focused = contextual ? pool.find(({ id }) => id === focusedEntityId) : undefined;
  return focused ? [focused] : pool.filter((step) => !query || contextual || step.title.toLowerCase().includes(query.toLowerCase()));
}

function matchingCommitments(document: LifeDocument, reference: { query?: string; person?: string }) {
  const people = reference.person ? namedEntities(document.people.map((person) => ({ ...person, title: person.name })), reference.person) : undefined;
  const pool = document.commitments.filter((item) => !people || people.some(({ id }) => id === item.personId));
  return reference.query ? namedEntities(pool, reference.query) : pool;
}

function displayTitle(value: string) {
  return value.replace(/^./, (letter) => letter.toUpperCase());
}

const studioIntentTypes = new Set<GlobalIntent["type"]>([
  "ritual-configure",
  "journal-playback", "journal-attach-photo", "journal-drawing-input", "journal-download-audio", "memory-export", "atmosphere-enable-sound",
  "studio-select", "studio-source-select",
  "journal-delete", "journal-text-edit", "journal-tags", "journal-clear-drawing",
  "studio-compound", "journal-create", "journal-recording", "journal-append", "journal-bookmark", "journal-save", "journal-rename",
  "atmosphere-play", "atmosphere-playback", "atmosphere-adjust", "atmosphere-set", "atmosphere-save",
  "memory-create", "memory-update", "memory-edit", "memory-composition", "memory-playback", "memory-save", "workspace", "ritual-home",
  "memory-source", "memory-audio-trim",
]);

export function createLifeCommandRunner(options: ControllerOptions) {
  const clarify = (title: string, detail: string, transcript: string) => {
    completeCommandTrace([], [], detail);
    options.setFeedback({ phase: "clarification", title, detail, transcript });
  };

  return function runCommand(transcript: string, source: TransactionSource = "type", commandId = `${source}-${Date.now()}-${Math.random().toString(36).slice(2)}`, prepared?: PreparedCommandResolution) {
    const text = transcript.trim();
    if (!text) return;
    options.setLastTranscript(text);
    options.setFeedback({ phase: "understanding", title: "Understanding", detail: text, transcript: text });
    const snapshot = options.getSnapshot();
    const document = snapshot.document;
    const storedContext = options.getContext();
    const context: LifeContext = {
      ...storedContext,
      weekStartsOn: document.preferences.weekStartsOn,
      route: options.route,
      focusedEntityId: options.focusedEntityId,
      activePlanId: options.activePlanId,
      pending: storedContext.pending,
      nowMs: options.now().getTime(),
    };
    const resolution = prepared?.resolution ?? resolveGlobalCommand(text, context, snapshot.temporal?.todayDateKey ?? document.calendar.dateKey, document.steps, document.preferences.workdayEndMinutes, calendarReferenceScope(document, snapshot.temporal?.scope), document.people, document.friends?.groups);
    const intent = resolution.intent;
    // A final independent intention retires the old authority, including when
    // its own interpretation fails. Interims never enter this boundary.
    if (!["confirm", "cancel", "pending-choice", "capture-answer", "friend-draft", "friend-marker-answer", "focus-refine", "session", "what-changed", "help", "command-surface", "sensory-preference", "voice-retry"].includes(intent.type)) {
      options.setPending(undefined);
      options.updateContext({ pending: undefined, pendingChoices: undefined, friendPending: undefined, friendPrompt: undefined });
    }
    if (!prepared?.presented) options.presentResolvedIntent?.(resolution, document, context, text, source, commandId);
    if (!prepared?.presented) beginCommandTrace(text, intent, context, resolution.candidates, resolution.segment, commandId, prepared?.parentCommandId);
    const commitActions: ControllerOptions["commit"] = (actions, commandTranscript, commandSource, summary, transition) => {
      completeCommandTrace(actions);
      return options.commit(actions, commandTranscript, commandSource, summary, transition);
    };
    options.setIntentType(intent.type, intent);
    options.updateContext({
      lastIntent: intent.type,
      recentRoutes: [...(context.recentRoutes ?? []), context.route].slice(-8),
    });
    if ([
      "focus-availability", "outfit-query", "weather-query", "umbrella-query", "daylight-query", "next-query",
      "people-query", "what-changed", "session", "capture-mode", "help", "query-now", "why-now", "keep-free",
    ].includes(intent.type)) options.acknowledgeVoiceIntent(intent.type);
    const contextualCaptureId = freshReference(context, ["capture"])?.id;
    const contextualPlanId = freshReference(context, ["plan"])?.id;
    const contextualStepId = freshReference(context, ["plan-step"])?.id;

    if (intent.type === "friend-playback" || intent.type === "friend-plan" || intent.type === "friend-query" || intent.type === "friend-memory" || intent.type === "friend-group" || intent.type === "friend-open" || intent.type === "friend-person" || intent.type === "friend-message" || intent.type === "friend-reply" || intent.type === "friend-draft" || intent.type === "friend-calendar" || intent.type === "friend-voice" || intent.type === "recording-marker" || intent.type === "friend-marker-answer" || intent.type === "friend-plans") return runFriendCommand(intent, options, text, source, commandId, (request) => { runCommand(text, source, commandId, { resolution: { intent: { type: "calendar", request }, candidates: [] }, presented: false }); });

    if (intent.type === "command-surface" || intent.type === "sensory-preference" || intent.type === "voice-retry") {
      if (!options.presentCommandSurface) return clarify("That surface is unavailable", "No data changed.", text);
      const outcome = options.presentCommandSurface(intent, prepared?.fromGesture === true);
      completeCommandTrace([], [], outcome.status === "clarification" ? outcome.detail : undefined);
      return options.setFeedback({ phase: outcome.status, title: outcome.title, detail: outcome.detail, transcript: text });
    }

    if (intent.type === "editor-close") {
      if (!options.setEntityEditor) return clarify("No editor is available", "No data changed.", text);
      options.setEntityEditor(undefined); completeCommandTrace([], [], "Closed the editor without saving its draft.");
      return options.setFeedback({ phase: "completed", title: "Editing cancelled", detail: "The saved item is unchanged.", transcript: text });
    }
    if (intent.type === "entity-view") {
      const planned = planEntityView(intent, document, context, options.getNowCandidates?.() ?? selectNowCandidates(document, options.now()));
      if (planned.status === "clarification") return clarify(planned.title, planned.detail, text);
      if (planned.editor && !options.setEntityEditor) return clarify("The editor is unavailable", "No data changed.", text);
      if (planned.calendarEvent) options.setTemporalScope({ kind: "day", dateKey: planned.calendarEvent.dateKey });
      if (planned.route) options.navigate(planned.route, planned.planId, false, planned.route === "people" ? "commitments" : undefined);
      options.setFocusedEntityId(planned.id);
      if (planned.calendarEvent) options.setSelectedCalendarEventId(planned.calendarEvent.id);
      const reference = referenceFor(document, planned.id, context.nowMs!);
      options.updateContext({ focusedEntityId: planned.id, selected: reference, lastReferenced: reference,
        ...(planned.planId ? { activePlanId: planned.planId } : {}) });
      if (planned.editor) options.setEntityEditor?.(planned.editor);
      completeCommandTrace([], [planned.id, ...(planned.calendarEvent ? [planned.calendarEvent.id] : [])], "Only the view changed.");
      return options.setFeedback({ phase: "completed", title: `${planned.editor ? "Editing" : "Selected"} ${planned.title}`, detail: "No data changed.", transcript: text });
    }

    if (intent.type === "commitment-view") {
      if (!options.updateCommitmentView) return clarify("The commitment view is unavailable", "No data changed.", text);
      const view = options.updateCommitmentView(intent.patch);
      const visible = visibleCommitments(document, view);
      if (context.route !== "people" || context.peopleView !== "commitments") options.navigate("people", undefined, false, "commitments");
      completeCommandTrace([], visible.map(({ id }) => id), "Updated the view only; no commitments changed.");
      return options.setFeedback({ phase: "completed", title: `Showing ${visible.length} commitment${visible.length === 1 ? "" : "s"}`, detail: "The filter and search changed, not your commitments.", transcript: text });
    }

    if (intent.type === "scroll") {
      executeViewportScroll(intent, prefersReducedRewardMotion(readRewardPreferences()));
      if (intent.direction === "up" || intent.direction === "down") options.updateContext({ lastViewportAction: { direction: intent.direction, fraction: intent.fraction, route: context.route, at: context.nowMs! } });
      return options.setFeedback({ phase: "completed", title: `Scrolled ${intent.direction}`, detail: "No data changed.", transcript: text });
    }

    if (intent.type === "clarification") {
      if (intent.captureQuestion) { contextualCaptureContent(options, undefined, text, source); return; }
      if (intent.continuation) options.updateContext({ pendingIntent: { ...intent.continuation, expiresAt: context.nowMs! + 120_000 } });
      if (intent.calendarChoice) options.setPending({ actions: [], transcript: text, source, summary: intent.title, calendarRequest: intent.calendarChoice.request, clarification: intent.calendarChoice.clarification });
      completeCommandTrace([], [], intent.detail);
      return clarify(intent.title, intent.detail, text);
    }
    if (intent.type === "journal-playback" && intent.mode !== "configure" && intent.contextualTransport) {
      const entry = document.studio.journalEntries.find(({ id }) => id === context.activeJournalEntryId);
      if (entry && ["recording", "paused"].includes(entry.recordingState)) {
        const media = { entryId: entry.id, mode: intent.mode === "play" ? "resume" as const : intent.mode === "pause" ? "pause" as const : "stop" as const, expiresAt: options.now().getTime() + 120_000 };
        options.setPending({ actions: [], baseRevision: snapshot.revision, transcript: text, source, summary: "Choose which audio operation to control", media }); options.updateContext({ pendingMedia: media, pending: "clarification", pendingChoices: [{ id: "playback", label: "Audio playback" }, { id: "recording", label: "Microphone recording" }] });
        return clarify("Audio playback or microphone recording?", "Both have an active context. Say which one should change; neither has changed.", text);
      }
    }
    if (studioIntentTypes.has(intent.type)) {
      const planned = planStudioCommand(intent as StudioIntent, document, context, options.now(), source === "voice" ? "voice" : "typed");
      if (planned.status === "native-continuation") {
        options.setPending({ actions: [], transcript: text, source, summary: planned.title, nativeContinuation: planned.continuation });
        if (planned.focusId) options.setFocusedEntityId(planned.focusId);
        if ("entryId" in planned.continuation) options.updateContext({ activeJournalEntryId: planned.continuation.entryId });
        if (planned.continuation.actionId === "memory.export") options.updateContext({ activeMemoryId: planned.continuation.memoryId });
        options.navigate(planned.navigateTo);
        completeCommandTrace([], planned.focusId ? [planned.focusId] : [], "Awaiting native continuation; no document mutation.");
        return options.setFeedback({ phase: "confirmation", title: planned.title, detail: planned.detail, transcript: text });
      }
      if (planned.status === "clarification") {
        completeCommandTrace([], [], planned.detail);
        return clarify(planned.title, planned.detail, text);
      }
      if (planned.status === "feedback") {
        completeCommandTrace([], [], planned.detail);
        return options.setFeedback({ phase: "completed", title: planned.title, detail: planned.detail, transcript: text });
      }
      if (planned.status === "confirmation") {
        completeCommandTrace(planned.actions);
        options.setPending({ actions: planned.actions, transcript: text, source, summary: planned.title, runtimeCommands: planned.runtimeCommands });
        return options.setFeedback({ phase: "confirmation", title: planned.title, detail: planned.detail, transcript: text });
      }
      const committed = planned.actions.length ? commitActions(planned.actions, text, source, planned.summary) : true;
      if (!committed) return;
      completeCommandTrace(planned.actions, planned.focusId ? [planned.focusId] : []);
      if (planned.contextPatch) options.updateContext(planned.contextPatch);
      if (planned.focusId) options.setFocusedEntityId(planned.focusId);
      if (planned.navigateTo) options.navigate(planned.navigateTo);
      for (const runtime of planned.runtimeCommands) {
        if (runtime.target === "journal") {
          const current = options.getSnapshot();
          const origin = intent.type === "journal-create" && current.lastTransaction
            ? { transactionId: current.lastTransaction.id, revision: current.revision } : undefined;
          window.dispatchEvent(new CustomEvent("flow-journal-runtime", { detail: { ...runtime, ...(origin ? { origin } : {}) } }));
        }
        else void requestStudioPlayback(runtime, options.isCurrentCommand).catch((error: unknown) => {
          if (options.isCurrentCommand?.() === false) return;
          options.setFeedback({ phase: "error", title: "Playback could not start", detail: error instanceof Error ? error.message : "Use the original audio control and try again.", transcript: text });
        });
      }
      if (!planned.actions.length) options.setFeedback({ phase: "completed", title: planned.summary, detail: "The current studio session stays in place.", transcript: text });
      return;
    }
    if (intent.type === "temporal") {
      options.setTemporalScope(intent.scope, text);
      return;
    }
    if (intent.type === "navigate-temporal") {
      options.navigate(intent.route);
      options.setTemporalScope(intent.scope, text);
      return;
    }
    if (intent.type === "global-sequence") {
      for (const step of intent.steps) {
        if (step.type === "temporal") options.setTemporalScope(step.scope, text);
        else if (step.type === "navigate-temporal") {
          options.navigate(step.route);
          options.setTemporalScope(step.scope, text);
        } else if (step.route === "back") window.history.back();
        else if (step.target) options.navigate(step.target.world, undefined, false, step.target.world === "people" ? step.target.view ?? "default" : undefined);
        else options.navigate(step.route);
      }
      return;
    }
    const temporal = snapshot.temporal ?? { todayDateKey: document.calendar.dateKey, scope: { kind: "day" as const, dateKey: document.calendar.dateKey } };
    const scopeFor = (dateKey?: string) => dateKey ? { kind: "day" as const, dateKey } : temporal.scope;
    const modelFor = (dateKey?: string) => buildEliteHomeModel(document, scopeFor(dateKey), options.now());
    if (intent.type === "focus-refine") {
      const pending = options.getPending();
      const focusActionIndex = pending?.actions.findIndex(({ type }) => type === "focus.start") ?? -1;
      const focusAction = focusActionIndex >= 0 ? pending?.actions[focusActionIndex] : undefined;
      if (!pending || focusAction?.type !== "focus.start") {
        return clarify("Which pending focus proposal do you mean?", "Ask for focus time first. Nothing changed.", text);
      }
      if (intent.minutes < 5) {
        return options.setFeedback({ phase: "error", title: "Focus needs at least 5 minutes", detail: "The pending proposal is unchanged.", transcript: text });
      }
      const originalLimit = focusAction.session.durationMinutes;
      const durationMinutes = Math.min(intent.minutes, originalLimit);
      const revisedActions = pending.actions.map((action, index) => index === focusActionIndex && action.type === "focus.start"
        ? { ...action, session: { ...action.session, durationMinutes } }
        : action);
      const summary = `Start ${durationMinutes} minutes of focus?`;
      options.setPending({ ...pending, actions: revisedActions, transcript: text, source, summary, confirmLabel: `Start ${durationMinutes} min` });
      return options.setFeedback({
        phase: "confirmation",
        title: `${durationMinutes} minutes ready`,
        detail: intent.minutes > originalLimit
          ? `The safe window currently holds ${originalLimit} minutes. Say “Do it” to start ${durationMinutes}. Nothing changed yet.`
          : `Say “Do it” to start exactly ${durationMinutes}. Nothing changed yet.`,
        transcript: text,
      });
    }
    if (intent.type === "focus-availability") {
      const model = modelFor();
      const window = model.focusWindow, sourceEvent = model.events.find(({ start, end, kind }) => kind === "flexible" && start <= window.start && end >= window.end);
      const anchor = model.events.find(({ start, kind, protected: held }) => start >= window.end && (kind === "fixed" || kind === "protected" || held));
      recordCommandQuery({ minutes: window.minutes, start: window.start, end: window.end, ...(sourceEvent ? { sourceEventId: sourceEvent.id } : {}), ...(anchor ? { nextFixedAnchorId: anchor.id, nextFixedAnchorStart: anchor.start } : {}) });
      return options.setFeedback({ phase: "completed", title: `${window.minutes} minutes ${window.sourceTitle ? "available" : "clear"}`, detail: window.sourceTitle ? `In ${window.sourceTitle}, until ${formatTime(window.end)}.` : `Before ${window.anchorTitle ?? formatTime(window.end)}.`, transcript: text });
    }
    if (intent.type === "focus-request") {
      if (document.focus.active) return options.setFeedback({ phase: "error", title: "Focus is already running", detail: "Stop the current session before starting another.", transcript: text });
      if (temporal.scope.kind === "week") return clarify("Which day should I use?", `Choose a day between ${temporal.scope.dateKey} and ${temporal.scope.endDateKey ?? temporal.scope.dateKey}. Nothing changed.`, text);
      const model = modelFor();
      const anchored = intent.beforeQuery
        ? focusWindowBefore(model.calendar, intent.beforeQuery, options.now().getHours() * 60 + options.now().getMinutes())
        : undefined;
      if (anchored && anchored.matches.length !== 1) return clarify(`Which ${intent.beforeQuery} should anchor focus?`, anchored.matches.slice(0, 3).map(({ title }) => title).join(" · ") || "Name one event in this time scope.", text);
      const focusWindow = anchored?.window ?? model.focusWindow;
      const requested = intent.minutes ?? 25;
      const available = Math.min(focusWindow.minutes, requested);
      if (available < 5) return options.setFeedback({ phase: "error", title: "No safe focus window remains", detail: `The next anchor is ${focusWindow.anchorTitle ?? formatTime(focusWindow.end)}. Nothing changed.`, transcript: text });
      const subject = intent.subjectQuery
        ? [...document.plans, ...document.steps, ...document.captures].filter(({ title }) => title.toLowerCase().includes(intent.subjectQuery!.toLowerCase()))
        : [];
      if (intent.subjectQuery && subject.length !== 1) return clarify(`What should “${intent.subjectQuery}” refer to?`, subject.slice(0, 3).map(({ title }) => title).join(" · ") || "Name one outcome, step, or capture.", text);
      const at = options.now().toISOString();
      const session = {
        id: uniqueLifeId(document, "focus", `${model.scope.dateKey}-${at}`),
        dateKey: model.scope.dateKey,
        startMinutes: focusWindow.start,
        durationMinutes: available,
        status: "active" as const,
        ...(subject[0] ? { subjectId: subject[0].id } : {}),
        startedAt: at,
      };
      if (requested > available) {
        const actions: LifeAction[] = [{ type: "focus.start", session }];
        options.setPending({ actions, transcript: text, source, summary: `Start ${available} minutes of focus?`, confirmLabel: `Start ${available} min` });
        return options.setFeedback({ phase: "confirmation", title: `You asked for ${requested} minutes. You have ${available} ${focusWindow.sourceTitle ? "available" : "clear"}.`, detail: `${focusWindow.sourceTitle ? `In ${focusWindow.sourceTitle}, until ${formatTime(focusWindow.end)}` : `Before ${focusWindow.anchorTitle ?? formatTime(focusWindow.end)}`}. Say “Do it” to start exactly ${available}.`, transcript: text });
      }
      commitActions([{ type: "focus.start", session }], text, source, `Started ${available} minutes of focus.`);
      return;
    }
    if (intent.type === "focus-stop") {
      if (!document.focus.active) return options.setFeedback({ phase: "completed", title: "There isn’t a focus session running", detail: "Nothing changed.", transcript: text });
      commitActions([{ type: "focus.stop", completedAt: options.now().toISOString() }], text, source, "Focus session completed.");
      return;
    }
    if (intent.type === "focus-extend") {
      if (!document.focus.active) return options.setFeedback({ phase: "completed", title: "There isn’t a focus session running", detail: "Nothing changed.", transcript: text });
      commitActions([{ type: "focus.extend", minutes: intent.minutes }], text, source, `Added ${intent.minutes} minutes to Focus.`);
      return;
    }
    if (["outfit-query", "weather-query", "umbrella-query", "daylight-query"].includes(intent.type)) {
      const dateKey = "dateKey" in intent ? intent.dateKey : undefined;
      if (dateKey && dateKey !== temporal.scope.dateKey) options.setTemporalScope({ kind: "day", dateKey }, text);
      const model = modelFor(dateKey);
      recordCommandQuery({ weather: model.weather ?? null, temperatureC: model.weather?.temperatureC ?? null, sunset: model.weather?.sunset ?? null, umbrella: model.outfit.umbrella });
      if (intent.type === "outfit-query") return options.setFeedback({ phase: "completed", title: model.outfit.headline, detail: model.outfit.detail, transcript: text });
      if (intent.type === "umbrella-query") {
        const umbrella = model.outfit.umbrella;
        return options.setFeedback({ phase: "completed", title: umbrella === "yes" ? "Take an umbrella" : umbrella === "no" ? "No umbrella needed" : "Rain detail is unavailable", detail: umbrella === "unknown" ? "I won’t guess without precipitation data." : model.outfit.detail, transcript: text });
      }
      if (intent.type === "daylight-query") return options.setFeedback({ phase: "completed", title: model.weather?.sunset ? `Sunset is ${new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(model.weather.sunset))}` : "Daylight data is unavailable", detail: model.weather?.sunset ? "Outdoor time before then still has daylight." : "Calendar and Focus still work.", transcript: text });
      const temperature = model.weather?.temperatureC ?? model.weather?.apparentTemperatureC ?? model.weather?.maximumC;
      return options.setFeedback({ phase: "completed", title: temperature !== undefined ? `${Math.round(temperature)}°C · ${model.outfit.headline}` : model.outfit.headline, detail: model.outfit.detail, transcript: text });
    }
    if (intent.type === "next-query") {
      const model = modelFor();
      const nowMinutes = options.now().getHours() * 60 + options.now().getMinutes();
      const next = model.events.find((event) => event.start > nowMinutes
        && (intent.queryKind === "meeting" ? event.kind === "fixed" : intent.queryKind === "anchor" ? event.kind === "fixed" || event.kind === "protected" || event.protected : true));
      recordCommandQuery(next ? { eventId: next.id, title: next.title, start: next.start, end: next.end, dateKey: next.dateKey } : {});
      return options.setFeedback({ phase: "completed", title: next?.title ?? "Nothing else is scheduled", detail: next ? `${formatTime(next.start)} – ${formatTime(next.end)}.` : "The rest of this scope is open.", transcript: text });
    }
    if (intent.type === "calendar-inspect") {
      const current = options.now();
      const resolution = resolveEventReference(
        calendarReferenceScope(document, temporal.scope),
        intent.selector,
        options.selectedCalendarEventId,
        current.getHours() * 60 + current.getMinutes(),
      );
      if (resolution.status === "missing") {
        return options.setFeedback({ phase: "error", title: "I couldn't find that Today event", detail: `${resolution.detail} Nothing changed.`, transcript: text });
      }
      if (resolution.status === "clarification") {
        return clarify(resolution.question, resolution.choices.map(({ label }) => label).join(" · "), text);
      }
      const event = resolution.events[0]!;
      if (temporal.scope.kind === "week") options.setTemporalScope({ kind: "day", dateKey: event.dateKey }, text);
      const reference = { id: event.id, kind: "calendar-event" as const, at: current.getTime() };
      options.setSelectedCalendarEventId(event.id);
      options.setFocusedEntityId(event.id);
      options.updateContext({ focusedEntityId: event.id, selected: reference, lastReferenced: reference, topic: "calendar" });
      options.navigate("calendar");
      return options.setFeedback({ phase: "completed", title: event.title, detail: `${formatTime(event.start)} – ${formatTime(event.end)}. Selected for your next command.`, transcript: text });
    }
    if (intent.type === "person-query") {
      const matches = document.people.filter(({ name }) => name.toLowerCase().includes(intent.query.toLowerCase()));
      if (matches.length !== 1) return clarify(matches.length ? `Which ${intent.query} do you mean?` : `I can’t find ${intent.query}.`, matches.slice(0, 3).map(({ name }) => name).join(" · ") || "Nothing changed.", text);
      if (intent.dateKey && intent.dateKey !== temporal.scope.dateKey) options.setTemporalScope({ kind: "day", dateKey: intent.dateKey }, text);
      const reference = { id: matches[0]!.id, kind: "person" as const, at: options.now().getTime() };
      options.setFocusedEntityId(matches[0]!.id);
      options.updateContext({ focusedPersonId: matches[0]!.id, focusedEntityId: matches[0]!.id, selected: reference, lastReferenced: reference, topic: "person" });
      options.navigate("people");
      const promises = document.commitments.filter(({ personId, status }) => personId === matches[0]!.id && status !== "completed");
      completeCommandTrace([], [matches[0]!.id, ...promises.map(({ id }) => id)]);
      return options.setFeedback({ phase: "completed", title: matches[0]!.name, detail: promises.length ? promises.map(({ title }) => title).join(" · ") : intent.prepare ? "No local preparation notes yet." : "No open commitments.", transcript: text });
    }
    if (intent.type === "people-query") {
      const peopleById = new Map(document.people.map((person) => [person.id, person]));
      const matching = document.commitments.filter((commitment) => {
        if (["completed", "deferred"].includes(commitment.status)) return false;
        if (intent.personId && commitment.personId !== intent.personId) return false;
        if (intent.mode === "i-owe") return commitment.direction === "i-owe";
        if (intent.mode === "waiting" || intent.mode === "owed-by") return commitment.direction === "waiting-on";
        if (intent.mode === "at-risk") return Boolean(commitment.dueAt);
        return true;
      }).filter((commitment) => !intent.person || peopleById.get(commitment.personId)?.name.toLowerCase().includes(intent.person.toLowerCase()));
      completeCommandTrace([], matching.map(({ id }) => id));
      if (!matching.length) return options.setFeedback({ phase: "completed", title: "No matching commitments", detail: "Nothing was invented or changed.", transcript: text });
      const labels = matching.slice(0, 3).map((commitment) => `${peopleById.get(commitment.personId)?.name ?? "Someone"}: ${commitment.title}`);
      return options.setFeedback({ phase: "completed", title: labels[0]!, detail: labels.slice(1).join(" · ") || `${matching.length} locally stored commitment${matching.length === 1 ? "" : "s"}.`, transcript: text });
    }
    if (["instinct-query", "instinct-why", "instinct-dismiss", "instinct-act"].includes(intent.type)) {
      const insightDateKey = intent.type === "instinct-act" ? intent.dateKey : undefined;
      const instincts = modelFor(insightDateKey).instincts;
      const requestedInsightId = intent.type === "instinct-act" ? intent.instinctId : undefined;
      const top = instincts.find(({ id }) => id === (requestedInsightId ?? context.selectedInsightId)) ?? instincts[0];
      if (!top) return options.setFeedback({ phase: "completed", title: "Nothing urgent", detail: "Flow has no new high-confidence insight for this scope.", transcript: text });
      const focus = modelFor(insightDateKey).focusWindow;
      const sourceEvent = modelFor(insightDateKey).events.find(({ start, end, kind }) => kind === "flexible" && start <= focus.start && end >= focus.end);
      recordCommandQuery({ id: top.id, title: top.title, ...(top.id === "clear-focus-window" ? { start: focus.start, end: focus.end, minutes: focus.minutes, ...(sourceEvent ? { sourceEventId: sourceEvent.id } : {}) } : {}) });
      options.recordInstinctExposure([top.id]);
      if (intent.type === "instinct-query") {
        options.updateContext({ selectedInsightId: top.id, topic: "recommendation" });
        if (top.id === "clear-focus-window" && !document.focus.active) {
          const model = modelFor();
          const durationMinutes = Math.min(25, model.focusWindow.minutes);
          const at = options.now().toISOString();
          const session = { id: uniqueLifeId(document, "focus", `${model.scope.dateKey}-${at}`), dateKey: model.scope.dateKey, startMinutes: model.focusWindow.start, durationMinutes, status: "active" as const, startedAt: at };
          options.setPending({ actions: [{ type: "focus.start", session }], transcript: text, source, summary: `Start ${durationMinutes} minutes of focus?`, confirmLabel: "Do it" });
        }
        return options.setFeedback({ phase: "completed", title: top.title, detail: top.detail, transcript: text });
      }
      if (intent.type === "instinct-why") return options.setFeedback({ phase: "completed", title: `Why: ${top.title}`, detail: top.provenance, transcript: text });
      if (intent.type === "instinct-act") {
        if (!intent.dateKey && temporal.scope.kind === "week") {
          options.updateContext({ selectedInsightId: top.id, topic: "recommendation", pendingIntent: { type: "instinct-act", instinctId: top.id, expiresAt: context.nowMs! + 120_000 } });
          return clarify("Which day should I use?", `Choose a day between ${temporal.scope.dateKey} and ${temporal.scope.endDateKey ?? temporal.scope.dateKey}. Nothing changed.`, text);
        }
        if (intent.dateKey && intent.dateKey !== temporal.scope.dateKey) options.setTemporalScope({ kind: "day", dateKey: intent.dateKey }, text);
        const actions: LifeAction[] = [{ type: "instinct.act", instinctId: top.id, at: options.now().toISOString() }];
        if (top.id === "clear-focus-window" && !document.focus.active) {
          const model = modelFor(intent.dateKey);
          const durationMinutes = Math.min(25, model.focusWindow.minutes);
          const at = options.now().toISOString();
          actions.push({ type: "focus.start", session: { id: uniqueLifeId(document, "focus", `${model.scope.dateKey}-${at}`), dateKey: model.scope.dateKey, startMinutes: model.focusWindow.start, durationMinutes, status: "active", startedAt: at } });
        }
        commitActions(actions, text, source, "Insight put into motion.");
        options.updateContext({ selectedInsightId: top.id, pendingIntent: undefined });
        return;
      }
      const until = new Date(options.now().getTime() + 4 * 60 * 60 * 1000).toISOString();
      commitActions([{ type: "instinct.dismiss", instinctId: top.id, until }], text, source, "Insight set aside for four hours.");
      return;
    }
    if (intent.type === "navigate") {
      // Back is spatial. Previous-day/today/tomorrow language owns temporal
      // rewind; an old date scope must never hijack route history.
      if (intent.route === "back") window.history.back();
      else if (intent.target) options.navigate(intent.target.world, undefined, false, intent.target.world === "people" ? intent.target.view ?? "default" : undefined);
      else options.navigate(intent.route);
      if (intent.route === "people" && intent.target?.view !== "commitments") { options.setFocusedEntityId(undefined); options.updateContext({ focusedPersonId: undefined, focusedGroupId: undefined, activeVoiceNoteId: undefined, activeMessageId: undefined, selectedVoiceMarkerId: undefined }); }
      const names = { home: "Home", today: "Today", focus: "Focus", "weather-outfit": "Weather & Outfit", people: intent.target?.world === "people" && intent.target.view === "commitments" ? "People · Commitments" : "People", "good-to-know": "Good to know", capture: "Capture", outcomes: "Outcomes", journal: "Journal", atmosphere: "Atmosphere", memories: "Memories", calendar: "Today", inbox: "Capture", plans: "Outcomes", now: "Today" } as const;
      const destination = intent.route === "back" ? "previous space" : names[intent.target?.world ?? intent.route];
      return options.setFeedback({ phase: "completed", title: `Opened ${destination}`, detail: intent.recovered ? "I corrected a close navigation phrase. Nothing else changed." : "Same live session. Nothing was captured.", transcript: text });
    }
    if (intent.type === "navigate-plan") {
      const matches = document.plans.filter(({ title }) => title.toLowerCase().includes(intent.query.toLowerCase()));
      if (matches.length !== 1) return clarify(matches.length ? `Two plans match ${intent.query}. Which one?` : `I can't find the ${intent.query} plan.`, matches.slice(0, 3).map(({ title }) => title).join(" · ") || "Name an active plan.", text);
      options.setFocusedEntityId(matches[0]!.id); options.navigate("outcomes", matches[0]!.id);
      return options.setFeedback({ phase: "completed", title: `Opened ${matches[0]!.title}`, detail: "Showing the matching plan.", transcript: text });
    }
    if (intent.type === "history") return intent.direction === "undo" ? options.undo(text) : options.redo(text);
    if (intent.type === "what-changed") {
      const change = snapshot.lastTransaction;
      if (change) options.showCalendarChange(change);
      return options.setFeedback({ phase: "completed", title: change?.summary ?? "No changes yet", detail: change ? `${change.actionTypes.join(" · ")} · ${change.at}` : "This is the starting life document.", transcript: text });
    }
    if (intent.type === "session") {
      window.dispatchEvent(new CustomEvent("flow-live-command", { detail: intent.mode }));
      return options.setFeedback({ phase: "completed", title: intent.mode === "sleep" ? "Flow Live sleeping" : "Flow Live ready", detail: intent.mode === "sleep" ? "The microphone session is off." : "Listening resumes after each final command.", transcript: text });
    }
    if (intent.type === "capture-mode") {
      options.updateContext({ captureMode: true });
      return options.setFeedback({ phase: "completed", title: "Capture mode ready", detail: "Say one thought. Flow will add only that next final utterance to Inbox.", transcript: text });
    }
    if (intent.type === "help") return options.setFeedback({ phase: "completed", title: "Try an action in plain language", detail: "Move an event, open a space, ask what fits, or say “Capture…” before an Inbox thought.", transcript: text });
    if (intent.type === "query-now") {
      const query = { excluded: intent.excluded, maxMinutes: intent.maxMinutes };
      const candidates = selectNowCandidates(document, options.now(), query);
      recordCommandQuery(candidates.map(({ id }) => id), selectNowWindow(document, options.now()));
      options.setNowQuery(query); options.setNowExplanationOpen(false);
      if (!(["home", "calendar", "today"] as LifeRoute[]).includes(options.route)) options.navigate("home");
      return options.setFeedback({ phase: "completed", title: candidates.length ? `${candidates.length} things fit` : "Keep this space free", detail: candidates.length ? candidates.map(({ title, reason }) => `${title} — ${reason}`).join(" · ") : "Nothing ready fits before the next anchor.", transcript: text });
    }
    if (intent.type === "why-now") { options.setNowExplanationOpen(true); return options.setFeedback({ phase: "completed", title: "Why these", detail: "Flow uses only free time, duration fit, due state, and readiness.", transcript: text }); }
    if (intent.type === "keep-free") { options.setNowQuery(null); return options.setFeedback({ phase: "completed", title: "Time kept free", detail: "Nothing changed in your life plan.", transcript: text }); }
    if (intent.type === "confirm") return options.confirm();
    if (intent.type === "cancel") {
      options.updateContext({ pendingIntent: undefined });
      return options.cancel();
    }
    if (intent.type === "pending-choice") return options.choosePending(intent.choiceId, text);

    if (intent.type === "capture-create" || intent.type === "capture-selected" || intent.type === "capture-answer") {
      const content = intent.type === "capture-create" ? intent.title : contextualCaptureContent(options, intent.type === "capture-answer" ? intent.title : undefined, text, source);
      if (!content) return;
      const title = intent.type === "capture-create" ? displayTitle(content) : content;
      const at = options.now().toISOString(); const id = uniqueLifeId(document, "capture", title);
      const capture: Capture = { id, kind: "capture", title, status: "unresolved", source: source === "voice" ? "voice" : "typed", provenance: { routerVersion: 2, transcript: text, commandId }, createdAt: at, updatedAt: at };
      if (commitActions([{ type: "capture.create", capture }], text, source, "Captured in Inbox.")) options.setFocusedEntityId(id);
      options.updateContext({ captureMode: false });
      return;
    }
    if (intent.type === "capture-batch-archive") {
      const captures = document.captures.filter(({ status }) => status === "unresolved");
      if (!captures.length) return options.setFeedback({ phase: "completed", title: "Capture is already clear", detail: "Nothing changed.", transcript: text });
      commitActions(captures.map(({ id }) => ({ type: "capture.archive" as const, captureId: id })), text, source, `Archived ${captures.length} capture${captures.length === 1 ? "" : "s"}.`);
      return;
    }
    if (intent.type === "capture-convert-event" || intent.type === "capture-convert-commitment") {
      const matches = focusedCaptures(document, contextualCaptureId, intent.query);
      if (matches.length !== 1) return clarify("Which capture should I route?", matches.slice(0, 3).map(({ title }) => title).join(" · ") || "Focus one Capture item first.", text);
      const capture = matches[0]!;
      const at = options.now().toISOString();
      if (intent.type === "capture-convert-event") {
        const parsed = interpretTranscript(`Schedule a ${intent.durationMinutes} minute ${capture.title} ${intent.scheduleText}`, document.calendar.dateKey);
        if (parsed.status !== "ready") return clarify("When should I schedule this capture?", parsed.detail, text);
        const eventId = uniqueCalendarId(document.calendar, capture.title);
        const actions: LifeAction[] = [
          { type: "calendar.request", request: parsed.request },
          { type: "link.create", link: createLifeLink(document, "capture-origin-of-event", capture.id, eventId, at) },
          { type: "capture.resolve", captureId: capture.id },
        ];
        if (commitActions(actions, text, source, `Scheduled ${capture.title} in Today.`, { kind: "capture-to-plan", sourceId: capture.id, destinationId: eventId, route: "calendar" })) options.setFocusedEntityId(eventId);
        return;
      }
      const existing = document.people.find(({ name }) => name.toLowerCase() === intent.person.toLowerCase());
      const person: Person = existing ?? { id: uniqueLifeId(document, "person", intent.person), kind: "person", name: intent.person, createdAt: at, updatedAt: at };
      const commitment: Commitment = { id: uniqueLifeId(document, "commitment", `${person.id}-${capture.title}`), kind: "commitment", personId: person.id, title: capture.title, direction: intent.direction, status: "open", createdAt: at, updatedAt: at };
      const actions: LifeAction[] = [
        ...(existing ? [] : [{ type: "person.ensure" as const, person }]),
        { type: "commitment.create", commitment },
        { type: "link.create", link: createLifeLink(document, "capture-origin-of-commitment", capture.id, commitment.id, at) },
        { type: "capture.resolve", captureId: capture.id },
      ];
      if (commitActions(actions, text, source, `Routed ${capture.title} to ${person.name}.`, { kind: "promise-thread", sourceId: capture.id, destinationId: commitment.id, route: "people" })) options.setFocusedEntityId(commitment.id);
      return;
    }
    if (intent.type === "outcome-create") {
      const at = options.now().toISOString();
      const id = uniqueLifeId(document, "plan", intent.title);
      const steps = initialPlanSteps(intent.title).map((template) => ({
        id: uniqueLifeId(document, "step", `${id}-${template.title}`), kind: "plan-step" as const, planId: id,
        title: template.title, status: "planned" as const, estimatedMinutes: template.estimatedMinutes, createdAt: at, updatedAt: at,
      }));
      const plan: Plan = {
        id, kind: "plan", title: intent.title, outcome: intent.targetCondition ? `Ready ${intent.targetCondition.toLowerCase()}` : `Ready: ${intent.title}`,
        status: "active", stepIds: [], ...(steps[0] ? { nextStepId: steps[0].id } : {}), ...(intent.targetCondition ? { targetCondition: intent.targetCondition } : {}), createdAt: at, updatedAt: at,
      };
      const actions: LifeAction[] = [{ type: "plan.create", plan }, ...steps.map((step) => ({ type: "plan.step.add" as const, step }))];
      if (commitActions(actions, text, source, `Created outcome ${intent.title}.`, { kind: "capture-to-plan", sourceId: id, destinationId: id, route: "plans", planId: id })) {
        options.setActivePlanId(id); options.setFocusedEntityId(id);
      }
      return;
    }
    if (intent.type === "capture-convert") {
      const matches = focusedCaptures(document, contextualCaptureId, intent.query);
      if (matches.length === 0) return clarify("What should become a plan?", "Focus a capture or name it.", text);
      if (matches.length > 1) return clarify(`Two unresolved captures match ${intent.query}. Which one?`, matches.slice(0, 3).map(({ title }) => title).join(" · "), text);
      const capture = matches[0]!;
      const existingLink = document.links.find((link) => link.type === "capture-origin-of-plan" && link.fromId === capture.id);
      if (existingLink) return options.setFeedback({ phase: "completed", title: "Already a plan", detail: document.plans.find(({ id }) => id === existingLink.toId)?.title, transcript: text });
      const at = options.now().toISOString(); const planId = uniqueLifeId(document, "plan", capture.title);
      const steps = initialPlanSteps(capture.title).map((template) => ({
        id: uniqueLifeId(document, "step", `${planId}-${template.title}`), kind: "plan-step" as const, planId,
        title: template.title, status: "planned" as const, estimatedMinutes: template.estimatedMinutes, createdAt: at, updatedAt: at,
      }));
      const plan: Plan = { id: planId, kind: "plan", title: capture.title, outcome: `Ready: ${capture.title}`, status: "active", stepIds: [], ...(steps[0] ? { nextStepId: steps[0].id } : {}), createdAt: at, updatedAt: at };
      const actions: LifeAction[] = [{ type: "plan.create", plan }];
      steps.forEach((step) => actions.push({ type: "plan.step.add", step }));
      actions.push({ type: "link.create", link: createLifeLink(document, "capture-origin-of-plan", capture.id, planId, at) }, { type: "capture.resolve", captureId: capture.id });
      if (commitActions(actions, text, source, `Created plan ${capture.title} from Inbox.`, { kind: "capture-to-plan", sourceId: capture.id, destinationId: planId, route: "plans", planId })) {
        options.setActivePlanId(planId); options.setFocusedEntityId(planId);
      }
      return;
    }
    if (intent.type === "capture-edit" || intent.type === "capture-archive" || intent.type === "capture-delete") {
      const matches = focusedCaptures(document, contextualCaptureId, "query" in intent ? intent.query : undefined);
      if (matches.length !== 1) return clarify("Which capture?", matches.slice(0, 3).map(({ title }) => title).join(" · ") || "Focus a capture first.", text);
      const capture = matches[0]!;
      const actions: LifeAction[] = intent.type === "capture-edit" ? [{ type: "capture.update", captureId: capture.id, title: intent.title }] : intent.type === "capture-archive" ? [{ type: "capture.archive", captureId: capture.id }] : [{ type: "capture.delete", captureId: capture.id }];
      if (intent.type === "capture-delete") { completeCommandTrace(actions, [capture.id]); options.setPending({ actions, transcript: text, source, summary: `Delete ${capture.title}?` }); return options.setFeedback({ phase: "confirmation", title: `Delete ${capture.title}?`, detail: "This removes one unresolved capture. Confirm or cancel.", transcript: text }); }
      if (commitActions(actions, text, source) && intent.type === "capture-edit") options.setEntityEditor?.(undefined);
      return;
    }

    if (intent.type === "plan-delete") {
      const matches = intent.query
        ? document.plans.filter(({ title }) => title.toLowerCase().includes(intent.query!.toLowerCase()))
        : document.plans.filter(({ id }) => id === (options.activePlanId ?? contextualPlanId));
      if (matches.length !== 1) return clarify("Which outcome should I delete?", matches.slice(0, 3).map(({ title }) => title).join(" · ") || "Open or name one outcome.", text);
      const actions: LifeAction[] = [{ type: "plan.delete", planId: matches[0]!.id }];
      completeCommandTrace(actions, [matches[0]!.id]);
      options.setPending({ actions, transcript: text, source, summary: `Delete ${matches[0]!.title}?` });
      return options.setFeedback({ phase: "confirmation", title: `Delete ${matches[0]!.title}?`, detail: "Its steps and Today reservations will be removed together. Confirm or cancel.", transcript: text });
    }
    if (intent.type === "plan-rename" || intent.type === "plan-status") {
      const named = intent.query ? namedEntities(document.plans, intent.query) : [];
      if (intent.query && named.length !== 1) return clarify(`Which plan matches ${intent.query}?`, named.slice(0, 3).map(({ title }) => title).join(" · ") || "That named plan was not found. Nothing changed.", text);
      const id = named[0]?.id ?? options.activePlanId ?? contextualPlanId;
      if (!id) return clarify(intent.type === "plan-rename" ? "Which plan should I rename?" : `Which plan should I mark ${intent.status}?`, "Open or name a plan.", text);
      const plan = document.plans.find((item) => item.id === id);
      if (!plan) return clarify("That plan is no longer available", "No data changed.", text);
      if (intent.type === "plan-status" && intent.excludedQuery && namedEntities(document.plans, intent.excludedQuery).some((item) => item.id === id)) return clarify("The selected plan is also excluded", "Name the plan that should change. Nothing changed.", text);
      if (intent.type === "plan-rename" && intent.requiredStatus && plan.status !== intent.requiredStatus) return clarify(`Keep ${plan.title} ${intent.requiredStatus}?`, `It is currently ${plan.status}. Nothing changed.`, text);
      commitActions([{ type: "plan.update", planId: id, patch: intent.type === "plan-rename" ? { title: intent.title } : { status: intent.status } }], text, source, intent.type === "plan-rename" ? `Renamed the plan to ${intent.title}.` : `Plan marked ${intent.status}.`); return;
    }
    if (intent.type === "step-add") {
      const planId = options.activePlanId ?? document.plans.find(({ status }) => status === "active")?.id;
      if (!planId) return clarify("Which plan needs this step?", "Open a plan first.", text);
      const at = options.now().toISOString(); const id = uniqueLifeId(document, "step", `${planId}-${intent.title}`);
      const step: PlanStep = { id, kind: "plan-step", planId, title: intent.title, status: "planned", estimatedMinutes: intent.minutes ?? 25, createdAt: at, updatedAt: at };
      const actions: LifeAction[] = [{ type: "plan.step.add", step }];
      if (intent.afterQuery) {
        const plan = document.plans.find(({ id: existingId }) => existingId === planId)!;
        const anchorIndex = plan.stepIds.findIndex((stepId) => document.steps.find(({ id: candidateId }) => candidateId === stepId)?.title.toLowerCase().includes(intent.afterQuery!.toLowerCase()));
        if (anchorIndex < 0) return clarify(`I can't find the ${intent.afterQuery} step.`, "Name a step in the open plan.", text);
        actions.push({ type: "plan.step.reorder", planId, stepId: id, beforeStepId: plan.stepIds[anchorIndex + 1] });
      }
      if (commitActions(actions, text, source, `Added ${intent.title}.`)) options.setFocusedEntityId(id);
      return;
    }
    if (intent.type === "step-set-first") {
      const contextual = freshReference(context, ["plan"])?.id;
      const activePlans = document.plans.filter(({ status }) => status === "active");
      const plan = document.plans.find(({ id }) => id === (options.activePlanId ?? contextual)) ?? (activePlans.length === 1 ? activePlans[0] : undefined);
      if (!plan) return clarify("Which outcome needs this first step?", activePlans.slice(0, 3).map(({ title }) => title).join(" · ") || "Create or open an outcome first.", text);
      const currentFirst = document.steps.find(({ id }) => id === plan.stepIds[0]);
      if (currentFirst && currentFirst.status === "planned") {
        commitActions([
          { type: "plan.update", planId: plan.id, patch: { nextStepId: currentFirst.id } },
          { type: "plan.step.update", stepId: currentFirst.id, patch: { title: intent.title } },
        ], text, source, `Set the first step: ${intent.title}.`);
        return;
      }
      const at = options.now().toISOString(); const id = uniqueLifeId(document, "step", `${plan.id}-${intent.title}`);
      const step: PlanStep = { id, kind: "plan-step", planId: plan.id, title: intent.title, status: "planned", estimatedMinutes: 30, createdAt: at, updatedAt: at };
      if (commitActions([
        { type: "plan.update", planId: plan.id, patch: { nextStepId: id } },
        { type: "plan.step.add", step },
      ], text, source, `Set the first step: ${intent.title}.`)) options.setFocusedEntityId(id);
      return;
    }
    if (["step-set-next", "step-duration", "step-find-time", "step-delete"].includes(intent.type)) {
      if (!("query" in intent)) return;
      let matches = matchingSteps(document, options.activePlanId, contextualStepId, intent.query);
      if (!options.activePlanId && matches.length > 1) {
        const contextualPlan = freshReference(context, ["plan"])?.id;
        if (contextualPlan) matches = matches.filter(({ planId }) => planId === contextualPlan);
      }
      if (matches.length !== 1) return clarify("Which outcome step do you mean?", matches.slice(0, 3).map(({ title }) => title).join(" · ") || "Name one step.", text);
      const step = matches[0]!;
      if (intent.type === "step-set-next") {
        commitActions([{ type: "plan.update", planId: step.planId, patch: { nextStepId: step.id } }], text, source, `${step.title} is the next step.`); return;
      }
      if (intent.type === "step-duration") {
        commitActions([{ type: "plan.step.update", stepId: step.id, patch: { estimatedMinutes: intent.minutes } }], text, source, `${step.title} now takes ${intent.minutes} minutes.`); return;
      }
      if (intent.type === "step-delete") {
        const actions: LifeAction[] = [{ type: "plan.step.delete", stepId: step.id }];
        completeCommandTrace(actions, [step.id]);
        options.setPending({ actions, transcript: text, source, summary: `Delete ${step.title}?` });
        return options.setFeedback({ phase: "confirmation", title: `Delete ${step.title}?`, detail: "Its linked Today reservation will be removed too. Confirm or cancel.", transcript: text });
      }
      const current = options.now();
      const currentMinutes = Math.ceil((current.getHours() * 60 + current.getMinutes()) / 15) * 15;
      const roomBlockers: CalendarEvent[] = (document.calendar.breathingRooms ?? []).map((room) => ({
        id: room.id, title: room.label ?? "Breathing Room", dateKey: room.dateKey, start: room.start, end: room.end,
        kind: "protected", priority: "high", protected: room.protected, mobility: "anchored", status: "planned",
      }));
      const start = firstAvailable([...document.calendar.events, ...roomBlockers], step.estimatedMinutes ?? 30, Math.max(DAY_START, currentMinutes), document.calendar.endBoundaryMinutes ?? DAY_END);
      if (start === null) return clarify(`No safe time remains for ${step.title}.`, "Move it to another day or shorten its duration.", text);
      const eventId = uniqueLifeId(document, "event", `${step.id}-${document.calendar.dateKey}`);
      if (commitActions([{ type: "step.schedule", stepId: step.id, eventId, dateKey: document.calendar.dateKey, startMinutes: start }], text, source, `Scheduled ${step.title} at the next safe time.`, { kind: "step-to-calendar", sourceId: step.id, destinationId: eventId, route: "calendar" })) options.setFocusedEntityId(eventId);
      return;
    }
    if (intent.type === "step-add-schedule") {
      const planId = options.activePlanId ?? document.plans.find(({ status }) => status === "active")?.id;
      if (!planId) return clarify("Which plan needs this step?", "Open a plan first.", text);
      const anchors = document.calendar.events.filter(({ title }) => title.toLowerCase().includes(intent.anchorQuery.toLowerCase()));
      if (anchors.length !== 1) return clarify(`Which ${intent.anchorQuery} do you mean?`, anchors.slice(0, 3).map(({ title }) => title).join(" · ") || "Name one Calendar anchor.", text);
      const at = options.now().toISOString(); const id = uniqueLifeId(document, "step", `${planId}-${intent.title}`); const eventId = uniqueLifeId(document, "event", `${id}-${document.calendar.dateKey}`);
      const step: PlanStep = { id, kind: "plan-step", planId, title: intent.title, status: "planned", estimatedMinutes: intent.minutes, createdAt: at, updatedAt: at };
      if (commitActions([{ type: "plan.step.add", step }, { type: "step.schedule", stepId: id, eventId, dateKey: document.calendar.dateKey, startMinutes: anchors[0]!.end }], text, source, `Added and scheduled ${intent.title}.`, { kind: "step-to-calendar", sourceId: id, destinationId: eventId, route: "calendar" })) options.setFocusedEntityId(eventId);
      return;
    }
    if (intent.type === "step-rename") {
      const matches = matchingSteps(document, options.activePlanId, contextualStepId, intent.query);
      if (matches.length !== 1) return clarify("Which plan step should I rename?", matches.slice(0, 3).map(({ title }) => title).join(" · ") || "Name a step in the open plan.", text);
      if (commitActions([{ type: "plan.step.update", stepId: matches[0]!.id, patch: { title: intent.title } }], text, source, `Renamed the step to ${intent.title}.`)) options.setEntityEditor?.(undefined);
      return;
    }
    if (intent.type === "step-complete" || intent.type === "step-defer" || intent.type === "step-unschedule") {
      const query = intent.query;
      const matches = matchingSteps(document, options.activePlanId, contextualStepId, query);
      if (matches.length !== 1) return clarify("Which plan step?", matches.slice(0, 3).map(({ title }) => title).join(" · ") || "Name a step.", text);
      if (intent.type === "step-unschedule") {
        const actions: LifeAction[] = [{ type: "step.unschedule", stepId: matches[0]!.id }];
        completeCommandTrace(actions, [matches[0]!.id]);
        options.setPending({ actions, transcript: text, source, summary: `Remove ${matches[0]!.title} from Calendar?` });
        return options.setFeedback({ phase: "confirmation", title: `Remove ${matches[0]!.title} from Calendar?`, detail: "The plan step stays planned; only its reservation is removed.", transcript: text });
      }
      const step = matches[0]!;
      const link = document.links.find((item) => item.type === "step-scheduled-as-event" && item.fromId === step.id);
      const status = intent.type === "step-defer" ? "deferred" : intent.reopen ? (link ? "scheduled" : "planned") : "completed";
      const actions: LifeAction[] = [{ type: "plan.step.update", stepId: step.id, patch: { status, ...(intent.type === "step-defer" && intent.dateKey ? { deferredUntil: intent.dateKey } : {}) } }];
      if (link && intent.type === "step-defer") {
        const request: CalendarRequest = { transcript: text, normalized: text.toLowerCase(), actions: [{ type: "defer", selector: { type: "id", id: link.toId }, date: intent.dateKey ? { dateKey: intent.dateKey } : "tomorrow" }], constraints: [] };
        actions.push({ type: "calendar.request", request, confirmed: true });
      }
      if (link && intent.type === "step-complete" && !intent.reopen) {
        const request: CalendarRequest = { transcript: text, normalized: text.toLowerCase(), actions: [{ type: "update", selector: { type: "id", id: link.toId }, patch: { status: "done" } }], constraints: [] };
        actions.push({ type: "calendar.request", request, confirmed: true });
      }
      commitActions(actions, text, source, `${step.title} ${status}.`); return;
    }
    if (intent.type === "step-reorder") {
      const named = intent.planQuery ? namedEntities(document.plans, intent.planQuery) : [];
      if (intent.planQuery && named.length !== 1) return clarify("Which outcome contains those steps?", named.slice(0, 3).map(({ title }) => title).join(" · ") || "That named outcome was not found.", text);
      const planId = named[0]?.id ?? options.activePlanId ?? document.plans.find(({ status }) => status === "active")?.id;
      const pool = document.steps.filter((step) => step.planId === planId);
      const moving = namedEntities(pool, intent.query);
      const before = namedEntities(pool, intent.beforeQuery);
      if (!planId || moving.length !== 1 || before.length !== 1) return clarify("Which steps should move?", "Name two unique steps in the open plan.", text);
      commitActions([{ type: "plan.step.reorder", planId, stepId: moving[0]!.id, beforeStepId: before[0]!.id }], text, source, `${moving[0]!.title} moved before ${before[0]!.title}.`); return;
    }
    if (intent.type === "step-schedule") {
      let matches = matchingSteps(document, undefined, contextualStepId, intent.query);
      if (options.activePlanId) { const activeMatches = matches.filter(({ planId }) => planId === options.activePlanId); if (activeMatches.length) matches = activeMatches; }
      if (matches.length !== 1) return clarify(matches.length ? `${matches.length} steps match ${intent.query}. Which plan?` : `I can't find the ${intent.query} step.`, matches.slice(0, 3).map(({ title }) => title).join(" · ") || "Open the plan or name its step.", text);
      const step = matches[0]!; const eventId = uniqueLifeId(document, "event", `${step.id}-${intent.dateKey}`);
      if (commitActions([{ type: "step.schedule", stepId: step.id, eventId, dateKey: intent.dateKey, startMinutes: intent.minutes, protect: intent.protect }], text, source, `Scheduled ${step.title} in Calendar.`, { kind: "step-to-calendar", sourceId: step.id, destinationId: eventId, route: "calendar" })) options.setFocusedEntityId(eventId);
      return;
    }

    if (intent.type === "commitment-create") {
      const at = options.now().toISOString();
      const existing = document.people.find(({ name }) => name.toLowerCase() === intent.person.toLowerCase());
      const person: Person = existing ?? { id: uniqueLifeId(document, "person", intent.person), kind: "person", name: intent.person, createdAt: at, updatedAt: at };
      const commitment: Commitment = { id: uniqueLifeId(document, "commitment", `${person.id}-${intent.title}`), kind: "commitment", personId: person.id, title: intent.title, direction: intent.direction, status: intent.status, dueAt: intent.dueAt, createdAt: at, updatedAt: at };
      const actions: LifeAction[] = [...(existing ? [] : [{ type: "person.ensure" as const, person }]), { type: "commitment.create", commitment }];
      if (commitActions(actions, text, source, `Promise with ${person.name} added.`, { kind: "promise-thread", sourceId: person.id, destinationId: commitment.id, route: "people", peopleView: "commitments" })) {
        options.setFocusedEntityId(commitment.id);
        options.updateContext({ pendingIntent: undefined });
      }
      return;
    }
    if (intent.type === "commitment-schedule" || intent.type === "commitment-find-time") {
      const matches = document.commitments.filter((item) => item.status !== "completed"
        && item.title.toLowerCase().includes(intent.query.toLowerCase())
        && (!intent.person || document.people.find(({ id }) => id === item.personId)?.name.toLowerCase() === intent.person.toLowerCase()));
      if (matches.length !== 1) return clarify(matches.length ? `Which ${intent.query} promise should reserve time?` : `I can't find the ${intent.query} promise.`, matches.slice(0, 3).map(({ title }) => title).join(" · ") || "Name the person and promise.", text);
      const commitment = matches[0]!;
      const existingLink = document.links.find((link) => link.type === "commitment-reserved-by-event" && link.fromId === commitment.id);
      let dateKey: string; let startMinutes: number; let durationMinutes: number;
      if (intent.type === "commitment-schedule") {
        ({ dateKey, minutes: startMinutes, durationMinutes } = intent);
        const target = document.calendars[dateKey] ?? (document.calendar.dateKey === dateKey ? document.calendar : undefined);
        if (target) {
          const rooms: CalendarEvent[] = (target.breathingRooms ?? []).map((room) => ({
            id: room.id, title: room.label ?? "Breathing Room", dateKey: room.dateKey, start: room.start, end: room.end,
            kind: "protected", priority: "high", protected: room.protected, mobility: "anchored", status: "planned",
          }));
          const blockers = [...target.events.filter(({ id }) => id !== existingLink?.toId), ...rooms];
          const available = firstAvailable(blockers, durationMinutes, startMinutes, target.endBoundaryMinutes ?? DAY_END);
          if (available === null) return clarify(`No safe time remains for ${commitment.title}.`, "Choose another day or shorten the preparation time.", text);
          startMinutes = available;
        }
      } else {
        const current = options.now();
        const currentMinutes = Math.ceil((current.getHours() * 60 + current.getMinutes()) / 15) * 15;
        const boundary = document.calendar.endBoundaryMinutes ?? DAY_END;
        const useToday = currentMinutes < boundary;
        dateKey = useToday ? document.calendar.dateKey : dateKeyAfter(document.calendar.dateKey, 1);
        durationMinutes = 30;
        const rooms: CalendarEvent[] = useToday ? (document.calendar.breathingRooms ?? []).map((room) => ({
          id: room.id, title: room.label ?? "Breathing Room", dateKey: room.dateKey, start: room.start, end: room.end,
          kind: "protected", priority: "high", protected: room.protected, mobility: "anchored", status: "planned",
        })) : [];
        const blockers = useToday
          ? [...document.calendar.events.filter(({ id }) => id !== existingLink?.toId), ...rooms]
          : [];
        const available = firstAvailable(blockers, durationMinutes, useToday ? Math.max(DAY_START, currentMinutes) : 9 * 60, boundary);
        if (available === null) return clarify(`No safe time remains for ${commitment.title}.`, "Choose another day or shorten the preparation time.", text);
        startMinutes = available;
      }
      const eventId = existingLink?.toId ?? uniqueLifeId(document, "event", `promise-${commitment.id}-${dateKey}`);
      if (commitActions([{ type: "commitment.schedule", commitmentId: commitment.id, eventId, dateKey, startMinutes, durationMinutes }], text, source, `Reserved ${durationMinutes} minutes for ${commitment.title}.`, { kind: "promise-thread", sourceId: commitment.id, destinationId: eventId, route: "calendar" })) options.setFocusedEntityId(eventId);
      return;
    }
    if (intent.type === "commitment-link-plan") {
      const commitments = document.commitments.filter((item) => document.people.find(({ id }) => id === item.personId)?.name.toLowerCase().includes(intent.person.toLowerCase()));
      const plans = document.plans.filter(({ title }) => title.toLowerCase().includes(intent.planQuery.toLowerCase()));
      if (commitments.length !== 1 || plans.length !== 1) return clarify("Which promise and plan should I link?", "Name one unique person promise and one plan.", text);
      const link = createLifeLink(document, "commitment-about-plan", commitments[0]!.id, plans[0]!.id, options.now().toISOString());
      commitActions([{ type: "link.create", link }], text, source, `Linked ${intent.person}'s promise to ${plans[0]!.title}.`); return;
    }
    if (intent.type === "commitment-due") {
      const matches = matchingCommitments(document, intent);
      if (matches.length !== 1) return clarify("Which promise deadline should move?", matches.slice(0, 3).map(({ title }) => title).join(" · ") || "Name the promise.", text);
      if (intent.excluded && matchingCommitments(document, intent.excluded).some(({ id }) => id === matches[0]!.id)) return clarify("That promise is also excluded", "Name the promise that should change. Nothing changed.", text);
      commitActions([{ type: "commitment.update", commitmentId: matches[0]!.id, patch: { dueAt: intent.dueAt } }], text, source, `Moved ${matches[0]!.title}'s deadline.`); return;
    }
    if (intent.type === "commitment-defer") {
      const matches = matchingCommitments(document, intent).filter((item) => item.status !== "completed");
      if (matches.length !== 1) return clarify("Which commitment should I defer?", matches.slice(0, 3).map(({ title }) => title).join(" · ") || "Name the person and commitment.", text);
      if (intent.requiredStatus && matches[0]!.status !== intent.requiredStatus) return clarify(`Is ${matches[0]!.title} still open?`, `It is currently ${matches[0]!.status}. Nothing changed.`, text);
      commitActions([{ type: "commitment.update", commitmentId: matches[0]!.id, patch: { status: "deferred", deferredUntil: intent.dateKey, ...(intent.reason ? { deferReason: intent.reason } : {}) } }], text, source, `${matches[0]!.title} deferred until ${intent.dateKey}.`); return;
    }
    if (intent.type === "commitment-complete" || intent.type === "commitment-delete") {
      const contextualId = !intent.query && !intent.person ? freshReference(context, ["commitment"])?.id : undefined;
      const matches = matchingCommitments(document, intent).filter((item) => (!contextualId || item.id === contextualId) && (intent.type === "commitment-delete" || item.status !== "completed"));
      if (matches.length !== 1) return clarify(intent.type === "commitment-delete" ? "Which promise should I delete?" : "Which promise should I complete?", matches.slice(0, 3).map(({ title }) => title).join(" · ") || "Name the person and promise.", text);
      if (intent.type === "commitment-complete" && intent.excluded && matchingCommitments(document, intent.excluded).some(({ id }) => id === matches[0]!.id)) return clarify("That promise is also excluded", "Name the promise that should change. Nothing changed.", text);
      if (intent.type === "commitment-delete") {
        const actions: LifeAction[] = [{ type: "commitment.delete", commitmentId: matches[0]!.id }];
        completeCommandTrace(actions, [matches[0]!.id]);
        options.setPending({ actions, transcript: text, source, summary: `Delete ${matches[0]!.title}?` });
        return options.setFeedback({ phase: "confirmation", title: `Delete ${matches[0]!.title}?`, detail: "This removes the promise and its explicit links. Confirm or cancel.", transcript: text });
      }
      commitActions([{ type: "commitment.update", commitmentId: matches[0]!.id, patch: { status: "completed" } }], text, source, `${matches[0]!.title} completed.`); return;
    }
    if (intent.type === "calendar") {
      const current = options.now();
      const contextualEventId = freshReference(context, ["calendar-event"])?.id;
      const binding = bindCalendarParticipants(intent.request, document.people);
      if ("question" in binding) return clarify(binding.question, binding.detail, text);
      const request = {
        ...binding.request,
        nowMinutes: intent.request.nowMinutes ?? current.getHours() * 60 + current.getMinutes(),
      };
      const sourceDate = calendarRequestSourceDate(document, context.currentTimeScope ?? temporal.scope, request, contextualEventId);
      if ("question" in sourceDate) {
        if (sourceDate.clarification) options.setPending({ actions: [], transcript: text, source, summary: sourceDate.question, calendarRequest: request, clarification: sourceDate.clarification });
        return clarify(sourceDate.question, sourceDate.detail, text);
      }
      const committed = commitActions([{ type: "calendar.request", request, selectedId: contextualEventId, sourceDateKey: sourceDate.dateKey }], text, source);
      if (committed && context.pendingIntent?.type === "calendar-create") options.updateContext({ pendingIntent: undefined });
      return committed;
    }
    if (intent.type === "unsupported") {
      completeCommandTrace([], [], intent.detail);
      options.setFeedback({ phase: "error", title: intent.title, detail: intent.detail, transcript: text });
    }
  };
}
