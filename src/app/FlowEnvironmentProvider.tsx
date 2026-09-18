/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import type { CalendarAction, CalendarRequest, ChangeRecord, DayPlan, EventSelector, PlannerFeedback, TransactionSource } from "../features/day-planner/model";
import { localDateKey } from "../features/day-planner/time";
import { createInitialLifePlan } from "../features/day-planner/seed";
import { adjustPreviewRequest, applyPendingChoice } from "../features/day-planner/plannerPreview";
import { replayFeedback } from "../features/day-planner/plannerFeedback";
import type { FlowLiveStatus } from "../features/voice/useFlowLiveSession";
import type { LifeAction } from "../domain/life-actions";
import type { ConversationEntityReference, LifeContext, LifeDocument, LifeRoute, LifeSnapshot, LifeTransactionRecord, PeopleView, TemporalScope, WorldDestination } from "../domain/life-model";
import { applyLifeTransaction } from "../domain/life-transaction";
import { projectInstinctExposure } from "../features/elite/instinctExposure";
import { completeJournalCreation, type JournalAcquisition, type JournalCreationOrigin } from "../features/studio/journalAcquisition";
import { LIFE_STORAGE_KEY, readLifeSnapshot, readLifeSnapshotRevision, saveLifeSnapshot } from "../domain/life-storage";
import { LifeMutationCoordinator } from "../domain/life-synchronization";
import { selectNowCandidates, type NowQuery, type NowRecommendation } from "../domain/life-selectors";
import type { ActiveLifeTransition, CapturedCommandContext, CommandFeedback, PendingLifeChange } from "./environment-types";
import { createLifeCommandRunner } from "./lifeCommandController";
import { partitionJournalFinals } from "../features/voice/journalFinalBoundary";
import { deliverMessage, deliveryReceipts } from "../features/friends/messaging";
import { messageEnvelope } from "../features/friends/deliveryProjection";
import { requestStudioRecording } from "../features/studio/recordingRequest";
import { recordingDocument } from "../features/studio/recordingTarget";
import { getStudioMedia } from "../features/studio/mediaRepository";
import { canonicalPerson, personLabel } from "../features/friends/people";
import type { FriendIntent } from "../features/friends/friendIntents";
import type { FriendMessage } from "../domain/friends-model";
import { nativeContinuationAvailable, nativeContinuationPresentation, type NativeStudioIntent } from "../features/studio/nativeStudioCapability";
import { performNativeStudioContinuation } from "../features/studio/performNativeStudioContinuation";
import { requestStudioPlayback } from "../features/studio/studioPlayback";
import { useLifeTransition } from "./useLifeTransition";
import { clearGenericConversation, navigateConversation, referenceFor, restoreConversationFromTransaction } from "./conversationContext";
import { resolveEventReference } from "../features/day-planner/scheduling/resolution";
import { allCalendarEvents, projectCalendarDate } from "../domain/life-calendar-world";
import { createOpenMeteoProvider, type WeatherProvider } from "../features/elite/weather";
import { dateKeyAfter } from "../features/day-planner/interpretation/temporal";
import { beginCommandTrace, recordCommandOutcome, patchCommandTrace } from "./commandTrace";
import { recordingCommandId } from "../features/studio/recordingRequest";
import { deriveRewardFacts } from "../core/rewards/derive-reward-facts";
import { RewardDirector } from "../core/rewards/reward-director";
import { readRewardPreferences, writeRewardPreferences } from "../core/rewards/reward-preferences";
import type { RewardFact, RewardPreferences, RewardRuntimeSnapshot } from "../core/rewards/reward-types";
import { resolveGlobalCommand, type GlobalIntent } from "../shared/command/globalInterpreter";
import { loadVisualRewardDemo } from "../core/rewards/reward-demo";
import { useReducedMotionPreference } from "../shared/motion/useReducedMotionPreference";
import { projectResolvedCommand, type VoiceWorldSnapshot } from "../features/voice-home/voiceWorld";
import { useVoiceWorld } from "../features/voice-home/useVoiceWorld";
import { rolloverTemporal } from "../domain/temporalRollover";
import { temporalScopeTransition } from "../domain/temporalScopeTransition";
import { committedCalendarScope } from "./committedCalendarScope";
import { calendarReferenceScope, calendarRequestSourceDate } from "./calendarCommandScope";
import { initialCommitmentView, commitmentViewCommands, type CommitmentViewState } from "../features/people/commitmentView";
import { entityViewDescription, type EntityEditor, type EntityViewIntent } from "../features/entity-navigation/entityView";
import { initialCommandPresentation, type CommandPresentation, type PresentationIntent } from "../shared/command/presentationCapability";
import { runKernelTurn, createBridgeSession, fileReference, recentFileToReference, type RecentFileMeta } from "../kernel/productionBridge";
import { rememberSearchResults } from "../kernel/referents";
import { referenceFromLegacyContext, legacyContextPatchFromReference } from "./kernelReferentBridge";
import { desktopBridgeEvents } from "../kernel/lib/desktopBridgeClient";

interface EnvironmentValue {
  snapshot: LifeSnapshot;
  document: LifeDocument;
  route: WorldDestination;
  peopleView: PeopleView;
  commitmentView: CommitmentViewState;
  entityEditor?: EntityEditor;
  commandPresentation: CommandPresentation;
  activePlanId?: string;
  focusedEntityId?: string;
  selectedCalendarEventId?: string;
  feedback: CommandFeedback;
  calendarFeedback: PlannerFeedback;
  renderedCalendar: DayPlan;
  calendarPreview: boolean;
  lastTranscript: string;
  pending?: PendingLifeChange;
  confirmationAuthority: object | null;
  nowCandidates: NowRecommendation[];
  nowQuery: NowQuery | null | undefined;
  nowExplanationOpen: boolean;
  flowLiveStatus: FlowLiveStatus;
  voiceWorld: VoiceWorldSnapshot;
  reward: RewardRuntimeSnapshot;
  rewardPreferences: RewardPreferences;
  conversationContext: LifeContext;
  pageNavigation: { id: number; kind: "open" | "back" };
  canUndo: boolean;
  canRedo: boolean;
  temporalScope: TemporalScope;
  todayDateKey: string;
  currentTime: Date;
  setTemporalScope: (scope: TemporalScope, transcript?: string) => void;
  recordInstinctExposure: (instinctIds: string[]) => void;
  navigate: (route: LifeRoute, planId?: string, replace?: boolean, peopleView?: PeopleView) => void;
  goBack: () => void;
  focusEntity: (id?: string) => void;
  selectCalendarEvent: (id?: string) => void;
  runCommand: (transcript: string, source?: TransactionSource, commandId?: string, captured?: CapturedCommandContext) => void;
  dispatchCommitmentView: (patch: Partial<CommitmentViewState>) => void;
  dispatchEntityView: (intent: EntityViewIntent) => void;
  dispatchPresentation: (intent: PresentationIntent, fromGesture?: boolean) => void;
  dispatchCalendar: (actions: CalendarAction[], source: TransactionSource, transcript: string) => void;
  dispatchLife: (actions: LifeAction[], summary: string, transcript?: string, source?: TransactionSource) => boolean | Promise<boolean>;
  dispatchFriend: (intent: FriendIntent) => void;
  prepareJournalAcquisition: (entryId: string, origin: JournalCreationOrigin | undefined, ownsRequest: () => boolean) => JournalAcquisition;
  prepareVoiceNoteAcquisition: (noteId: string, ownsRequest: () => boolean) => JournalAcquisition;
  dispatchRecording: (actions: LifeAction[], summary: string, isCurrent?: () => boolean) => Promise<boolean>;
  undo: (transcript?: string) => void;
  redo: (transcript?: string) => void;
  confirm: () => void;
  continueNative: () => void;
  requestNativeStudio: (intent: NativeStudioIntent) => void;
  cancel: () => void;
  choosePending: (choiceId: string) => void;
  setListeningFeedback: (interim: string) => void;
  setFlowLiveStatus: (status: FlowLiveStatus) => void;
  wakeVoiceHome: (transcript: string) => void;
  waitForVoiceWake: (transcript: string) => void;
  activateVoiceHome: (transcript?: string) => void;
  disableVoiceWakeGate: () => void;
  setRewardPreferences: (preferences: RewardPreferences, fromGesture?: boolean) => void;
  syncFromStorage: () => void;
  setJournalVoiceMode: (mode: "command" | "dictation" | "journal-longform", entryId?: string, positionMs?: number) => void;
  setVoiceNoteMode: (mode: "command" | "voice-note-longform", noteId: string) => void;
  selectStudioSource: (selection: { entryId?: string; passage?: string; photoAssetId?: string; bookmarkId?: string; positionMs?: number }) => void;
  selectRecordingPlayback: (target: { kind: "voice-note" | "shared-message"; id: string }) => void;
  setPlaybackState: (target: { kind: "journal" | "voice-note" | "shared-message"; id: string }, status: "playing" | "paused" | "stopped") => void;
  selectInsight: (id: string) => void;
}

const EnvironmentContext = createContext<EnvironmentValue | null>(null);
const TransitionContext = createContext<ActiveLifeTransition | undefined>(undefined);
const readyFeedback: CommandFeedback = { phase: "ready", title: "Tell Flow what changed" };
const calendarReady: PlannerFeedback = { phase: "ready", title: "On track", summary: "Your fixed time is protected.", detail: "Flexible work can move.", changedIds: [] };

function canonicalRoute(route: LifeRoute): WorldDestination {
  if (route === "calendar" || route === "now") return "today";
  if (route === "inbox") return "capture";
  if (route === "plans") return "outcomes";
  return route;
}

function routeFromPath(pathname: string, search = window.location.search): { route: WorldDestination; planId?: string; peopleView: PeopleView; alias: boolean; personId?: string; groupId?: string; noteId?: string } {
  const parts = pathname.split("/").filter(Boolean);
  const head = parts[0] ?? "";
  const peopleView: PeopleView = new URLSearchParams(search).get("view") === "commitments" || head === "commitments" ? "commitments" : "default";
  if (head === "today" || head === "calendar" || head === "now") return { route: "today", peopleView: "default", alias: head !== "today" };
  if (head === "focus") return { route: "focus", peopleView: "default", alias: false };
  if (head === "weather-outfit") return { route: "weather-outfit", peopleView: "default", alias: false };
  if (head === "good-to-know") return { route: "good-to-know", peopleView: "default", alias: false };
  if (head === "journal") return { route: "journal", peopleView: "default", alias: false };
  if (head === "atmosphere") return { route: "atmosphere", peopleView: "default", alias: false };
  if (head === "memories") return { route: "memories", peopleView: "default", alias: false };
  if (head === "capture" || head === "inbox") return { route: "capture", peopleView: "default", alias: head !== "capture" };
  if (head === "outcomes" || head === "plans") return { route: "outcomes", ...(parts[1] ? { planId: parts[1] } : {}), peopleView: "default", alias: head !== "outcomes" };
  if (head === "commitments" || head === "people" || head === "friends") return { route: "people", peopleView, alias: head !== "people", ...(parts[1] === "person" && parts[2] ? { personId: decodeURIComponent(parts[2]) } : {}), ...(parts[1] === "group" && parts[2] ? { groupId: decodeURIComponent(parts[2]) } : {}), ...(parts[3] === "note" && parts[4] ? { noteId: decodeURIComponent(parts[4]) } : {}) };
  return { route: "home", peopleView: "default", alias: Boolean(head) };
}

function pathForRoute(route: LifeRoute, planId?: string, peopleView: PeopleView = "default") {
  const canonical = canonicalRoute(route);
  if (canonical === "home") return "/";
  if (canonical === "outcomes") return planId ? `/outcomes/${planId}` : "/outcomes";
  if (canonical === "people" && peopleView === "commitments") return "/people?view=commitments";
  return `/${canonical}`;
}

function changedCalendarIds(before: DayPlan, after: DayPlan) {
  const prior = new Map([...before.events, ...before.deferred].map((event) => [event.id, JSON.stringify(event)]));
  return [...after.events, ...after.deferred].filter((event) => prior.get(event.id) !== JSON.stringify(event)).map(({ id }) => id);
}

function selectorForPrimaryAction(action: CalendarAction): EventSelector | undefined {
  if ("selector" in action) return action.selector;
  if ((action.type === "createBreathingRoom" || action.type === "create" || action.type === "fit") && action.destination.type === "relative") return action.destination.anchor;
  return undefined;
}

function selectorUsesConversation(selector: EventSelector): boolean {
  if (selector.type === "selected" || selector.type === "anaphor") return true;
  if (selector.type === "multi") return selector.selectors.some(selectorUsesConversation);
  if (selector.type === "relativeEvent") return selectorUsesConversation(selector.anchor);
  return false;
}

