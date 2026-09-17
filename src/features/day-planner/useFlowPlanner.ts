import { useEffect, useMemo, useRef, useState } from "react";
import { interpretTranscript } from "./parser";
import { executeRequest, type EngineResult } from "./planner";
import { parseClockExpression } from "./interpretation/temporal";
import { applyDestinationChoice, resolveEventReference } from "./scheduling/resolution";
import { createInitialPlan } from "./seed";
import { loadPlannerState, savePlannerState } from "./storage";
import type {
  CalendarAction,
  CalendarRequest,
  ChangeRecord,
  PendingInteraction,
  PlannerPreview,
  PlannerSnapshot,
  TransactionSource,
} from "./model";
import { localDateKey } from "./time";
import { applyingFeedback, minutesInDay, readyFeedback, replayFeedback } from "./plannerFeedback";
import { adjustPreviewRequest, applyPendingChoice } from "./plannerPreview";
import { createTransactionMetadata, createTransactionRecord, plansEqual } from "./plannerTransactions";
import { parsePlannerPresentation, type PlannerPresentationIntent, type PlannerPresentationRequest } from "../../shared/command/presentationCapability";

export interface FlowPlannerRuntime {
  now?: () => Date;
  createTransactionId?: () => string;
}

export function useFlowPlanner(runtime: FlowPlannerRuntime = {}) {
  const getNow = runtime.now ?? (() => new Date());
  const dateKey = localDateKey(getNow());
  const [snapshot, setSnapshot] = useState<PlannerSnapshot>(() => loadPlannerState(dateKey) ?? {
    plan: createInitialPlan(dateKey), past: [], future: [],
  });
  const [feedback, setFeedback] = useState(readyFeedback);
  const [pending, setPending] = useState<PendingInteraction>();
  const [preview, setPreview] = useState<PlannerPreview>();
  const [selectedId, setSelectedId] = useState<string>();
  const [lastTranscript, setLastTranscript] = useState("");
  const [presentationRequest, setPresentationRequest] = useState<PlannerPresentationRequest>();
  const presentationSequence = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const timerGeneration = useRef(0);
  const transactionSequence = useRef(0);
  const selected = useMemo(() => snapshot.plan.events.find((event) => event.id === selectedId), [snapshot.plan.events, selectedId]);

  useEffect(() => savePlannerState(snapshot), [snapshot]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  function clearResultTimer() {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    timerGeneration.current += 1;
  }

  function showResult(record: ChangeRecord, result: Extract<EngineResult, { status: "success" }>) {
    clearResultTimer();
    const generation = timerGeneration.current;
    const applying = applyingFeedback(record, result);
    setFeedback(applying);
    timer.current = window.setTimeout(() => {
      if (generation !== timerGeneration.current) return;
      setFeedback({ ...applying, phase: "completed", title: "Day reshaped" });
      timer.current = window.setTimeout(() => {
        if (generation === timerGeneration.current) setFeedback(readyFeedback);
      }, 900);
    }, 520);
  }

  function commitResult(request: CalendarRequest, result: Extract<EngineResult, { status: "success" }>, source: TransactionSource) {
    const changed = !plansEqual(result.plan, snapshot.plan);
    if (!changed) {
      clearResultTimer();
      setPending(undefined);
      setPreview(undefined);
      setFeedback({
        ...readyFeedback,
        phase: "completed",
        title: "No change needed",
        summary: result.summary,
        detail: result.detail,
        transcript: request.transcript,
      });
      return;
    }
    transactionSequence.current += 1;
    const record = createTransactionRecord(
      { now: getNow, createId: runtime.createTransactionId }, transactionSequence.current,
      request, result, source, snapshot.plan,
    );
    setSnapshot((state) => ({
      plan: result.plan,
      past: [...state.past, { plan: state.plan, lastChange: state.lastChange }],
      future: [], lastChange: record,
    }));
    const lastEventId = [...result.changes.changedIds].reverse().find((id) => result.plan.events.some((event) => event.id === id));
    if (lastEventId) setSelectedId(lastEventId);
    setPreview(undefined);
    showResult(record, result);
  }

  function applyReadyRequest(request: CalendarRequest, confirmed: boolean | string = false, source: TransactionSource = "type") {
    clearResultTimer();
    const contextualRequest = { ...request, nowMinutes: request.nowMinutes ?? minutesInDay(getNow()) };
    const result = executeRequest(snapshot.plan, contextualRequest, selectedId, confirmed);
    if (result.status === "clarification") {
      setPending({ type: "clarification", request: contextualRequest, clarification: result.clarification, source });
      setFeedback({ phase: "clarification", title: result.clarification.question, summary: "Choose one option.", detail: "Nothing changed yet.", transcript: request.transcript, changedIds: [] });
      return;
    }
    if (result.status === "confirmation") {
      setPending({ type: "confirmation", confirmation: result, source });
      const targetEventId = result.authorizationKey.split("|")[0]?.split(":")[2];
      setFeedback({ phase: "confirmation", title: result.title, summary: result.detail, detail: "Confirm or cancel.", transcript: request.transcript, changedIds: [], ...(targetEventId ? { targetEventId } : {}) });
      return;
    }
    if (result.status === "conflict") {
      setPending(undefined);
      const targeted = contextualRequest.actions.find((action) => "selector" in action);
      const resolvedTarget = targeted && "selector" in targeted
        ? resolveEventReference(snapshot.plan, targeted.selector, selectedId, contextualRequest.nowMinutes)
        : undefined;
      const targetEventId = resolvedTarget?.status === "resolved" && resolvedTarget.events.length === 1 ? resolvedTarget.events[0]?.id : undefined;
      setFeedback({ phase: "conflict", title: result.title, summary: result.detail, detail: result.options.slice(0, 3).join(" · "), transcript: request.transcript, changedIds: [], ...(targetEventId ? { targetEventId } : {}) });
      return;
    }
    setPending(undefined);
    if (contextualRequest.mode === "preview") {
      setPreview({ basePlan: snapshot.plan, proposedPlan: result.plan, request: contextualRequest, summary: result.summary, detail: result.detail, source });
      setFeedback({
        phase: "completed", title: "Preview — nothing committed", summary: result.summary,
        detail: "Say “Do it” or “Cancel the preview”.", transcript: request.transcript,
        changedIds: [...result.changes.changedIds], originById: result.changes.originById,
      });
      return;
    }
    commitResult(contextualRequest, result, source);
  }

  function undo() {
    clearResultTimer();
    const previous = snapshot.past.at(-1);
    if (!previous) return setFeedback({ ...readyFeedback, title: "Nothing to undo", summary: "This is the earliest saved state." });
    setPending(undefined);
    setPreview(undefined);
    const current = snapshot.plan;
    setSnapshot((state) => ({ plan: previous.plan, lastChange: previous.lastChange, past: state.past.slice(0, -1), future: [...state.future, { plan: state.plan, lastChange: state.lastChange }] }));
    setFeedback(replayFeedback("Change undone", "The exact previous state was restored.", snapshot.lastChange, current, previous.plan));
  }

  function redo() {
    clearResultTimer();
    const next = snapshot.future.at(-1);
    if (!next) return setFeedback({ ...readyFeedback, title: "Nothing to redo", summary: "There is no newer state." });
    setPending(undefined);
    setPreview(undefined);
    const current = snapshot.plan;
    setSnapshot((state) => ({ plan: next.plan, lastChange: next.lastChange, past: [...state.past, { plan: state.plan, lastChange: state.lastChange }], future: state.future.slice(0, -1) }));
    setFeedback(replayFeedback("Change redone", "The exact transaction was replayed.", next.lastChange, current, next.plan));
  }

  function commitPreview() {
    if (!preview) return setFeedback({ ...readyFeedback, title: "No preview to apply", summary: "Start with “What if…” to preview a change." });
    if (JSON.stringify(preview.basePlan) !== JSON.stringify(snapshot.plan)) {
      setPreview(undefined);
      return setFeedback({ ...readyFeedback, phase: "conflict", title: "The day changed", summary: "Run the preview again before applying it." });
    }
    const result = executeRequest(snapshot.plan, { ...preview.request, mode: "commit" }, selectedId, true);
    if (result.status === "success") commitResult({ ...preview.request, mode: "commit" }, result, preview.source);
  }

  function adjustPreview(action: Extract<CalendarAction, { type: "adjustPreview" }>) {
    if (!preview) return setFeedback({ ...readyFeedback, title: "No preview to adjust", summary: "Start with “What if…” first." });
    applyReadyRequest(adjustPreviewRequest(preview, action), false, preview.source);
  }

  function handleGlobal(action: CalendarAction, source: TransactionSource, transcript: string) {
    if (action.type === "undo") return undo();
    if (action.type === "redo") return redo();
    if (action.type === "cancel" || action.type === "cancelPreview") {
      setPreview(undefined);
      return cancelPending(lastTranscript);
    }
    if (action.type === "commitPreview") return commitPreview();
    if (action.type === "adjustPreview") return adjustPreview(action);
    if (action.type === "confirm") return confirmPending();
    if (action.type === "whatChanged") {
      const change = snapshot.lastChange;
      return setFeedback(change
        ? replayFeedback("What changed", change.summary, change, change.before ?? snapshot.plan, change.after ?? snapshot.plan)
        : { ...readyFeedback, phase: "completed", title: "No changes yet", summary: "This is the starting schedule." });
    }
    if (action.type === "reset") {
      const plan = createInitialPlan(dateKey);
      clearResultTimer();
      setPending(undefined); setPreview(undefined);
      if (plansEqual(snapshot.plan, plan)) {
        return setFeedback({ ...readyFeedback, phase: "completed", title: "Already at the starting day", summary: "Reset did not create a history entry.", transcript });
      }
      setSelectedId(undefined);
      transactionSequence.current += 1;
      const lastChange: ChangeRecord = {
        ...createTransactionMetadata({ now: getNow, createId: runtime.createTransactionId }, transactionSequence.current),
        summary: "The day was reset.", detail: "One undo restores the previous plan.",
        transcript, source, actions: [action], before: snapshot.plan, after: plan,
      };
      setSnapshot((state) => ({ plan, past: [...state.past, { plan: state.plan, lastChange: state.lastChange }], future: [], lastChange }));
      return setFeedback({
        ...readyFeedback,
        phase: "completed",
        title: "Day reset",
        summary: "The original plan was restored.",
        transcript,
        transactionId: lastChange.transactionId,
      });
    }
  }

  function confirmPending() {
    if (pending?.type === "confirmation") return applyReadyRequest(pending.confirmation.request, pending.confirmation.authorizationKey ?? true, pending.source ?? "type");
    return setFeedback({ ...readyFeedback, title: "Nothing to confirm", summary: "There is no destructive change waiting." });
  }

  function cancelPending(transcript?: string) {
    clearResultTimer();
    setPending(undefined);
    return setFeedback({ ...readyFeedback, phase: "completed", title: "Cancelled", summary: "Nothing was changed.", transcript });
  }

  function dispatch(actions: CalendarAction[], source: TransactionSource, transcript = "Direct calendar edit") {
    clearResultTimer();
    applyReadyRequest({ transcript, normalized: transcript.toLowerCase(), actions, constraints: [], nowMinutes: minutesInDay(getNow()) }, false, source);
  }

  function present(intent: PlannerPresentationIntent, transcript = intent.type === "voice-retry" ? "Retry voice command" : `${intent.open ? "Open" : "Hide"} Flow command`) {
    clearResultTimer(); setLastTranscript(transcript);
    if (intent.type === "command-surface" && !intent.open && (pending || preview)) {
      setFeedback({ ...readyFeedback, phase: "clarification", title: "Keep the pending request visible", detail: "Confirm or cancel before hiding the command.", transcript }); return;
    }
    setPresentationRequest({ intent, sequence: ++presentationSequence.current });
    setFeedback({ ...readyFeedback, phase: "completed", title: intent.type === "voice-retry" ? "Microphone retry requested" : intent.open ? "Command field opened" : "Command field hidden", summary: "No calendar data changed.", transcript });
  }
  function run(input: string, source: TransactionSource = "type") {
    const transcript = input.trim();
    if (!transcript) return;
    clearResultTimer();
    setLastTranscript(transcript);
    const presentation = parsePlannerPresentation(transcript);
    if (presentation) return present(presentation, transcript);
    const interpretation = interpretTranscript(transcript, snapshot.plan.dateKey);
    if (interpretation.status === "unsupported") {
      if (pending?.type === "clarification" && pending.clarification.type === "destination") {
        const clock = parseClockExpression(transcript);
        if (clock.status === "found") return applyReadyRequest(applyDestinationChoice(pending.request, pending.clarification.actionIndex, { type: "absolute", minutes: clock.minutes }), false, source);
      }
      setPending(undefined);
      setFeedback({ phase: "error", title: interpretation.title, summary: interpretation.detail, detail: "Nothing changed.", transcript, changedIds: [] });
      return;
    }
    const global = interpretation.request.actions.length === 1 ? interpretation.request.actions[0] : undefined;
    if (global && ["undo", "redo", "reset", "whatChanged", "confirm", "cancel", "commitPreview", "cancelPreview", "adjustPreview"].includes(global.type)) return handleGlobal(global, source, transcript);
    setFeedback({ phase: "understanding", title: "Understanding", summary: transcript, detail: "Checking anchors and open space…", transcript, changedIds: [] });
    applyReadyRequest(interpretation.request, false, source);
  }

  function chooseClarification(choiceId: string) {
    if (pending?.type !== "clarification") return;
    applyReadyRequest(applyPendingChoice(pending, choiceId), false, pending.source ?? "type");
  }

  return {
    plan: snapshot.plan, renderedPlan: preview?.proposedPlan ?? snapshot.plan, preview,
    feedback, pending, selected, lastTranscript, presentationRequest, present,
    canUndo: snapshot.past.length > 0, canRedo: snapshot.future.length > 0,
    run, dispatch, undo, redo, reset: () => run("Start over", "quick"), chooseClarification,
    confirm: confirmPending, cancel: () => cancelPending(),
    setSelected: (event: { id: string } | undefined) => setSelectedId(event?.id),
  };
}
