import type { CalendarAction, CalendarRequest, DayPlan } from "../model";
import { buildTideProposal } from "../tide/buildTideProposal";
import { applyCalendarAction } from "./applyCalendarAction";
import { confirmationResult, inspectConfirmationScope, latestSurvivingId } from "./confirmation";
import { createChangeSet, type EngineResult } from "./engineTypes";
import { validatePlan } from "./invariants";
import { clonePlan, resolve } from "./schedulePlacement";
import { applyTideActions, tideFailure } from "./tideExecution";
import { resolveConstraints, validateConstraints } from "./requestConstraints";

const TIDE_TRIGGER_ACTIONS = new Set([
  "create", "move", "shift", "resize", "protect", "unprotect", "createBreathingRoom",
  "complete", "reopen", "setDayBoundary", "delete",
]);

export function executeRequest(plan: DayPlan, request: CalendarRequest, selectedId?: string, confirmed: boolean | string = false): EngineResult {
  const draft = clonePlan(plan);
  const changes = createChangeSet();
  const generatedActions: CalendarAction[] = [];
  const kept = resolveConstraints(draft, request, selectedId);
  if (!Array.isArray(kept)) return kept;

  const scope = inspectConfirmationScope(plan, request, selectedId);
  if (scope && "status" in scope) return scope;
  if (scope && confirmed !== true && confirmed !== scope.key) return confirmationResult(request, scope);

  let transactionSelectedId = selectedId;
  for (let actionIndex = 0; actionIndex < request.actions.length; actionIndex += 1) {
    const action = request.actions[actionIndex]!;
    const existingChangedIds = new Set(changes.changedIds);
    const resolvedBefore = "selector" in action
      ? resolve(draft, action.selector, transactionSelectedId, request, action.type === "reopen")
      : [];
    if (!Array.isArray(resolvedBefore)) return resolvedBefore;
    const failure = applyCalendarAction(draft, action, actionIndex, changes, request, transactionSelectedId, generatedActions);
    if (failure) return failure;
    const survivingResolvedId = [...resolvedBefore].reverse()
      .find((event) => [...draft.events, ...draft.deferred].some((candidate) => candidate.id === event.id))?.id;
    transactionSelectedId = latestSurvivingId(changes, draft, existingChangedIds) ?? survivingResolvedId ?? transactionSelectedId;
  }

  const shouldTide = request.actions.some((action) => TIDE_TRIGGER_ACTIONS.has(action.type))
    && !request.actions.some((action) => action.type === "reflow");
  if (shouldTide) {
    const proposal = buildTideProposal(draft);
    if (proposal.risk !== "safe") return tideFailure(draft, request, proposal);
    generatedActions.push(...proposal.actions);
    const failure = applyTideActions(
      draft, proposal, changes, request, transactionSelectedId,
      request.actions.length, generatedActions, applyCalendarAction,
    );
    if (failure) return failure;
    if (proposal.actions.length === 0 && request.actions.some((action) => action.type === "delete")) {
      changes.notes.push("Tide checked the remaining day; no reflow was needed.");
    }
  }

  const constraintFailure = validateConstraints(plan, draft, request, kept);
  if (constraintFailure) return constraintFailure;
  kept.filter(({ fields }) => !fields).forEach(({ event }) => changes.anchoredIds.add(event.id));
  const invalid = validatePlan(draft);
  if (invalid) {
    return { status: "conflict", title: "Schedule validation stopped the change", detail: `${invalid} Nothing changed.`, options: ["Choose another time", "Defer low-priority work"] };
  }
  for (const id of changes.changedIds) {
    const origin = [...plan.events, ...plan.deferred].find((event) => event.id === id);
    if (origin) changes.originById[id] = { start: origin.start, end: origin.end };
  }
  const summary = changes.notes.join(" ") || "The schedule already matched that request.";
  const anchored = changes.anchoredIds.size
    ? `${changes.anchoredIds.size} anchored event${changes.anchoredIds.size === 1 ? "" : "s"} stayed fixed.`
    : "No protected time moved.";
  return { status: "success", plan: draft, summary, detail: anchored, changes, executedActions: [...request.actions, ...generatedActions] };
}

export type { ChangeSet, EngineResult } from "./engineTypes";