function primaryEntityForActions(
  actions: LifeAction[],
  before: LifeDocument,
  after: LifeDocument,
  at: number,
  transactionId: string,
): ConversationEntityReference | undefined {
  const calendarAction = actions.find((action) => action.type === "calendar.request");
  if (calendarAction?.type === "calendar.request") {
    const selector = calendarAction.request.actions.map(selectorForPrimaryAction).find(Boolean);
    if (selector) {
      const resolved = resolveEventReference(before.calendar, selector, calendarAction.selectedId, calendarAction.request.nowMinutes);
      if (resolved.status === "resolved" && resolved.events.length === 1) return referenceFor(after, resolved.events[0]!.id, at, transactionId);
      if (selectorUsesConversation(selector) && calendarAction.selectedId && allCalendarEvents(after).some(({ id }) => id === calendarAction.selectedId)) {
        return referenceFor(after, calendarAction.selectedId, at, transactionId);
      }
    }
    const beforeIds = new Set(allCalendarEvents(before).map(({ id }) => id));
    const created = allCalendarEvents(after).filter(({ id }) => !beforeIds.has(id));
    if (created.length === 1) return referenceFor(after, created[0]!.id, at, transactionId);
  }
  const candidates = actions.flatMap((action) => {
    if (action.type === "capture.create") return [action.capture.id];
    if (action.type === "plan.create") return [action.plan.id];
    if (action.type === "plan.step.add") return [action.step.id];
    if (action.type === "commitment.create") return [action.commitment.id];
    if (action.type === "journal.create") return [action.entry.id];
    if (action.type === "atmosphere.preset.create") return [action.preset.id];
    if (action.type === "memory.create") return [action.memory.id];
    if (action.type === "ritual.create") return [action.ritual.id];
    if (action.type === "step.schedule" || action.type === "commitment.schedule") return [action.eventId];
    if (action.type === "capture.update" || action.type === "capture.archive" || action.type === "capture.resolve") return [action.captureId];
    if (action.type === "plan.update") return [action.planId];
    if (action.type === "plan.step.update" || action.type === "plan.step.reorder" || action.type === "step.unschedule") return [action.stepId];
    if (action.type === "commitment.update") return [action.commitmentId];
    if (action.type === "journal.update" || action.type === "journal.segment.add" || action.type === "journal.bookmark.add" || action.type === "journal.bookmark.remove" || action.type === "journal.photo.attach" || action.type === "journal.photo.remove" || action.type === "journal.drawing.replace") return [action.entryId];
    if (action.type === "atmosphere.preset.update") return [action.presetId];
    if (action.type === "memory.update") return [action.memoryId];
    if (action.type === "ritual.update") return [action.ritualId];
    return [];
  });
  return candidates.length ? referenceFor(after, candidates.at(-1)!, at, transactionId) : undefined;
}

function calendarChangeFor(
  request: CalendarRequest,
  before: DayPlan,
  after: DayPlan,
  transactionId: string,
  at: string,
  transcript: string,
  source: TransactionSource,
  summary: string,
): ChangeRecord {
  const actions = request.actions.some(({ type }) => type === "recover") && !request.actions.some(({ type }) => type === "reflow")
    ? [...request.actions, { type: "reflow" as const, reason: "delay" as const }]
    : request.actions;
  return {
    transactionId, timestamp: at, summary,
    detail: "Tide preserved protected and anchored time.",
    transcript, source, actions, before, after,
  };
}

function compactTransactionRecord(record: LifeTransactionRecord | undefined) {
  if (!record) return undefined;
  const compact: LifeTransactionRecord = { ...record };
  delete compact.before;
  delete compact.after;
  if (compact.calendarChange) {
    compact.calendarChange = { ...compact.calendarChange };
    delete compact.calendarChange.before;
    delete compact.calendarChange.after;
  }
  return compact;
}

function hydrateTransactionRecord(record: LifeTransactionRecord | undefined, before: LifeDocument, after: LifeDocument) {
  if (!record) return undefined;
  return {
    ...record,
    before,
    after,
    ...(record.calendarChange ? { calendarChange: { ...record.calendarChange, before: before.calendar, after: after.calendar } } : {}),
  } satisfies LifeTransactionRecord;
}

const systemNow = () => new Date();

export function FlowEnvironmentProvider({ children, now = systemNow, weatherProvider }: { children: ReactNode; now?: () => Date; weatherProvider?: WeatherProvider }) {
  const initialRoute = routeFromPath(window.location.pathname, window.location.search);
  const reducedMotion = useReducedMotionPreference();
  const voiceWorldController = useVoiceWorld(initialRoute.route !== "home", reducedMotion);
  const reconcileVoiceWorld = voiceWorldController.reconcile;
  const [clockTime, setClockTime] = useState(now);
  const dateKey = localDateKey(clockTime);
  const [snapshot, setSnapshot] = useState<LifeSnapshot>(() => loadVisualRewardDemo(dateKey));
  const snapshotRef = useRef(snapshot);
  const [mutationCoordinator] = useState(() => new LifeMutationCoordinator());
  const [route, setRoute] = useState(initialRoute.route);
  const [pageNavigation, setPageNavigation] = useState<{ id: number; kind: "open" | "back" }>({ id: 0, kind: "open" });
  const [peopleView, setPeopleView] = useState<PeopleView>(initialRoute.peopleView);
  const [commitmentView, setCommitmentView] = useState<CommitmentViewState>(initialCommitmentView);
  const commitmentViewRef = useRef(commitmentView);
  const commandInputSequence = useRef(0);
  const latestCommitmentViewSequence = useRef(0);
  const [entityEditor, setEntityEditor] = useState<EntityEditor>();
  const editorSession = useRef(0);
  const [commandPresentation, setCommandPresentation] = useState(initialCommandPresentation);
  const commandPresentationRef = useRef(commandPresentation);
  const [activePlanId, setActivePlanId] = useState(initialRoute.planId);
  const [focusedEntityId, setFocusedEntityId] = useState<string>();
  const [selectedCalendarEventId, setSelectedCalendarEventId] = useState<string>();
  const [feedback, setFeedback] = useState<CommandFeedback>(readyFeedback);
  const [calendarFeedback, setCalendarFeedback] = useState<PlannerFeedback>(calendarReady);
  const [lastTranscript, setLastTranscript] = useState("");
  const [pending, setPending] = useState<PendingLifeChange>();
  const [nowQuery, setNowQuery] = useState<NowQuery | null>();
  const nowCandidates = useMemo(() => selectNowCandidates(snapshot.document, clockTime, nowQuery), [snapshot.document, clockTime, nowQuery]);
  const [nowExplanationOpen, setNowExplanationOpen] = useState(false);
  const [flowLiveStatus, setFlowLiveStatus] = useState<FlowLiveStatus>("sleeping");
  const [rewardPreferences, setRewardPreferencesState] = useState(readRewardPreferences);
  const rewardPreferencesRef = useRef(rewardPreferences);
  const [rewardDirector] = useState(() => new RewardDirector(readRewardPreferences()));
  const [reward, setReward] = useState<RewardRuntimeSnapshot>(() => rewardDirector.getSnapshot());
  const [calendarPreview, setCalendarPreview] = useState<{ base: LifeDocument; proposed: LifeDocument; request: CalendarRequest; source: TransactionSource }>();
  const [conversationContext, setConversationContext] = useState<LifeContext>({
    route: initialRoute.route,
    currentWorld: initialRoute.route,
    previousWorld: undefined,
    currentTimeScope: snapshot.temporal?.scope ?? { kind: "day", dateKey: snapshot.document.calendar.dateKey },
    peopleView: initialRoute.peopleView,
    focusedEntityId: undefined,
    activePlanId: initialRoute.planId,
    focusedPersonId: initialRoute.personId,
    focusedGroupId: initialRoute.groupId,
    activeVoiceNoteId: initialRoute.noteId,
    nowMs: now().getTime(),
    epoch: 0,
    turn: 0,
    activeMode: initialRoute.route === "journal" ? "journal-editing" : initialRoute.route === "memories" ? "memory-editing" : initialRoute.route === "atmosphere" ? "atmosphere-editing" : "command",
    recentRoutes: [initialRoute.route],
  });
  const conversationRef = useRef(conversationContext);
  const processedCommandIds = useRef<string[]>([]);
  // The kernel bridge (see productionBridge.ts) claims a narrow, growing
  // slice of the real conversation — memory, universal recall, Earmark
  // playback, the desktop companion, and a buffer-aware calendar move — and
  // falls through unchanged to the legacy interpreter below for everything
  // else. One persistent session for the provider's lifetime so
  // "yes"/"undo"/"open the second one" resolve against the SAME latest
  // kernel state across turns, exactly like the legacy pending/confirmation
  // state already does. Its `referents` (see kernel/session.ts) are the
  // ONE authoritative referent store for both legacy and kernel-recognized
  // commands — see kernelReferentBridge.ts for the two-way translation.
  const kernelSessionRef = useRef(createBridgeSession());
  const activeCommandId = useRef<string | undefined>(undefined);
  const nativeFeedbackEpoch = useRef(0);
  const activeCommandSource = useRef<TransactionSource | undefined>(undefined);
  const activeCommandIntent = useRef<GlobalIntent["type"] | undefined>(undefined);
  const activePageOpening = useRef(false);
  const acknowledgedVoiceCommandIds = useRef<string[]>([]);
  const routeRef = useRef(route); routeRef.current = route;
  const focusedEntityRef = useRef(focusedEntityId); focusedEntityRef.current = focusedEntityId;
  const selectedCalendarEventRef = useRef(selectedCalendarEventId); selectedCalendarEventRef.current = selectedCalendarEventId;
  const activePlanRef = useRef(activePlanId); activePlanRef.current = activePlanId;
  const pendingRef = useRef(pending); pendingRef.current = pending;
  const calendarPreviewRef = useRef(calendarPreview); calendarPreviewRef.current = calendarPreview;
  const temporalScope = snapshot.temporal?.scope ?? { kind: "day" as const, dateKey };

  useEffect(() => {
    const unsubscribe = rewardDirector.subscribe(setReward);
    return () => { unsubscribe(); rewardDirector.dispose(); };
  }, [rewardDirector]);
  useEffect(() => {
    // A desktop capability's execute() is synchronous by kernel design (see
    // desktopBridgeClient.ts) — it returns an immediate "pending" message,
    // and the real success/failure from the local companion arrives here,
    // asynchronously, as the small transient external-action acknowledgement
    // Part 11 asks for ("Opening VS Code" -> done), not a permanent card.
    //
    // This is also the one place the REAL file the companion touched
    // becomes a referent: runKernelTurn can only record the optimistic
    // "pending" response (see productionBridge.ts), since the actual path/
    // file list only exists once this promise resolves — without this,
    // "Open my latest PDF" -> "Show it in Finder" would have nothing real
    // to point "it" at.
    return desktopBridgeEvents.on((event) => {
      if (event.status === "pending") return;
      setFeedback({ phase: event.status === "ok" ? "completed" : "error", title: event.message });
      if (event.status !== "ok") return;
      if (event.capabilityId === "desktop.openFile" || event.capabilityId === "desktop.revealInFinder") {
        const opened = (event.data as { opened?: string } | undefined)?.opened;
        if (opened) kernelSessionRef.current = rememberSearchResults(kernelSessionRef.current, [fileReference(opened, opened.split("/").pop() ?? opened)], now().getTime());
      }
      if (event.capabilityId === "desktop.listRecentFiles") {
        const files = (event.data as { files?: RecentFileMeta[] } | undefined)?.files;
        if (files) kernelSessionRef.current = rememberSearchResults(kernelSessionRef.current, files.map(recentFileToReference), now().getTime());
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    reconcileVoiceWorld(feedback.phase, flowLiveStatus);
  // Each result completes its own presentation, including two consecutive
  // successful commands. The phase alone cannot identify a new result.
  }, [feedback, flowLiveStatus, reconcileVoiceWorld]);
  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === "hidden") rewardDirector.cancel("cancelled"); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [rewardDirector]);

  useEffect(() => {
    if (!readLifeSnapshot(dateKey)) saveLifeSnapshot(snapshotRef.current);
  }, [dateKey]);
  useEffect(() => {
    if (initialRoute.alias) window.history.replaceState(window.history.state, "", pathForRoute(initialRoute.route, initialRoute.planId, initialRoute.peopleView));
  // The initial route is intentionally evaluated exactly once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { conversationRef.current = conversationContext; }, [conversationContext]);
  useEffect(() => {
    const pendingType: LifeContext["pending"] = pending ? pending.capture || pending.media || pending.clarification || pending.friend?.kind === "recipient" || pending.friend?.kind === "calendar-message" && pending.friend.proposal.question ? "clarification" : "confirmation" : undefined;
    const next: LifeContext = { ...conversationRef.current, capturePrompt: Boolean(pending?.capture), pendingMedia: pending?.media, friendPending: Boolean(pending?.friend), friendPendingKind: pending?.friend?.kind, friendPrompt: pending?.friend?.kind === "marker-action" ? pending.friend.stage : pending?.friend?.kind === "friend-followup" || pending?.friend?.kind === "recipient" ? "friend" : undefined, pending: pendingType, pendingChoices: pending?.media ? [{ id: "playback", label: "Audio playback" }, { id: "recording", label: "Microphone recording" }] : (pending?.friend?.kind === "friend-followup" || pending?.friend?.kind === "recipient" || pending?.friend?.kind === "marker" || pending?.friend?.kind === "marker-action") ? pending.friend.choices : (pending?.friend?.kind === "calendar-message" || pending?.friend?.kind === "marker-calendar") ? pending.friend.proposal.choices : (pending?.clarification ?? pending?.alternatives?.clarification)?.choices };
    conversationRef.current = next; setConversationContext(next);
  }, [pending]);
  useEffect(() => {
    if (route !== "people" || peopleView !== "default") return;
    const recipient = conversationContext.focusedGroupId ? `group/${encodeURIComponent(conversationContext.focusedGroupId)}` : conversationContext.focusedPersonId ? `person/${encodeURIComponent(conversationContext.focusedPersonId)}` : "";
    const note = recipient && conversationContext.activeVoiceNoteId ? `/note/${encodeURIComponent(conversationContext.activeVoiceNoteId)}` : "";
    const path = `/people${recipient ? `/${recipient}${note}` : ""}`;
    if (window.location.pathname !== path) window.history.replaceState(window.history.state, "", path);
  }, [route, peopleView, conversationContext]);
  useEffect(() => {
    const onPop = () => {
      nativeFeedbackEpoch.current += 1;
      if (pendingRef.current?.friend || pendingRef.current?.capture || pendingRef.current?.media) { pendingRef.current = undefined; setPending(undefined); }
      const next = routeFromPath(window.location.pathname, window.location.search);
      setPageNavigation((current) => ({ id: current.id + 1, kind: "back" }));
      setRoute(next.route); setActivePlanId(next.planId); setPeopleView(next.peopleView);
      const context = {
        ...navigateConversation(conversationRef.current, next.route),
        currentWorld: next.route,
        previousWorld: conversationRef.current.currentWorld,
        peopleView: next.peopleView,
        activePlanId: next.planId,
        focusedPersonId: next.personId,
        focusedGroupId: next.groupId,
        activeVoiceNoteId: next.noteId,
        nowMs: now().getTime(),
      };
      conversationRef.current = context; setConversationContext(context);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [now]);

  const acknowledgeActiveVoice = useCallback((intent: GlobalIntent["type"] = activeCommandIntent.current ?? "calendar") => {
    const commandId = activeCommandId.current;
    if (activeCommandSource.current !== "voice" || !commandId || acknowledgedVoiceCommandIds.current.includes(commandId)) return;
    acknowledgedVoiceCommandIds.current = [...acknowledgedVoiceCommandIds.current.slice(-127), commandId];
    rewardDirector.emit({ type: "voice-understood", id: `${commandId}:understood`, at: now().getTime(), intent });
  }, [now, rewardDirector]);
  const navigateRoute = useCallback((next: LifeRoute, planId?: string, replace = false, requestedPeopleView?: PeopleView, acknowledge = true) => {
    if (!activeCommandId.current) nativeFeedbackEpoch.current += 1;
    if (pendingRef.current?.friend || pendingRef.current?.capture || pendingRef.current?.media) { pendingRef.current = undefined; setPending(undefined); }
    const actualRoute = canonicalRoute(next);
    const from = routeRef.current;
    const actualPeopleView: PeopleView = actualRoute === "people" ? requestedPeopleView ?? peopleView : "default";
    const path = pathForRoute(actualRoute, planId, actualPeopleView);
    const opensPage = actualRoute !== from || planId !== activePlanRef.current || actualPeopleView !== peopleView
      || !activeCommandId.current || activePageOpening.current;
    if (opensPage) {
      window.history[replace ? "replaceState" : "pushState"](replace ? window.history.state : {}, "", path);
      setPageNavigation((current) => ({ id: current.id + 1, kind: "open" }));
    }
    if (activeCommandId.current) recordCommandOutcome({ navigationAppliedAt: performance.now(), destinationRoute: path });
    if (activeCommandId.current && window.__FLOW_LOCKED_HOME__) {
      window.__FLOW_LOCKED_HOME__ = { ...window.__FLOW_LOCKED_HOME__, navigationAppliedAt: performance.now() };
    }
    setRoute(actualRoute); setActivePlanId(planId); setPeopleView(actualPeopleView);
    const context: LifeContext = {
      ...navigateConversation(conversationRef.current, actualRoute),
      currentWorld: actualRoute,
      previousWorld: conversationRef.current.currentWorld,
      peopleView: actualPeopleView,
      activePlanId: planId,
      nowMs: now().getTime(),
      turn: (conversationRef.current.turn ?? 0) + 1,
      activeMode: actualRoute === "journal" ? "journal-editing" : actualRoute === "memories" ? "memory-editing" : actualRoute === "atmosphere" ? "atmosphere-editing" : "command",
      recentRoutes: [...(conversationRef.current.recentRoutes ?? []), actualRoute].slice(-8),
    };
    setFocusedEntityId(context.focusedEntityId);
    setSelectedCalendarEventId(context.selected?.kind === "calendar-event" ? context.selected.id : undefined);
    conversationRef.current = context; setConversationContext(context); setFeedback(readyFeedback);
    if (acknowledge && from !== actualRoute) {
      const commandSource = activeCommandSource.current;
      const source = commandSource === "voice" ? "voice" : commandSource === "type" ? "typed" : "pointer";
      acknowledgeActiveVoice();
      rewardDirector.emit({ type: "world-opened", id: `world-${now().getTime()}-${actualRoute}`, at: now().getTime(), from, to: actualRoute, source });
    }
  }, [acknowledgeActiveVoice, now, peopleView, rewardDirector]);
  // A shared flight's destination is part of its already-committed action,
  // not a second navigation request that may replace the transaction reward.
  const navigateTransition = useCallback((next: LifeRoute, planId?: string, replace = false, requestedPeopleView?: PeopleView) => {
    navigateRoute(next, planId, replace, requestedPeopleView, false);
  }, [navigateRoute]);
  const { transition, beginTransition, cancelTransition } = useLifeTransition(navigateTransition);
  const navigate = useCallback((next: LifeRoute, planId?: string, replace = false, requestedPeopleView?: PeopleView) => {
    cancelTransition();
    navigateRoute(next, planId, replace, requestedPeopleView);
  }, [cancelTransition, navigateRoute]);

  const adoptSnapshot = useCallback((next: LifeSnapshot, announce = false) => {
    if (next.revision <= snapshotRef.current.revision) return false;
    snapshotRef.current = next; setSnapshot(next);
    pendingRef.current = undefined; calendarPreviewRef.current = undefined;
    setPending(undefined); setCalendarPreview(undefined); cancelTransition(); rewardDirector.cancel("cancelled");
    setCalendarFeedback(calendarReady); setNowQuery(undefined); setNowExplanationOpen(false);
    const retainedPlanId = activePlanRef.current && next.document.plans.some(({ id }) => id === activePlanRef.current)
      ? activePlanRef.current : undefined;
    activePlanRef.current = retainedPlanId; setActivePlanId(retainedPlanId);
    focusedEntityRef.current = undefined; selectedCalendarEventRef.current = undefined;
    setFocusedEntityId(undefined); setSelectedCalendarEventId(undefined);
    const context: LifeContext = {
      ...clearGenericConversation({ ...conversationRef.current, route: routeRef.current, activePlanId: retainedPlanId, nowMs: now().getTime() }),
      currentTimeScope: next.temporal?.scope ?? { kind: "day", dateKey: next.document.calendar.dateKey },
      pending: undefined, pendingChoices: undefined, lastCreatedEntityId: undefined,
    };
    conversationRef.current = context; setConversationContext(context);
    if (announce) setFeedback({ phase: "completed", title: "Updated from another Flow tab", detail: "The latest document and exact history are now active here." });
    return true;
  }, [cancelTransition, now, rewardDirector]);

  const syncFromStorage = useCallback((announce = false) => {
    if (readLifeSnapshotRevision() === snapshotRef.current.revision) return false;
    const latest = readLifeSnapshot(dateKey);
    return latest ? adoptSnapshot(latest, announce) : false;
  }, [adoptSnapshot, dateKey]);

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === LIFE_STORAGE_KEY && event.newValue) syncFromStorage(true);
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [syncFromStorage]);

  function persistSnapshot(next: LifeSnapshot, expectedRevision: number) {
    if (!saveLifeSnapshot(next, expectedRevision)) {
      syncFromStorage(true);
      setFeedback({ phase: "error", title: "Another Flow tab changed this first", detail: "The latest complete document is active. Repeat the command if it is still needed." });
      return false;
    }
    snapshotRef.current = next;
    setSnapshot(next);
    return true;
  }

  useEffect(() => {
    const tick = () => setClockTime(now());
    const timer = window.setInterval(tick, 30_000);
    window.addEventListener("focus", tick);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", tick); };
  }, [now]);

  useEffect(() => {
    if (snapshotRef.current.temporal?.todayDateKey === dateKey) return;
    void mutationCoordinator.run(() => {
      const current = snapshotRef.current;
      const temporal = rolloverTemporal(current.temporal, dateKey, current.document.calendar.dateKey, current.document.preferences.weekStartsOn);
      const next = { ...current, revision: current.revision + 1, temporal, document: projectCalendarDate(current.document, temporal.scope.dateKey) };
      if (!persistSnapshot(next, current.revision)) return;
      const context = { ...conversationRef.current, currentTimeScope: temporal.scope, nowMs: now().getTime() };
      conversationRef.current = context; setConversationContext(context);
    });
    // The date boundary adopts the existing CAS owner; it never adds history
    // or rehydrates a live recording as if the application had reloaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey, mutationCoordinator]);

  function recordInstinctExposure(instinctIds: string[]) {
    const current = snapshotRef.current;
    const next = projectInstinctExposure(current, instinctIds, now());
    if (next !== current) persistSnapshot(next, current.revision);
  }

  const setTemporalScope = useCallback((scope: TemporalScope, transcript?: string) => {
    const current = snapshotRef.current;
    const previousScope = current.temporal?.scope ?? { kind: "day" as const, dateKey };
    const next = temporalScopeTransition(current, scope, dateKey);
    if (next === current) {
      setFeedback({ phase: "completed", title: "You’re already here", detail: scope.kind === "week" ? "This week is in view." : "That day is in view.", ...(transcript ? { transcript } : {}) });
      return;
    }
    if (!persistSnapshot(next, current.revision)) return;
    pendingRef.current = undefined; calendarPreviewRef.current = undefined;
    setPending(undefined); setCalendarPreview(undefined); setSelectedCalendarEventId(undefined);
    const context = { ...conversationRef.current, currentTimeScope: scope, nowMs: now().getTime(), turn: (conversationRef.current.turn ?? 0) + 1 };
    conversationRef.current = context; setConversationContext(context);
    setFeedback({ phase: "completed", title: scope.kind === "week" ? "This week" : "Day changed", detail: "Today, Focus, Weather, People, and Good to know moved together.", ...(transcript ? { transcript } : {}) });
    const commandSource = activeCommandSource.current;
    acknowledgeActiveVoice();
    rewardDirector.emit({ type: "time-scope-changed", id: `scope-${now().getTime()}-${scope.kind}-${scope.dateKey}`, at: now().getTime(), from: previousScope, to: scope, source: commandSource === "voice" ? "voice" : commandSource === "type" ? "typed" : "pointer" });
  // `persistSnapshot` intentionally remains the single revision/CAS boundary.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey, now, rewardDirector]);

  useEffect(() => {
    const current = snapshotRef.current;
    const requestTime = now().getTime();
    const missing = Array.from({ length: 14 }, (_, index) => dateKeyAfter(dateKey, index))
      .filter((key) => {
        const observation = current.document.environment.weatherByDate[key];
        return !observation || !observation.validUntil || new Date(observation.validUntil).getTime() <= requestTime;
      });
    if (!missing.length) return;
    if (!weatherProvider && (typeof fetch !== "function" || window.isSecureContext !== true)) return;
    const controller = new AbortController();
    const provider = weatherProvider ?? createOpenMeteoProvider(current.document.environment.location, now);
    void provider.load(missing, controller.signal).then((observations) => {
      if (!observations.length) return;
      const latest = snapshotRef.current;
      const result = applyLifeTransaction(latest.document, observations.map((observation) => ({ type: "weather.replace" as const, observation })), now);
      if (result.status !== "success") return;
      const next = { ...latest, revision: latest.revision + 1, document: result.document };
      persistSnapshot(next, latest.revision);
    }).catch(() => undefined);
    return () => controller.abort();
  // Weather enrichment is ambient and never enters user undo history.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey, weatherProvider]);

  useEffect(() => {
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const hasPresentation = rewardDirector.getSnapshot().active;
      if (!pending && !calendarPreview && !hasPresentation) return;
      event.preventDefault(); cancelTransition(); rewardDirector.cancel("cancelled");
      if (!pending && !calendarPreview) return;
      const hadPreview = Boolean(calendarPreview);
      pendingRef.current = undefined; calendarPreviewRef.current = undefined;
      setPending(undefined); setCalendarPreview(undefined); setCalendarFeedback(calendarReady);
      setFeedback({ phase: "completed", title: hadPreview ? "Preview cancelled" : "Cancelled", detail: "Nothing changed." });
    }
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [pending, calendarPreview, cancelTransition, rewardDirector]);

  function commit(actions: LifeAction[], transcript: string, source: TransactionSource, summary?: string, transitionIntent?: Omit<ActiveLifeTransition, "beat"> & { route: LifeRoute; planId?: string; peopleView?: PeopleView }, backgroundRecording = false) {
    if (!backgroundRecording) patchCommandTrace(activeCommandId.current ?? window.__FLOW_COMMAND_TRACE__?.commandId, { actions });
    const current = snapshotRef.current;
    const activePreview = calendarPreviewRef.current;
    const requestAction = actions.length === 1 && actions[0]?.type === "calendar.request" ? actions[0] : undefined;
    const previewControl = requestAction?.request.actions.length === 1 ? requestAction.request.actions[0] : undefined;
    if (previewControl?.type === "reset") return commit([{ type: "calendar.replace", plan: createInitialLifePlan(current.document.calendar.dateKey) }], transcript, source, "The starting day was restored.");
    if (previewControl?.type === "cancelPreview") {
      calendarPreviewRef.current = undefined; setCalendarPreview(undefined); setFeedback({ phase: "completed", title: "Preview cancelled", detail: "Nothing changed.", transcript });
      setCalendarFeedback(calendarReady); return false;
    }
    if (previewControl?.type === "commitPreview") {
      if (!activePreview) { setFeedback({ phase: "completed", title: "No preview to apply", detail: "Start with “What if…” first.", transcript }); return false; }
      return commit([{ type: "calendar.request", request: { ...activePreview.request, mode: "commit" } }], activePreview.request.transcript, activePreview.source);
    }
    if (previewControl?.type === "adjustPreview") {
      if (!activePreview) { setFeedback({ phase: "completed", title: "No preview to adjust", detail: "Start with “What if…” first.", transcript }); return false; }
      const adjusted = adjustPreviewRequest({ basePlan: activePreview.base.calendar, proposedPlan: activePreview.proposed.calendar, request: activePreview.request, summary: "Preview", detail: "Nothing committed.", source: activePreview.source }, previewControl);
      return commit([{ type: "calendar.request", request: adjusted }], transcript, source);
    }
    if (requestAction?.request.mode === "preview") {
      const previewResult = applyLifeTransaction(current.document, actions, now);
      if (previewResult.status !== "success") {
        setFeedback({ phase: previewResult.status === "clarification" ? "clarification" : "error", title: previewResult.title, detail: previewResult.detail, transcript });
        return false;
      }
      setCalendarPreview({ base: current.document, proposed: previewResult.document, request: requestAction.request, source });
      calendarPreviewRef.current = { base: current.document, proposed: previewResult.document, request: requestAction.request, source };
      const changedIds = changedCalendarIds(current.document.calendar, previewResult.document.calendar);
      setCalendarFeedback({ phase: "completed", title: "Preview — nothing committed", summary: previewResult.summary, detail: "Say “Do it” or “Cancel that preview”.", transcript, changedIds });
      setFeedback({ phase: "completed", title: "Preview — nothing committed", detail: "Say “Do it” or “Cancel that preview”.", transcript });
      return false;
    }
    const result = applyLifeTransaction(current.document, actions, now);
    if (backgroundRecording && (result.status !== "success" || JSON.stringify(current.document) === JSON.stringify(result.document))) return false;
    if (result.status !== "success") {
      if (result.status === "confirmation" && result.calendarRequest) {
        const nextPending = { actions: [{ ...requestAction, type: "calendar.request" as const, request: result.calendarRequest, confirmed: result.authorizationKey }], baseRevision: current.revision, transcript, source, summary: result.title, confirmLabel: result.confirmLabel };
        pendingRef.current = nextPending; setPending(nextPending);
        setFeedback({ phase: "confirmation", title: result.title, detail: result.detail, transcript });
      } else if (result.status === "clarification" && result.calendarRequest && result.clarification) {
        const nextPending = { actions: [], transcript, source, summary: result.title, calendarRequest: result.calendarRequest, clarification: result.clarification };
        pendingRef.current = nextPending; setPending(nextPending);
        setFeedback({ phase: "clarification", title: result.title, detail: result.detail, transcript });
      } else {
        setFeedback({ phase: result.status === "clarification" ? "clarification" : "error", title: result.title, detail: result.detail, transcript });
      }
      return false;
    }
    if (JSON.stringify(current.document) === JSON.stringify(result.document)) {
      setFeedback({ phase: "completed", title: "No change needed", detail: result.summary, transcript });
      return false;
    }
    const transactionId = activeCommandId.current ?? `tx-${Date.now()}-${current.past.length + 1}`;
    const transactionAt = now().toISOString();
    const primaryEntity = primaryEntityForActions(actions, current.document, result.document, now().getTime(), transactionId);
    const facts = deriveRewardFacts(current.document, result.document, actions);
    const record: LifeTransactionRecord = {
      id: transactionId, at: transactionAt, source, transcript,
      summary: summary ?? result.summary, before: current.document, after: result.document, actionTypes: actions.map(({ type }) => type),
      ...(facts[0] ? { rewardFactType: facts[0].type } : {}),
      ...(primaryEntity ? { primaryEntity } : {}),
    };
    if (requestAction) {
      record.calendarChange = calendarChangeFor(
        requestAction.request,
        current.document.calendar,
        result.document.calendar,
        transactionId,
        transactionAt,
        transcript,
        source,
        record.summary,
      );
    }
    const previousRecord = compactTransactionRecord(current.lastTransaction);
    const scope = current.temporal?.scope;
    const revealCalendarTarget = scope?.kind === "week" || requestAction?.request.actions.some(({ type }) => type === "create" || type === "fit");
    const revealScope = revealCalendarTarget && primaryEntity?.kind === "calendar-event" && scope && ["today", "calendar"].includes(routeRef.current)
      ? committedCalendarScope(result.document, scope, primaryEntity.id) : scope;
    const revealedDocument = revealScope && revealScope !== scope ? projectCalendarDate(result.document, revealScope.dateKey) : result.document;
    const temporal = revealScope && revealScope !== scope ? { ...current.temporal!, scope: revealScope, previousScope: scope } : current.temporal;
    record.after = revealedDocument;
    const next: LifeSnapshot = { revision: current.revision + 1, document: revealedDocument, temporal, past: [...current.past, { document: current.document, ...(previousRecord ? { lastTransaction: previousRecord } : {}) }], future: [], lastTransaction: record };
    if (!persistSnapshot(next, current.revision)) return false;
    const recordingAction = actions.find((action) => action.type === "journal.update" || action.type === "voice-note.update" || action.type === "recording.segment.add" || action.type === "recording.markers.replace");
    const recordingId = recordingAction?.type === "journal.update" ? recordingAction.entryId : recordingAction?.type === "voice-note.update" ? recordingAction.noteId : recordingAction?.type === "recording.segment.add" || recordingAction?.type === "recording.markers.replace" ? recordingAction.target.id : undefined;
    patchCommandTrace(backgroundRecording ? recordingId ? recordingCommandId(recordingId) : undefined : activeCommandId.current ?? window.__FLOW_COMMAND_TRACE__?.commandId, { committedAt: performance.now(), actualActions: actions, transactionId });
    // Native finalization saves its owned bytes through this same CAS/history
    // boundary without taking a newer command's prompt, selection, or reward.
    if (backgroundRecording) return true;
    recordCommandOutcome({ committedAt: performance.now() });
    if (activeCommandId.current && window.__FLOW_LOCKED_HOME__) {
      window.__FLOW_LOCKED_HOME__ = { ...window.__FLOW_LOCKED_HOME__, mutationCommittedAt: performance.now() };
    }
    acknowledgeActiveVoice();
    rewardDirector.emit({ type: "transaction-committed", id: transactionId, at: new Date(transactionAt).getTime(), source, facts });
    pendingRef.current = undefined; setPending(undefined);
    if (primaryEntity) {
      const createsEntity = actions.some((action) => ["capture.create", "plan.create", "plan.step.add", "commitment.create", "journal.create", "atmosphere.preset.create", "memory.create", "ritual.create"].includes(action.type));
      const context = {
        ...conversationRef.current,
        ...(revealScope ? { currentTimeScope: revealScope } : {}),
        focusedEntityId: primaryEntity.id,
        selected: primaryEntity,
        lastReferenced: primaryEntity,
        lastChanged: primaryEntity,
        ...(createsEntity ? { lastCreated: primaryEntity, lastCreatedEntityId: primaryEntity.id } : {}),
        captureMode: false,
        nowMs: now().getTime(),
        lastReferencedEntityId: primaryEntity.id,
        lastChangedEntityId: primaryEntity.id,
        lastCommittedActionId: transactionId,
        turn: (conversationRef.current.turn ?? 0) + 1,
        recentActionTypes: [...(conversationRef.current.recentActionTypes ?? []), ...actions.map(({ type }) => type)].slice(-16),
        lastTargets: [primaryEntity],
      };
      conversationRef.current = context; setConversationContext(context); setFocusedEntityId(primaryEntity.id);
      if (primaryEntity.kind === "calendar-event") setSelectedCalendarEventId(primaryEntity.id);
    }
    const reshapedCalendar = Boolean(record.calendarChange) || actions.some(({ type }) => type === "step.schedule" || type === "commitment.schedule");
    setFeedback({
      phase: "completed",
      title: reshapedCalendar ? "Day reshaped" : record.summary,
      detail: reshapedCalendar ? `${record.summary} One undo restores the exact previous state.` : "One undo restores the exact previous state.",
      transcript,
    });
    if (record.calendarChange) {
      setCalendarFeedback(replayFeedback(
        "Day reshaped",
        record.summary,
        record.calendarChange,
        current.document.calendar,
        result.document.calendar,
      ));
    } else if (actions.some(({ type }) => type === "step.schedule")) {
      const changedIds = changedCalendarIds(current.document.calendar, result.document.calendar);
      setCalendarFeedback({ phase: "completed", title: "Day reshaped", summary: record.summary, detail: "Tide preserved every anchor.", changedIds, transactionId: record.id });
    }
    calendarPreviewRef.current = undefined; setCalendarPreview(undefined);
    if (transitionIntent) beginTransition(transitionIntent, transitionIntent.route, transitionIntent.planId);
    return true;
  }

  function applyUndo(transcript?: string) {
    rewardDirector.cancel("cancelled");
    const current = snapshotRef.current;
    const prior = current.past.at(-1);
    if (!prior) return setFeedback({ phase: "completed", title: "Nothing to undo", detail: "This is the earliest saved state.", ...(transcript ? { transcript } : {}) });
    const restored = projectCalendarDate(prior.document, current.temporal?.scope.kind === "week" ? prior.document.calendar.dateKey : current.temporal?.scope.dateKey ?? prior.document.calendar.dateKey);
    const restoredRecord = hydrateTransactionRecord(prior.lastTransaction, current.past.at(-2)?.document ?? prior.document, prior.document);
    const futureRecord = compactTransactionRecord(current.lastTransaction);
    const next: LifeSnapshot = { revision: current.revision + 1, document: restored, temporal: current.temporal, ...(restoredRecord ? { lastTransaction: restoredRecord } : {}), past: current.past.slice(0, -1), future: [...current.future, { document: current.document, ...(futureRecord ? { lastTransaction: futureRecord } : {}) }] };
    if (!persistSnapshot(next, current.revision)) return;
    acknowledgeActiveVoice();
    const originalRewardType = current.lastTransaction
      ? current.lastTransaction.rewardFactType as RewardFact["type"] | undefined ?? (current.lastTransaction.before && current.lastTransaction.after ? deriveRewardFacts(current.lastTransaction.before, current.lastTransaction.after, []).at(0)?.type : undefined)
      : undefined;
    rewardDirector.emit({ type: "history-restored", id: `undo-${now().getTime()}-${current.revision}`, at: now().getTime(), direction: "undo", ...(originalRewardType ? { originalRewardType } : {}) });
    pendingRef.current = undefined; calendarPreviewRef.current = undefined;
    setPending(undefined); cancelTransition(); setCalendarPreview(undefined);
    const context = clearGenericConversation({ ...conversationRef.current, nowMs: now().getTime() });
    conversationRef.current = context; setConversationContext(context); setFocusedEntityId(undefined); setSelectedCalendarEventId(undefined);
    setFeedback({ phase: "completed", title: "Change undone", detail: "The exact life document and every relationship were restored.", ...(transcript ? { transcript } : {}) });
    if (current.lastTransaction?.calendarChange) {
      setCalendarFeedback(replayFeedback(
        "Calendar change undone",
        current.lastTransaction.summary,
        current.lastTransaction.calendarChange,
        current.document.calendar,
        restored.calendar,
      ));
    }
  }

  function applyRedo(transcript?: string) {
    rewardDirector.cancel("cancelled");
    const current = snapshotRef.current;
    const later = current.future.at(-1);
    if (!later) return setFeedback({ phase: "completed", title: "Nothing to redo", detail: "There is no newer state.", ...(transcript ? { transcript } : {}) });
    const restored = projectCalendarDate(later.document, current.temporal?.scope.kind === "week" ? later.document.calendar.dateKey : current.temporal?.scope.dateKey ?? later.document.calendar.dateKey);
    const restoredRecord = hydrateTransactionRecord(later.lastTransaction, current.document, later.document);
    const previousRecord = compactTransactionRecord(current.lastTransaction);
    const next: LifeSnapshot = { revision: current.revision + 1, document: restored, temporal: current.temporal, ...(restoredRecord ? { lastTransaction: restoredRecord } : {}), past: [...current.past, { document: current.document, ...(previousRecord ? { lastTransaction: previousRecord } : {}) }], future: current.future.slice(0, -1) };
    if (!persistSnapshot(next, current.revision)) return;
    acknowledgeActiveVoice();
    const originalRewardType = later.lastTransaction
      ? later.lastTransaction.rewardFactType as RewardFact["type"] | undefined ?? (later.lastTransaction.before && later.lastTransaction.after ? deriveRewardFacts(later.lastTransaction.before, later.lastTransaction.after, []).at(0)?.type : undefined)
      : undefined;
    rewardDirector.emit({ type: "history-restored", id: `redo-${now().getTime()}-${current.revision}`, at: now().getTime(), direction: "redo", ...(originalRewardType ? { originalRewardType } : {}) });
    pendingRef.current = undefined; calendarPreviewRef.current = undefined;
    setPending(undefined); setCalendarPreview(undefined);
      const context = restoreConversationFromTransaction(conversationRef.current, later.lastTransaction, restored, now().getTime());
    conversationRef.current = context; setConversationContext(context); setFocusedEntityId(context.focusedEntityId);
    setSelectedCalendarEventId(context.selected?.kind === "calendar-event" ? context.selected.id : undefined);
    setFeedback({ phase: "completed", title: "Change redone", detail: "The exact transaction and every relationship were restored.", ...(transcript ? { transcript } : {}) });
    if (later.lastTransaction?.calendarChange) {
      setCalendarFeedback(replayFeedback(
        "Calendar change redone",
        later.lastTransaction.summary,
        later.lastTransaction.calendarChange,
        current.document.calendar,
        restored.calendar,
      ));
    }
  }

  function deliverCommittedMessage(message: FriendMessage, activePending: PendingLifeChange) {
        const deliveryCommandId = activePending.commandId ?? window.__FLOW_COMMAND_TRACE__?.commandId;
        patchCommandTrace(deliveryCommandId, { delivery: { status: "sending", messageId: message.id, messageRevision: message.revision } });
        pendingRef.current = undefined; setPending(undefined);
        const responseEpoch = nativeFeedbackEpoch.current;
        setFeedback({ phase: "understanding", title: "Delivering locally", detail: "Saving this exact draft to the Flow-local inbox." });
        void deliverMessage(message).then((receipt) => {
          patchCommandTrace(deliveryCommandId, { delivery: { status: "delivered", messageId: message.id, messageRevision: message.revision, receiptId: receipt.id, transport: receipt.transport, scope: receipt.scope } });
          if (responseEpoch === nativeFeedbackEpoch.current) setFeedback({ phase: "completed", title: receipt.label, detail: "Saved in this browser's Friends inbox. No external service was used." });
        }).catch((error: unknown) => {
          patchCommandTrace(deliveryCommandId, { delivery: { status: "failed", messageId: message.id, messageRevision: message.revision, error: error instanceof Error ? error.message : String(error) } });
          if (responseEpoch !== nativeFeedbackEpoch.current) return;
          const waiting = { ...activePending, baseRevision: snapshotRef.current.revision };
          pendingRef.current = waiting; setPending(waiting);
          setFeedback({ phase: "error", title: message.calendarEventId ? "Calendar saved; message was not delivered" : "Message was not delivered", detail: error instanceof Error ? error.message : "Retry this exact draft." });
        });
  }

  function applyConfirm() {
    const activePreview = calendarPreviewRef.current;
    const activePending = pendingRef.current;
    if (activePreview) return commit([{ type: "calendar.request", request: { ...activePreview.request, mode: "commit" } }], activePreview.request.transcript, activePreview.source);
    if (!activePending) return setFeedback({ phase: "completed", title: "Nothing to confirm", detail: "No destructive change is waiting." });
    if (activePending.capture) return setFeedback({ phase: "clarification", title: "What should I capture?", detail: "Say the content first, or cancel this question." });
    if (activePending.media) return setFeedback({ phase: "clarification", title: "Audio playback or microphone recording?", detail: "Say which one should change. Both are unchanged." });
    if (activePending.baseRevision !== undefined && activePending.baseRevision !== snapshotRef.current.revision) {
      pendingRef.current = undefined; setPending(undefined);
      return setFeedback({ phase: "clarification", title: "The item changed since that preview.", detail: "Repeat the request to review the current item. Nothing was changed." });
    }
    if (activePending.friend) {
      const authority = activePending.friend;
      if (authority.expiresAt < now().getTime()) { cancel(); return setFeedback({ phase: "clarification", title: "That preview expired", detail: "Review the current draft before continuing." }); }
      if (authority.kind === "reply-dictation") return setFeedback({ phase: "clarification", title: "What would you like to reply?", detail: "Say your words first. No reply has been drafted or sent." });
      if (authority.kind === "friend-followup" || authority.kind === "recipient" || authority.kind === "marker" || authority.kind === "marker-action") return setFeedback({ phase: "clarification", title: "Choose a person first", detail: authority.choices.map(({ label }) => label).join(" · ") });
      if (authority.kind === "marker-calendar" && authority.proposal.question) return setFeedback({ phase: "clarification", title: authority.proposal.question, detail: authority.proposal.detail });
      if (authority.kind === "voice-edit") {
        const note = snapshotRef.current.document.friends?.voiceNotes.find(({ id }) => id === authority.noteId);
        if (!note || note.audioAssetId !== authority.assetId) return;
        const epoch = nativeFeedbackEpoch.current, revision = snapshotRef.current.revision;
        const isCurrent = () => nativeFeedbackEpoch.current === epoch && snapshotRef.current.revision === revision;
        pendingRef.current = undefined; setPending(undefined);
        setFeedback({ phase: "understanding", title: "Preparing edited audio", detail: "The private original is retained until the edited file is verified." });
        void import("../features/studio/audioClip").then(({ exportAudioClip }) => exportAudioClip(authority.assetId, 0, authority.cutAtMs, `voice-edit-${crypto.randomUUID()}`, isCurrent, "voice-note-audio")).then(async (clip) => {
          try {
            if (!isCurrent()) return;
            await mutationCoordinator.run(() => {
              syncFromStorage(false); if (!isCurrent()) return;
              const segments = note.transcriptSegments.filter(({ endMs }) => endMs <= authority.cutAtMs);
              commit([{ type: "media.register", asset: clip.asset }, { type: "voice-note.update", noteId: note.id, patch: { audioAssetId: clip.asset.id, originalAudioAssetId: note.originalAudioAssetId ?? authority.assetId, recordingDurationMs: clip.durationMs, transcriptSegments: segments, text: segments.map(({ text }) => text).join(" "), markers: note.markers.filter(({ endMs }) => endMs <= authority.cutAtMs) } }], activePending.transcript, activePending.source, "Last part removed from this draft's audio and text.");
            });
          } finally { clip.release(); }
        }).catch((error: unknown) => { if (nativeFeedbackEpoch.current === epoch) setFeedback({ phase: "clarification", title: "Audio edit was not applied", detail: error instanceof Error ? error.message : "The original draft remains unsent and unchanged." }); });
        return;
      }
      if (authority.kind === "calendar-message") {
        if (authority.proposal.question) return setFeedback({ phase: "clarification", title: authority.proposal.question, detail: authority.proposal.choices.map(({ label }) => label).join(" · ") || authority.proposal.detail });
        if (!commit(activePending.actions, activePending.transcript, activePending.source, activePending.summary)) return;
        if (authority.deliver === false) return;
        const message = snapshotRef.current.document.friends?.messages.find(({ id }) => id === authority.message.id);
        if (message) deliverCommittedMessage(message, { ...activePending, actions: [], baseRevision: snapshotRef.current.revision, confirmLabel: "Retry locally", friend: { kind: "message", messageId: message.id, messageRevision: message.revision, expiresAt: now().getTime() + 120_000 } });
        return;
      }
      if (authority.kind === "unknown-person") {
        if (!authority.query.trim()) return setFeedback({ phase: "clarification", title: "Who is this for?", detail: "Name a person in Friends." });
        const person = canonicalPerson({ id: `person-${crypto.randomUUID()}`, kind: "person", name: authority.query, createdAt: now().toISOString(), updatedAt: now().toISOString() });
        if (commit([{ type: "person.create", person }], activePending.transcript, activePending.source, `Added ${personLabel(person)} to Friends`)) createCurrentCommandRunner()(activePending.transcript, activePending.source, `friend-resume-${crypto.randomUUID()}`, { resolution: { intent: { ...authority.intent, resolvedPersonId: person.id }, candidates: [] }, presented: false });
        return;
      }
      if (authority.kind === "message") {
        const message = snapshotRef.current.document.friends?.messages.find(({ id }) => id === authority.messageId);
        if (!message || message.revision !== authority.messageRevision || (!message.body.trim() && !message.attachment)) return setFeedback({ phase: "clarification", title: "What should the message say?", detail: "Add the message before sending." });
        deliverCommittedMessage(message, activePending);
        return;
      }
    }
    if (activePending.nativeContinuation) {
      const display = nativeContinuationPresentation(activePending.nativeContinuation);
      return setFeedback({ phase: "confirmation", title: display.label, detail: display.detail, transcript: activePending.transcript });
    }
    const committed = commit(activePending.actions, activePending.transcript, activePending.source, activePending.summary);
    const responseEpoch = nativeFeedbackEpoch.current;
    if (committed) for (const runtime of activePending.runtimeCommands ?? []) {
      if (runtime.target === "journal") window.dispatchEvent(new CustomEvent("flow-journal-runtime", { detail: { ...runtime, stateCommitted: true } }));
      else void requestStudioPlayback(runtime, () => responseEpoch === nativeFeedbackEpoch.current).catch((error: unknown) => {
        if (responseEpoch === nativeFeedbackEpoch.current) setFeedback({ phase: "error", title: "Change saved; playback could not start", detail: error instanceof Error ? error.message : "Use the original audio control and try again.", transcript: activePending.transcript });
      });
    }
  }
  function continueNative() {
    const waiting = pendingRef.current;
    if (!waiting?.nativeContinuation) return;
    const current = snapshotRef.current;
    const responseEpoch = ++nativeFeedbackEpoch.current;
    if (waiting.baseRevision !== current.revision || !nativeContinuationAvailable(waiting.nativeContinuation, current.document)) {
      pendingRef.current = undefined; setPending(undefined);
      setFeedback({ phase: "clarification", title: "That native request is no longer current.", detail: "Repeat the request for the current source. Nothing was attached or exported." });
      return;
    }
    // Begin in this click's browser activation, not the asynchronous mutation lock.
    pendingRef.current = undefined; setPending(undefined);
    void performNativeStudioContinuation(waiting.nativeContinuation, current.document, () => responseEpoch === nativeFeedbackEpoch.current).then((detail) => {
      if (responseEpoch !== nativeFeedbackEpoch.current) return;
      setFeedback({ phase: "completed", title: "Browser action requested", detail, transcript: waiting.transcript });
    }).catch((error: unknown) => {
      if (responseEpoch === nativeFeedbackEpoch.current) setFeedback({ phase: "error", title: "Browser action could not finish", detail: error instanceof Error ? error.message : "Try the visible native control again.", transcript: waiting.transcript });
    });
  }
  /** A real pointer gesture uses the same preflight and bound continuation as
   * speech. It need not wait behind a document mutation lock: this writes no data. */
  function requestNativeStudio(intent: NativeStudioIntent) {
    const inputSequence = ++commandInputSequence.current;
    latestCommitmentViewSequence.current = inputSequence; nativeFeedbackEpoch.current += 1;
    const commandId = `native-control-${Date.now()}-${inputSequence}`;
    const previous = pendingRef.current;
    activeCommandId.current = commandId; activeCommandSource.current = "quick";
    try {
      createCurrentCommandRunner(undefined, inputSequence)(intent.type.replaceAll("-", " "), "quick", commandId, { resolution: { intent, candidates: [] }, presented: false, fromGesture: true });
      if (pendingRef.current !== previous && pendingRef.current?.nativeContinuation) continueNative();
    } finally { activeCommandId.current = undefined; activeCommandSource.current = undefined; activeCommandIntent.current = undefined; }
  }
  function cancel() {
    nativeFeedbackEpoch.current += 1;
    const hadPreview = Boolean(calendarPreviewRef.current);
    pendingRef.current = undefined; calendarPreviewRef.current = undefined;
    setPending(undefined); setCalendarPreview(undefined); cancelTransition(); rewardDirector.cancel("cancelled"); setFeedback({ phase: "completed", title: hadPreview ? "Preview cancelled" : "Cancelled", detail: "Nothing changed." });
  }
  function applyPendingSelection(choiceId: string, choiceTranscript?: string) {
    const activePending = pendingRef.current;
    if (activePending?.media) {
      const authority = activePending.media;
      if (authority.expiresAt < now().getTime() || activePending.baseRevision !== snapshotRef.current.revision || conversationRef.current.activeJournalEntryId !== authority.entryId || routeRef.current !== "journal" || !["playback", "recording"].includes(choiceId)) {
        pendingRef.current = undefined; setPending(undefined); setFeedback({ phase: "clarification", title: "That audio choice is no longer current", detail: "Repeat the command for the recording now open. Neither source changed." }); return;
      }
      const intent: GlobalIntent = choiceId === "recording" ? { type: "journal-recording", mode: authority.mode } : { type: "journal-playback", mode: authority.mode === "resume" ? "play" : authority.mode };
      createCurrentCommandRunner()(choiceTranscript ?? choiceId, activePending.source, `media-choice-${crypto.randomUUID()}`, { resolution: { intent, candidates: [] }, presented: false }); return;
    }
    if (activePending?.friend?.kind === "friend-followup") {
      const authority = activePending.friend;
      if (authority.expiresAt < now().getTime() || activePending.baseRevision !== snapshotRef.current.revision || !authority.choices.some(({ id }) => id === choiceId)) return;
      const patch = authority.slot === "group" ? { groupId: choiceId } : authority.slot === "message" ? { replyToMessageId: choiceId } : authority.slot === "event" ? authority.intent.type === "friend-memory" ? { calendarEventId: choiceId } : { eventId: choiceId } : authority.slot === "moment" ? { recordingMoment: JSON.parse(choiceId) as { kind: "journal" | "voice-note"; recordingId: string; markerId: string } } : { resolvedPersonId: choiceId };
      createCurrentCommandRunner()(choiceTranscript ?? authority.choices.find(({ id }) => id === choiceId)!.label, activePending.source, `friend-followup-${crypto.randomUUID()}`, { resolution: { intent: { ...authority.intent, ...patch }, candidates: [] }, presented: false }); return;
    }
    if (activePending?.friend?.kind === "marker-action") {
      const authority = activePending.friend;
      if (authority.expiresAt < now().getTime() || activePending.baseRevision !== snapshotRef.current.revision || !authority.choices.some(({ id }) => id === choiceId)) return;
      const patch = authority.stage === "recipient" ? { recipientId: choiceId } : authority.stage === "payload" ? { payload: choiceId as "voice" | "text" } : authority.stage === "direction" ? { direction: choiceId as "owed-by-me" | "waiting-on" } : { timeAnswer: choiceId };
      createCurrentCommandRunner()(choiceTranscript ?? authority.choices.find(({ id }) => id === choiceId)!.label, activePending.source, `marker-action-${crypto.randomUUID()}`, { resolution: { intent: { ...authority.intent, ...patch }, candidates: [] }, presented: false });
      return;
    }
    if (activePending?.friend?.kind === "marker") {
      const authority = activePending.friend;
      if (authority.expiresAt < now().getTime() || !authority.choices.some(({ id }) => id === choiceId) || activePending.baseRevision !== snapshotRef.current.revision) return;
      createCurrentCommandRunner()(choiceTranscript ?? authority.choices.find(({ id }) => id === choiceId)!.label, activePending.source, `marker-choice-${crypto.randomUUID()}`, { resolution: { intent: { ...authority.intent, markerId: choiceId }, candidates: [] }, presented: false });
      return;
    }
    if (activePending?.friend?.kind === "calendar-message" || activePending?.friend?.kind === "marker-calendar") {
      const authority = activePending.friend;
      const choice = authority.proposal.choices.find(({ id }) => id === choiceId);
      if (activePending.baseRevision !== snapshotRef.current.revision || authority.expiresAt < now().getTime() || !choice) { cancel(); return; }
      createCurrentCommandRunner()(choiceTranscript ?? choice.label, activePending.source, `calendar-message-choice-${crypto.randomUUID()}`, { resolution: { intent: { type: "friend-draft", operation: "calendar-refine", request: choice.request }, candidates: [] }, presented: false });
      return;
    }
    if (activePending?.friend?.kind === "recipient") {
      const authority = activePending.friend;
      if (activePending.baseRevision !== snapshotRef.current.revision || authority.expiresAt < now().getTime() || !authority.choices.some(({ id }) => id === choiceId)) { cancel(); return; }
      createCurrentCommandRunner()(choiceTranscript ?? authority.choices.find(({ id }) => id === choiceId)!.label, activePending.source, `friend-choice-${crypto.randomUUID()}`, { resolution: { intent: { ...authority.intent, resolvedPersonId: choiceId }, candidates: [] }, presented: false });
      return;
    }
    const alternatives = activePending?.alternatives ?? (activePending?.calendarRequest && activePending.clarification ? { request: activePending.calendarRequest, clarification: activePending.clarification } : undefined);
    if (!activePending || !alternatives) return;
    const request = applyPendingChoice({ type: "clarification", ...alternatives, source: activePending.source }, choiceId);
    const current = snapshotRef.current;
    const source = calendarRequestSourceDate(current.document, current.temporal?.scope ?? { kind: "day", dateKey: current.document.calendar.dateKey }, request, selectedCalendarEventRef.current);
    if ("question" in source) {
      const nextPending = source.clarification ? { ...activePending, calendarRequest: request, clarification: source.clarification } : undefined;
      pendingRef.current = nextPending; setPending(nextPending);
      setFeedback({ phase: "clarification", title: source.question, detail: source.detail, transcript: request.transcript });
      return;
    }
    const committed = commit([{ type: "calendar.request", request, sourceDateKey: source.dateKey, selectedId: selectedCalendarEventRef.current }], request.transcript, activePending.source);
    if (!committed && pendingRef.current && !pendingRef.current.clarification) {
      const nextPending = { ...pendingRef.current, alternatives };
      pendingRef.current = nextPending; setPending(nextPending);
    }
  }
  function dispatchFriend(intent: FriendIntent) {
    const inputSequence = ++commandInputSequence.current;
    nativeFeedbackEpoch.current += 1;
    void mutationCoordinator.run(() => {
      syncFromStorage();
      const commandId = `friend-ui-${crypto.randomUUID()}`;
      activeCommandId.current = commandId; activeCommandSource.current = "quick";
      try { createCurrentCommandRunner(undefined, inputSequence)(intent.type, "quick", commandId, { resolution: { intent, candidates: [] }, presented: false, fromGesture: true }); }
      finally { activeCommandId.current = undefined; activeCommandSource.current = undefined; activeCommandIntent.current = undefined; }
    });
  }
  function showCalendarChange(change: LifeTransactionRecord) {
    if (!change.calendarChange) return;
    setCalendarFeedback(replayFeedback(
      "Last Calendar change",
      change.calendarChange.summary,
      change.calendarChange,
      change.calendarChange.before ?? change.before?.calendar ?? snapshotRef.current.document.calendar,
      change.calendarChange.after ?? change.after?.calendar ?? snapshotRef.current.document.calendar,
    ));
  }
  function createCurrentCommandRunner(captured?: CapturedCommandContext, inputSequence = commandInputSequence.current) {
    const responseEpoch = nativeFeedbackEpoch.current;
    return createLifeCommandRunner({
      isCurrentCommand: () => responseEpoch === nativeFeedbackEpoch.current,
      prepareMemoryShare: (intent, transcript, source) => {
        const parentCommandId = window.__FLOW_COMMAND_TRACE__?.commandId;
        const document = snapshotRef.current.document, revision = snapshotRef.current.revision;
        const isCurrent = () => responseEpoch === nativeFeedbackEpoch.current && revision === snapshotRef.current.revision;
        void import("../features/studio/memory/prepareMemoryAttachment").then(({ prepareMemoryAttachment }) => prepareMemoryAttachment(document, intent.memoryId!, isCurrent)).then(async (prepared) => {
          try {
            if (!isCurrent()) return;
            await mutationCoordinator.run(() => { syncFromStorage(false); if (!isCurrent()) return;
              createCurrentCommandRunner()(transcript, source, `share-memory-${crypto.randomUUID()}`, { resolution: { intent: { type: "friend-message", resolvedPersonId: intent.resolvedPersonId, resolvedGroupId: intent.resolvedGroupId, body: prepared.attachment.text, attachment: prepared.attachment, asset: prepared.asset }, candidates: [] }, presented: false, parentCommandId });
            });
          } finally { prepared.release(); }
        }).catch((error: unknown) => { if (responseEpoch === nativeFeedbackEpoch.current) setFeedback({ phase: "clarification", title: "Memory was not shared", detail: error instanceof Error ? error.message : "The private source remains unchanged.", transcript }); });
      },
      prepareMarkerShare: (intent, transcript, source) => {
        const parentCommandId = window.__FLOW_COMMAND_TRACE__?.commandId;
        const document = snapshotRef.current.document, revision = snapshotRef.current.revision;
        const recording = intent.target ? recordingDocument(document, intent.target) : undefined;
        const marker = recording?.markers?.find(({ id }) => id === intent.markerId);
        if (!recording || !marker || !intent.recipientId || !intent.payload) return;
        const isCurrent = () => responseEpoch === nativeFeedbackEpoch.current && snapshotRef.current.revision === revision;
        const prepare = async () => {
          const commandId = `shared-moment-${crypto.randomUUID()}`;
          const clip = intent.payload === "voice" ? await (await import("../features/studio/audioClip")).exportAudioClip(recording.audioAssetId ?? "", marker.startMs, Math.min(recording.recordingDurationMs, marker.endMs), `clip-${crypto.randomUUID()}`, isCurrent) : undefined;
          try {
            if (!isCurrent()) return;
            await mutationCoordinator.run(() => {
              syncFromStorage(false); if (!isCurrent()) return;
              const attachment = clip ? { kind: "voice" as const, assetId: clip.asset.id, title: marker.title, text: marker.excerpt, durationMs: clip.durationMs, markers: [{ id: `shared-${crypto.randomUUID()}`, kind: marker.kind, title: marker.title, excerpt: marker.excerpt, startMs: 0, endMs: clip.durationMs }] } : undefined;
              createCurrentCommandRunner()(transcript, source, commandId, { resolution: { intent: { type: "friend-message", resolvedPersonId: intent.recipientId, body: marker.excerpt, attachment, asset: clip?.asset }, candidates: [] }, presented: false, parentCommandId });
            });
          } finally { clip?.release(); }
        };
        void prepare().catch((error: unknown) => { if (responseEpoch === nativeFeedbackEpoch.current) setFeedback({ phase: "clarification", title: "No moment was shared", detail: error instanceof Error ? error.message : "The clip could not be prepared. The original remains private.", transcript }); });
      },
      prepareVoiceNote: (noteId, transcript, source, operation = "review") => {
        const parentCommandId = window.__FLOW_COMMAND_TRACE__?.commandId;
        const isCurrent = () => responseEpoch === nativeFeedbackEpoch.current;
        setFeedback({ phase: "understanding", title: "Saving original audio", detail: "The final audio must be saved before you can review delivery.", transcript });
        void requestStudioRecording({ kind: "voice-note", id: noteId }, "stop", isCurrent).then(async () => {
          if (!isCurrent()) return;
          const note = snapshotRef.current.document.friends?.voiceNotes.find(({ id }) => id === noteId);
          if (!note?.audioAssetId || note.recordingState !== "idle" || typeof indexedDB === "undefined" || !(await getStudioMedia(note.audioAssetId))?.size) throw new Error("The original recording is not saved persistently on this device. No message was prepared.");
          if (!isCurrent()) return;
          void mutationCoordinator.run(() => {
            if (!isCurrent()) return;
            syncFromStorage();
            createCurrentCommandRunner()(transcript, source, `voice-note-review-${crypto.randomUUID()}`, { resolution: { intent: { type: "friend-voice", operation, noteId }, candidates: [] }, presented: false, parentCommandId });
          });
        }).catch((error: unknown) => { if (isCurrent()) setFeedback({ phase: "clarification", title: "Voice note not ready to send", detail: error instanceof Error ? error.message : "Keep the draft open and retry saving.", transcript }); });
      },
      getSnapshot: () => snapshotRef.current, getContext: () => captured?.context ?? conversationRef.current,
      updateContext: (patch) => {
        const next = { ...conversationRef.current, ...patch, nowMs: now().getTime() };
        conversationRef.current = next; setConversationContext(next);
      },
      route: captured?.context.route ?? routeRef.current, focusedEntityId: captured ? captured.context.focusedEntityId : focusedEntityRef.current, activePlanId: captured ? captured.context.activePlanId : activePlanRef.current,
      selectedCalendarEventId: captured ? captured.selectedCalendarEventId : selectedCalendarEventRef.current, getPending: () => pendingRef.current, now, navigate,
      commit, undo: applyUndo, redo: applyRedo, confirm: applyConfirm, cancel, setFocusedEntityId, setActivePlanId, setFeedback, setLastTranscript,
      setSelectedCalendarEventId,
      setTemporalScope,
      recordInstinctExposure,
      setPending: (nextPending) => {
        const resolved = typeof nextPending === "function" ? nextPending(pendingRef.current) : nextPending;
        const bound = resolved ? { ...resolved, promptId: resolved.promptId ?? `prompt-${crypto.randomUUID()}`, commandId: resolved.commandId ?? window.__FLOW_COMMAND_TRACE__?.commandId, baseRevision: snapshotRef.current.revision } : undefined;
        if (bound) patchCommandTrace(bound.commandId, { socialContext: { focusedPersonId: conversationRef.current.focusedPersonId, focusedGroupId: conversationRef.current.focusedGroupId, activeVoiceNoteId: conversationRef.current.activeVoiceNoteId, activeMessageId: conversationRef.current.activeMessageId, selectedVoiceMarkerId: conversationRef.current.selectedVoiceMarkerId }, pendingAuthority: { id: bound.promptId, revision: bound.baseRevision, kind: bound.friend?.kind, messageRevision: bound.friend?.kind === "message" ? bound.friend.messageRevision : undefined } });
        pendingRef.current = bound; setPending(bound);
      },
      setNowQuery, setNowExplanationOpen, showCalendarChange, choosePending: applyPendingSelection,
      getNowCandidates: () => captured?.recommendations ?? nowCandidates,
      presentCommandSurface: applyPresentation,
      setEntityEditor: (editor) => {
        setEntityEditor(editor ? { ...editor, session: ++editorSession.current } : undefined);
        const next = { ...conversationRef.current, activeEditor: editor };
        conversationRef.current = next; setConversationContext(next);
      },
      updateCommitmentView: (patch) => {
        if (inputSequence < latestCommitmentViewSequence.current) return commitmentViewRef.current;
        const next = { ...commitmentViewRef.current, ...patch };
        latestCommitmentViewSequence.current = inputSequence;
        commitmentViewRef.current = next; setCommitmentView(next); return next;
      },
      setIntentType: (intent, resolved) => {
        activeCommandIntent.current = intent;
        activePageOpening.current = resolved?.type === "navigate" || resolved?.type === "studio-select"
          || resolved?.type === "friend-open" && !resolved.collection
          || (resolved?.type === "friend-person" || resolved?.type === "friend-group") && resolved.operation === "open"
          || resolved?.type === "friend-voice" && (resolved.operation === "open" || resolved.operation === "create");
      },
      acknowledgeVoiceIntent: (intent) => acknowledgeActiveVoice(intent),
      presentResolvedIntent: (resolution, currentDocument, currentContext, transcript, source, commandId) => {
        // Commit the semantic target before execution so outgoing shared-layout
        // surfaces retain the acknowledgement during the route morph.
        flushSync(() => voiceWorldController.target(projectResolvedCommand(resolution, currentDocument, currentContext, transcript, source, commandId)));
      },
    });
  }
  /**
   * The real merge point between the kernel bridge (productionBridge.ts)
   * and the legacy voice/text interpreter. Every transcript — spoken or
   * typed, since both paths call runCommandExactlyOnce — passes through
   * here first. If the bridge claims it (memory, universal recall, Earmark
   * playback, the desktop companion, or the buffer-aware calendar move),
   * this handles it fully using the SAME real dispatchLife/commit pipeline,
   * feedback dock and navigation the legacy path uses, and returns true so
   * the caller skips the legacy machinery entirely. Anything unclaimed
   * returns false and falls through unchanged — there is exactly one
   * conversational brain here, not two running in parallel.
   */
  function tryKernelBridge(transcript: string, source: TransactionSource): boolean {
    const document = snapshotRef.current.document;

    // Legacy -> kernel: whichever referent legacy most recently established
    // (selected/lastReferenced/lastChanged/lastCreated — see
    // conversationContext.ts) becomes visible to the kernel's OWN resolver
    // if it's newer than what the kernel already has, so a kernel-recognized
    // follow-up ("bookmark it" after legacy opened a journal entry) resolves
    // it. There is one referent contract (kernel/session.ts's
    // EntityReference); this is the translation at the boundary, not a
    // second store — see kernelReferentBridge.ts.
    const legacyRef = referenceFromLegacyContext(conversationRef.current);
    const kernelRef = kernelSessionRef.current.referents.lastMentioned;
    if (legacyRef && (legacyRef.at ?? 0) > (kernelRef?.at ?? -1)) {
      kernelSessionRef.current = rememberSearchResults(kernelSessionRef.current, [legacyRef], legacyRef.at ?? now().getTime());
    }

    const result = runKernelTurn(
      transcript,
      document,
      document.personalMemoryFacts ?? [],
      kernelSessionRef.current,
      now,
      { dispatchLife: (actions, summary, t) => { dispatchLife(actions, summary, t, source); } },
    );
    kernelSessionRef.current = result.session;
    if (!result.recognized) return false;

    // Every legacy-handled command updates lastTranscript generically
    // (see createLifeCommandRunner's own options.setLastTranscript call) —
    // match that for every kernel-claimed utterance too, not just some
    // branches, since UI (and tests) key off this attribute to know a
    // command has been processed at all.
    setLastTranscript(transcript);

    // Mirrors exactly how the legacy voice/text "undo"/"redo" command
    // invokes applyUndo/applyRedo (see resolveGlobalCommand's "history"
    // intent, handled inside lifeCommandController.ts) — queued through the
    // same mutationCoordinator with a fresh syncFromStorage() first, so it
    // serializes correctly against any other in-flight command instead of
    // racing it.
    // These three delegate straight to the app's own history/feedback
    // functions rather than going through legacy's resolveGlobalCommand, so
    // they'd otherwise never stamp the dev command trace the way every
    // other command (kernel- or legacy-handled) does — beginCommandTrace is
    // dev/test-only tooling (see commandTrace.ts), not user-visible behavior.
    if (result.delegateToApp === "undo") { beginCommandTrace(transcript, { type: "history-undo" }, conversationRef.current); void mutationCoordinator.run(() => { syncFromStorage(); applyUndo(transcript); }); return true; }
    if (result.delegateToApp === "redo") { beginCommandTrace(transcript, { type: "history-redo" }, conversationRef.current); void mutationCoordinator.run(() => { syncFromStorage(); applyRedo(transcript); }); return true; }
    if (result.delegateToApp === "whatChanged") {
      beginCommandTrace(transcript, { type: "history-what-changed" }, conversationRef.current);
      setFeedback({ phase: "completed", title: snapshotRef.current.lastTransaction?.summary ?? "Nothing has changed yet.", transcript });
      return true;
    }

    if (result.openReferent) {
      const ref = result.openReferent;
      switch (ref.domain) {
        case "journal":
          navigate("journal"); setFocusedEntityId(ref.id); break;
        case "plans":
          navigate("outcomes"); setFocusedEntityId(ref.id); break;
        case "people":
        case "commitments":
          navigate("people"); setFocusedEntityId(ref.personIds?.[0] ?? ref.id); break;
        case "calendar":
          navigate("today"); setSelectedCalendarEventId(ref.id); break;
        default:
          break;
      }
    }

    // Kernel -> legacy: the inverse translation, so a LEGACY follow-up
    // ("bookmark it") can resolve a referent the kernel just established
    // (e.g. a recall result the user opened). Desktop files/raw search hits
    // have no LifeEntityId and legacyContextPatchFromReference correctly
    // returns undefined for them — legacy has no slot for those, which is
    // fine since the kernel already owns them.
    const currentRef = kernelSessionRef.current.referents.lastMentioned;
    if (currentRef) {
      const patch = legacyContextPatchFromReference(currentRef, now().getTime());
      if (patch && conversationRef.current.focusedEntityId !== patch.focusedEntityId) {
        const next = { ...conversationRef.current, ...patch };
        conversationRef.current = next;
        setConversationContext(next);
        setFocusedEntityId(patch.focusedEntityId);
      }
    }

    const phaseToFeedback: Record<string, CommandFeedback["phase"]> = {
      listening: "clarification", thinking: "understanding", checking: "understanding",
      "needs-clarification": "clarification", "ready-to-act": "confirmation", done: "completed",
    };
    setFeedback({ phase: result.outcome.status === "error" ? "error" : (phaseToFeedback[result.phase] ?? "completed"), title: result.message, transcript });
    return true;
  }

  function runCommandExactlyOnce(transcript: string, source: TransactionSource = "type", commandId = `${source}-${Date.now()}-${Math.random().toString(36).slice(2)}`, captured?: CapturedCommandContext) {
    if (processedCommandIds.current.includes(commandId)) return;
    processedCommandIds.current = [...processedCommandIds.current.slice(-127), commandId];
    // Never let the kernel bridge intercept dictation — someone narrating a
    // journal entry who happens to say "remember to call mom" means that
    // literally as journal content, not a command to Flow.
    const activeVoiceMode = captured?.context.voiceMode ?? conversationRef.current.voiceMode;
    const isDictating = activeVoiceMode === "dictation" || activeVoiceMode === "journal-longform" || activeVoiceMode === "voice-note-longform";
    if (!isDictating && tryKernelBridge(transcript, source)) return;
    // Typed submission has the same acquisition boundary as final speech.
    // Freeze references/authority, never the document: execution still reads
    // the latest snapshot inside the durable CAS coordinator.
    captured ??= {
      context: structuredClone({ ...conversationRef.current, route: routeRef.current, focusedEntityId: focusedEntityRef.current, activePlanId: activePlanRef.current }),
      scope: structuredClone(snapshotRef.current.temporal?.scope ?? { kind: "day", dateKey: snapshotRef.current.document.calendar.dateKey }),
      selectedCalendarEventId: selectedCalendarEventRef.current,
      recommendations: structuredClone(nowCandidates),
      confirmationAuthority: calendarPreviewRef.current ?? pendingRef.current ?? null,
    };
    const inputSequence = ++commandInputSequence.current;
    nativeFeedbackEpoch.current += 1;
    if (source === "voice" && (captured?.context.voiceMode === "journal-longform" || captured?.context.voiceMode === "voice-note-longform") && captured.finalSegments && captured.finalSegments.length > 1) {
      const current = snapshotRef.current.document;
      const partition = partitionJournalFinals(captured.finalSegments, (segment) => resolveGlobalCommand(segment, captured.context, snapshotRef.current.temporal?.todayDateKey ?? current.calendar.dateKey, current.steps, current.preferences.workdayEndMinutes, calendarReferenceScope(current, captured.scope), current.people, current.friends?.groups).segment?.classification ?? "AMBIGUOUS");
      const continuation = { ...captured, finalSegments: undefined };
      if (partition.status === "clarification") runCommandExactlyOnce(transcript, source, `${commandId}:boundary`, { ...continuation, boundaryClarification: partition.detail });
      else partition.utterances.forEach((utterance, index) => runCommandExactlyOnce(utterance, source, `${commandId}:part-${index}`, continuation));
      return;
    }
    // A new intention interrupts presentation motion immediately. Domain
    // serialization can then wait for the document lock without leaving an
    // obsolete clone or frame sampler running over that work.
    voiceWorldController.interruptTargetPresentation();
    flushSync(() => { cancelTransition(); rewardDirector.cancel("interrupted"); });
    void mutationCoordinator.run(() => {
      syncFromStorage();
      activeCommandId.current = commandId;
      activeCommandSource.current = source;
      activeCommandIntent.current = undefined;
      let deferred = false;
      try {
        const currentDocument = snapshotRef.current.document;
        const storedContext = captured?.context ?? conversationRef.current;
        const currentContext: LifeContext = {
          ...storedContext,
          weekStartsOn: currentDocument.preferences.weekStartsOn,
          route: captured?.context.route ?? routeRef.current,
          focusedEntityId: captured ? captured.context.focusedEntityId : focusedEntityRef.current,
          activePlanId: captured ? captured.context.activePlanId : activePlanRef.current,
          ...(captured ? { currentTimeScope: captured.scope } : {}),
          pending: storedContext.pending,
          nowMs: now().getTime(),
        };
        const scope = captured?.scope ?? snapshotRef.current.temporal?.scope;
        let resolution = captured?.boundaryClarification ? { intent: { type: "clarification" as const, title: "Please repeat the complete request", detail: captured.boundaryClarification }, candidates: [] }
          : resolveGlobalCommand(transcript.trim(), currentContext, snapshotRef.current.temporal?.todayDateKey ?? currentDocument.calendar.dateKey, currentDocument.steps, currentDocument.preferences.workdayEndMinutes, calendarReferenceScope(currentDocument, scope), currentDocument.people, currentDocument.friends?.groups);
        if (captured && ["confirm", "pending-choice", "cancel", "capture-answer", "friend-draft", "friend-marker-answer"].includes(resolution.intent.type)
          && captured.confirmationAuthority !== (calendarPreviewRef.current ?? pendingRef.current ?? null)) {
          resolution = { intent: { type: "clarification", title: "The pending request changed while you were speaking.", detail: "Review the current request, then confirm or cancel it again. Nothing changed." }, candidates: [] };
        }
        const isView = ["commitment-view", "entity-view", "editor-close", "command-surface", "sensory-preference", "voice-retry"].includes(resolution.intent.type);
        const supersededView = () => isView && inputSequence < latestCommitmentViewSequence.current;
        if (supersededView()) return;
        beginCommandTrace(transcript.trim(), resolution.intent, currentContext, resolution.candidates, resolution.segment, commandId);
        const projection = projectResolvedCommand(resolution, currentDocument, currentContext, transcript.trim(), source, commandId);
        const isDictation = resolution.segment?.classification === "CONTENT";
        if (!isDictation) flushSync(() => voiceWorldController.target(projection));
        const execute = () => {
          if (supersededView()) { activeCommandId.current = undefined; activeCommandSource.current = undefined; activeCommandIntent.current = undefined; return; }
          if (isView) latestCommitmentViewSequence.current = inputSequence;
          voiceWorldController.markExecutionStarted();
          const foreground = conversationRef.current;
          const priorFocus = focusedEntityRef.current;
          const preserveForeground = isDictation && captured && (foreground.activeJournalEntryId !== captured.context.activeJournalEntryId || foreground.voiceMode !== captured.context.voiceMode);
          try { createCurrentCommandRunner(captured ? { ...captured, context: currentContext } : undefined, inputSequence)(transcript, source, commandId, { resolution, presented: true }); }
          finally {
            if (preserveForeground) { conversationRef.current = foreground; setConversationContext(foreground); setFocusedEntityId(priorFocus); }
            activeCommandId.current = undefined; activeCommandSource.current = undefined; activeCommandIntent.current = undefined;
          }
        };
        const presentation = !isDictation && projection.confidenceTier !== "clarify" && projection.confidenceTier !== "unsupported"
          ? voiceWorldController.waitForTargetPaint(commandId)
          : undefined;
        if (presentation) {
          deferred = true;
          return presentation.then(execute);
        }
        execute();
      }
      finally {
        if (!deferred) {
          activeCommandId.current = undefined;
          activeCommandSource.current = undefined;
          activeCommandIntent.current = undefined;
        }
      }
    });
  }
  function dispatchCommitmentView(patch: Partial<CommitmentViewState>) {
    // Pointer parameters are already typed. Use the same canonical controller
    // branch as interpreted speech, without placing an input's transient value
    // behind the asynchronous durable-document lock.
    const intent: GlobalIntent = { type: "commitment-view", patch };
    const transcript = patch.search !== undefined ? commitmentViewCommands.search(patch.search) : commitmentViewCommands.filter(patch.lens!);
    const commandId = `commitment-view-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const inputSequence = ++commandInputSequence.current;
    nativeFeedbackEpoch.current += 1;
    activeCommandId.current = commandId; activeCommandSource.current = "quick";
    try { createCurrentCommandRunner(undefined, inputSequence)(transcript, "quick", commandId, { resolution: { intent, candidates: [] }, presented: false }); }
    finally { activeCommandId.current = undefined; activeCommandSource.current = undefined; activeCommandIntent.current = undefined; }
  }
  function dispatchEntityView(intent: EntityViewIntent) {
    const inputSequence = ++commandInputSequence.current;
    latestCommitmentViewSequence.current = inputSequence;
    nativeFeedbackEpoch.current += 1;
    const commandId = `entity-view-${Date.now()}-${inputSequence}`;
    activeCommandId.current = commandId; activeCommandSource.current = "quick";
    try { createCurrentCommandRunner(undefined, inputSequence)(entityViewDescription(intent), "quick", commandId, { resolution: { intent, candidates: [] }, presented: false }); }
    finally { activeCommandId.current = undefined; activeCommandSource.current = undefined; activeCommandIntent.current = undefined; }
  }
  function updateCommandPresentation(patch: Partial<CommandPresentation>) {
    const next = { ...commandPresentationRef.current, ...patch };
    commandPresentationRef.current = next; setCommandPresentation(next);
  }
  function applyRewardPreferences(preferences: RewardPreferences, fromGesture = false) {
    rewardPreferencesRef.current = preferences;
    writeRewardPreferences(preferences); setRewardPreferencesState(preferences); void rewardDirector.updatePreferences(preferences, fromGesture);
  }
  function applyPresentation(intent: PresentationIntent, fromGesture: boolean): { status: "completed" | "clarification"; title: string; detail: string } {
    if (intent.type === "voice-retry") {
      window.dispatchEvent(new CustomEvent("flow-live-command", { detail: "start" }));
      return { status: "completed", title: "Microphone retry requested", detail: "The existing Flow Live session will report whether acquisition succeeds. No calendar data changed." };
    }
    if (intent.type === "sensory-preference") {
      if (intent.patch.sound === true && !fromGesture) {
        updateCommandPresentation({ settingsOpen: true, soundAwaitingGesture: true });
        return { status: "clarification", title: "Enable reward sound with the sound control", detail: "Your preference has not changed. Use the visible sound control to consent and request browser audio unlock." };
      }
      applyRewardPreferences({ ...rewardPreferencesRef.current, ...intent.patch }, fromGesture);
      updateCommandPresentation({ settingsOpen: true, ...(intent.patch.sound !== undefined ? { soundAwaitingGesture: false } : {}) });
      return { status: "completed", title: "Sensory preference updated", detail: "Your calendar and history are unchanged." };
    }
    if (intent.surface.endsWith("inspector") && !import.meta.env.DEV) return { status: "clarification", title: "Diagnostics are unavailable in this build", detail: "No data changed." };
    if (intent.surface === "composer") {
      if (!intent.open && (pendingRef.current || ["live-idle", "listening", "interpreting"].includes(flowLiveStatus))) return { status: "clarification", title: "Keep the active command visible", detail: "Finish or cancel the pending request and pause listening before hiding the field." };
      updateCommandPresentation({ composerRequest: { open: intent.open, sequence: (commandPresentationRef.current.composerRequest?.sequence ?? 0) + 1 } });
    } else if (intent.surface === "settings") updateCommandPresentation({ settingsOpen: intent.open, ...(!intent.open ? { soundAwaitingGesture: false } : {}) });
    else if (intent.surface === "voice-inspector") updateCommandPresentation({ voiceInspectorOpen: intent.open });
    else updateCommandPresentation({ rewardInspectorOpen: intent.open });
    return { status: "completed", title: `${intent.open ? "Opened" : "Closed"} ${intent.surface}`, detail: "Only presentation changed." };
  }
  function dispatchPresentation(intent: PresentationIntent, fromGesture = false) {
    const inputSequence = ++commandInputSequence.current;
    latestCommitmentViewSequence.current = inputSequence; nativeFeedbackEpoch.current += 1;
    const commandId = `presentation-${Date.now()}-${inputSequence}`;
    const transcript = intent.type === "command-surface" ? `${intent.open ? "Open" : "Close"} ${intent.surface}` : intent.type === "voice-retry" ? "Retry voice command" : "Update sensory preference";
    activeCommandId.current = commandId; activeCommandSource.current = "quick";
    try { createCurrentCommandRunner(undefined, inputSequence)(transcript, "quick", commandId, { resolution: { intent, candidates: [] }, presented: false, fromGesture }); }
    finally { activeCommandId.current = undefined; activeCommandSource.current = undefined; activeCommandIntent.current = undefined; }
  }
  function dispatchCalendar(actions: CalendarAction[], source: TransactionSource, transcript: string) {
    nativeFeedbackEpoch.current += 1;
    void mutationCoordinator.run(() => {
      syncFromStorage();
      const request: CalendarRequest = { transcript, normalized: transcript.toLowerCase(), actions, constraints: [], nowMinutes: now().getHours() * 60 + now().getMinutes() };
      commit([{ type: "calendar.request", request, selectedId: selectedCalendarEventRef.current }], transcript, source);
    });
  }
  const dispatchLife = (actions: LifeAction[], summary: string, transcript = summary, source: TransactionSource = "quick") => {
    nativeFeedbackEpoch.current += 1;
    return mutationCoordinator.run(() => {
      syncFromStorage();
      activeCommandId.current = `${source}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      activeCommandSource.current = source;
      try { return commit(actions, transcript, source, summary); }
      finally { activeCommandId.current = undefined; activeCommandSource.current = undefined; }
    });
  };
  async function dispatchRecording(actions: LifeAction[], summary: string, isCurrent: () => boolean = () => true) {
    return mutationCoordinator.run(() => { syncFromStorage(false); return isCurrent() && commit(actions, summary, "quick", summary, undefined, true); });
  }
  function prepareVoiceNoteAcquisition(noteId: string, ownsRequest: () => boolean): JournalAcquisition {
    const revision = snapshotRef.current.revision;
    const origin = snapshotRef.current.lastTransaction;
    const isCurrent = () => ownsRequest() && snapshotRef.current.revision === revision && Boolean(snapshotRef.current.document.friends?.voiceNotes.some(({ id, audioAssetId }) => id === noteId && !audioAssetId));
    return { isCurrent, complete: (asset) => mutationCoordinator.run(() => {
      syncFromStorage(false);
      if (!isCurrent()) return false;
      const actions: LifeAction[] = [{ type: "media.register", asset }, { type: "voice-note.update", noteId, patch: { audioAssetId: asset.id, recordingState: "recording", recordingDurationMs: 0 } }];
      const current = snapshotRef.current;
      if (!origin?.before || origin.before.friends?.voiceNotes.some(({ id }) => id === noteId) || !origin.actionTypes.includes("voice-note.create") || current.lastTransaction?.id !== origin.id) return commit(actions, "Start voice note recording", "quick", "Voice note recording started.", undefined, true);
      const result = applyLifeTransaction(current.document, actions, now);
      return result.status === "success" && persistSnapshot({ ...current, revision: current.revision + 1, document: result.document, lastTransaction: { ...origin, after: result.document, actionTypes: [...origin.actionTypes, ...actions.map(({ type }) => type)] } }, current.revision);
    }) };
  }
  function prepareJournalAcquisition(entryId: string, origin: JournalCreationOrigin | undefined, ownsRequest: () => boolean): JournalAcquisition {
    const revision = snapshotRef.current.revision;
    const epoch = nativeFeedbackEpoch.current;
    const isCurrent = () => ownsRequest() && nativeFeedbackEpoch.current === epoch && snapshotRef.current.revision === revision
      && snapshotRef.current.document.studio.journalEntries.some(({ id }) => id === entryId)
      && (!origin || origin.revision === revision && snapshotRef.current.lastTransaction?.id === origin.transactionId);
    return { isCurrent, complete: (asset) => mutationCoordinator.run(() => {
      syncFromStorage();
      if (!isCurrent()) return false;
      if (!origin) return commit([{ type: "media.register", asset }, { type: "journal.update", entryId, patch: { recordingState: "recording", audioAssetId: asset.id } }], "Start journal recording", "quick", "Journal recording started.");
      const current = snapshotRef.current;
      const next = completeJournalCreation(current, entryId, origin, asset, now);
      // No new history or reward: this is the successful native stage of the
      // already-persisted creation, guarded by its exact revision/identity.
      return Boolean(next && persistSnapshot(next, current.revision));
    }) };
  }
  const undo = (transcript?: string) => { nativeFeedbackEpoch.current += 1; flushSync(() => { cancelTransition(); rewardDirector.cancel("cancelled"); }); void mutationCoordinator.run(() => { syncFromStorage(); applyUndo(transcript); }); };
  const redo = (transcript?: string) => { nativeFeedbackEpoch.current += 1; flushSync(() => { cancelTransition(); rewardDirector.cancel("cancelled"); }); void mutationCoordinator.run(() => { syncFromStorage(); applyRedo(transcript); }); };
  const confirm = () => { nativeFeedbackEpoch.current += 1; void mutationCoordinator.run(() => { const changed = syncFromStorage(); if (!changed) applyConfirm(); }); };
  const choosePending = (choiceId: string) => { nativeFeedbackEpoch.current += 1; void mutationCoordinator.run(() => { const changed = syncFromStorage(); if (!changed) applyPendingSelection(choiceId); }); };
  const setListeningFeedback = useCallback((interim: string) => {
    if (pendingRef.current) return;
    setFeedback((previous) => interim ? { phase: "listening", title: "Listening", detail: interim, transcript: interim }
      : previous.phase === "listening" || previous.phase === "ready" ? readyFeedback : previous);
    if (voiceWorldController.snapshot.entrance !== "active") return;
    if (!interim) {
      voiceWorldController.activate(flowLiveStatus === "listening" || flowLiveStatus === "live-idle" ? "listening" : "idle-session");
      return;
    }
    const currentDocument = snapshotRef.current.document;
    const currentContext = {
      ...conversationRef.current,
      weekStartsOn: currentDocument.preferences.weekStartsOn,
      route: routeRef.current,
      focusedEntityId: focusedEntityRef.current,
      activePlanId: activePlanRef.current,
      pending: undefined,
      pendingChoices: undefined,
      nowMs: now().getTime(),
    };
    const resolution = resolveGlobalCommand(interim, currentContext, snapshotRef.current.temporal?.todayDateKey ?? currentDocument.calendar.dateKey, currentDocument.steps, currentDocument.preferences.workdayEndMinutes, calendarReferenceScope(currentDocument, snapshotRef.current.temporal?.scope), currentDocument.people, currentDocument.friends?.groups);
    voiceWorldController.preview(projectResolvedCommand(resolution, currentDocument, currentContext, interim, "voice", "voice-interim-preview"));
  }, [flowLiveStatus, now, voiceWorldController]);

  const value = useMemo<EnvironmentValue>(() => ({
    snapshot, document: snapshot.document, route, peopleView, commitmentView, entityEditor, commandPresentation, activePlanId, focusedEntityId, selectedCalendarEventId, feedback, calendarFeedback, conversationContext,
    pageNavigation, temporalScope, todayDateKey: snapshot.temporal?.todayDateKey ?? dateKey, currentTime: clockTime, setTemporalScope, recordInstinctExposure,
    renderedCalendar: calendarPreview?.proposed.calendar ?? snapshot.document.calendar, calendarPreview: Boolean(calendarPreview),
    lastTranscript, pending, nowCandidates, nowQuery, nowExplanationOpen, flowLiveStatus, voiceWorld: voiceWorldController.snapshot, reward, rewardPreferences, canUndo: snapshot.past.length > 0, canRedo: snapshot.future.length > 0,
    // Public pointer navigation supersedes pending native playback. The
    // controller's internal navigate function belongs to its current command
    // and must not invalidate that command's own target-ready handoff.
    navigate: (...args) => { nativeFeedbackEpoch.current += 1; navigate(...args); },
    goBack: () => { nativeFeedbackEpoch.current += 1; window.history.back(); },
    focusEntity: (id) => {
      nativeFeedbackEpoch.current += 1;
      setFocusedEntityId(id);
      const reference = id ? referenceFor(snapshotRef.current.document, id, now().getTime()) : undefined;
      const memory = snapshotRef.current.document.studio.memories.find((item) => item.id === id);
      const next = { ...conversationRef.current, focusedEntityId: id, selected: reference, lastReferenced: reference,
        ...(memory ? { activeMemoryId: memory.id, activeJournalEntryId: memory.journalEntryId, topic: "memory" as const } : {}), nowMs: now().getTime() };
      conversationRef.current = next; setConversationContext(next);
    },
    selectCalendarEvent: (id) => {
      nativeFeedbackEpoch.current += 1;
      setSelectedCalendarEventId(id); setFocusedEntityId(id);
      const reference = id ? referenceFor(snapshotRef.current.document, id, now().getTime()) : undefined;
      const next = { ...conversationRef.current, focusedEntityId: id, selected: reference, lastReferenced: reference, nowMs: now().getTime() };
      conversationRef.current = next; setConversationContext(next);
    },
    runCommand: runCommandExactlyOnce, dispatchFriend, dispatchCommitmentView, dispatchEntityView, dispatchPresentation, dispatchCalendar, dispatchLife, dispatchRecording, prepareJournalAcquisition, prepareVoiceNoteAcquisition, undo, redo, confirm, continueNative, requestNativeStudio, cancel, choosePending, confirmationAuthority: calendarPreview ?? pending ?? null,
    setListeningFeedback, setFlowLiveStatus,
    wakeVoiceHome: (transcript) => { setLastTranscript(transcript); voiceWorldController.wake(transcript); },
    waitForVoiceWake: (transcript) => { setLastTranscript(transcript); voiceWorldController.waitForWake(transcript); },
    activateVoiceHome: (transcript) => voiceWorldController.activate(flowLiveStatus === "listening" || flowLiveStatus === "live-idle" ? "listening" : "idle-session", transcript),
    disableVoiceWakeGate: voiceWorldController.disableWakeGate,
    setRewardPreferences: applyRewardPreferences,
    syncFromStorage: () => { syncFromStorage(); },
    setVoiceNoteMode: (mode, noteId) => {
      const next = { ...conversationRef.current, voiceMode: mode, activeVoiceNoteId: noteId, nowMs: now().getTime() };
      conversationRef.current = next; setConversationContext(next);
    },
    setJournalVoiceMode: (mode, entryId, positionMs) => {
      const next = { ...conversationRef.current, voiceMode: mode, activeMode: mode === "journal-longform" ? "journal-recording" as const : "journal-editing" as const, activeJournalEntryId: entryId, journalPositionMs: positionMs, topic: entryId ? "journal" as const : conversationRef.current.topic, nowMs: now().getTime() };
      conversationRef.current = next; setConversationContext(next);
    },
    selectStudioSource: (selection) => {
      const next = {
        ...conversationRef.current,
        ...(selection.entryId ? { activeJournalEntryId: selection.entryId } : {}),
        ...(selection.passage !== undefined ? { selectedJournalPassage: selection.passage } : {}),
        ...(selection.photoAssetId !== undefined ? { selectedPhotoAssetId: selection.photoAssetId } : {}),
        ...(selection.bookmarkId !== undefined ? { selectedBookmarkId: selection.bookmarkId } : {}),
        ...(selection.positionMs !== undefined ? { journalPositionMs: selection.positionMs } : {}),
        topic: "journal" as const,
        nowMs: now().getTime(),
      };
      conversationRef.current = next; setConversationContext(next);
    },
    selectRecordingPlayback: (target) => {
      const document = snapshotRef.current.document;
      const note = target.kind === "voice-note" ? document.friends?.voiceNotes.find(({ id }) => id === target.id) : undefined;
      const message = target.kind === "shared-message" ? messageEnvelope(document, deliveryReceipts(), target.id) : undefined;
      const recipient = note?.recipient ?? message?.recipient;
      if (!recipient || !note && message?.attachment?.kind !== "voice" && message?.attachment?.mediaType !== "audio") return;
      nativeFeedbackEpoch.current += 1;
      const markers = note?.markers ?? message?.attachment?.markers ?? [];
      const current = conversationRef.current;
      const next = { ...current, activeVoiceNoteId: note?.id, activeMessageId: message?.id,
        focusedPersonId: recipient.kind === "person" ? message?.authorPersonId ?? recipient.id : undefined,
        focusedGroupId: recipient.kind === "group" ? recipient.id : undefined,
        selectedVoiceMarkerId: markers.some(({ id }) => id === current.selectedVoiceMarkerId) ? current.selectedVoiceMarkerId : undefined,
        nowMs: now().getTime() };
      conversationRef.current = next; setConversationContext(next);
    },
    setPlaybackState: (target, status) => {
      const current = conversationRef.current;
      if (status !== "playing" && (current.activePlayback?.id !== target.id || current.activePlayback.kind !== target.kind)) return;
      const next = { ...current, activePlayback: { ...target, status } };
      conversationRef.current = next; setConversationContext(next);
    },
    selectInsight: (id) => {
      const next = { ...conversationRef.current, selectedInsightId: id, topic: "recommendation" as const, nowMs: now().getTime() };
      conversationRef.current = next; setConversationContext(next);
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [snapshot, route, peopleView, commitmentView, entityEditor, commandPresentation, activePlanId, focusedEntityId, selectedCalendarEventId, feedback, calendarFeedback, lastTranscript, pending, nowCandidates, nowQuery, nowExplanationOpen, flowLiveStatus, voiceWorldController.snapshot, voiceWorldController.wake, voiceWorldController.waitForWake, voiceWorldController.activate, voiceWorldController.disableWakeGate, reward, rewardPreferences, rewardDirector, navigate, calendarPreview, conversationContext, syncFromStorage, temporalScope, dateKey, clockTime, now, setTemporalScope, setListeningFeedback]);

  return <EnvironmentContext.Provider value={value}>
    <TransitionContext.Provider value={transition}>{children}</TransitionContext.Provider>
  </EnvironmentContext.Provider>;
}

export function useFlowEnvironment() {
  const value = useContext(EnvironmentContext);
  if (!value) throw new Error("useFlowEnvironment must be used inside FlowEnvironmentProvider");
  return value;
}

export function useOptionalFlowEnvironment() { return useContext(EnvironmentContext); }

export function useFlowTransition() { return useContext(TransitionContext); }
