import type { CalendarAction, CalendarRequest, DayPlan } from "../model";
import { buildTideProposal } from "../tide/buildTideProposal";
import { DAY_END, DAY_START, formatTime } from "../time";
import type { ChangeSet, EngineFailure } from "./engineTypes";
import { clonePlan } from "./schedulePlacement";

export type ActionExecutor = (
  plan: DayPlan,
  action: CalendarAction,
  actionIndex: number,
  changes: ChangeSet,
  request: CalendarRequest,
  selectedId?: string,
  generatedActions?: CalendarAction[],
) => EngineFailure | null;

export function closestSafeBoundary(plan: DayPlan, requested: number) {
  const firstCandidate = Math.max(DAY_START, Math.ceil((requested + 1) / 15) * 15);
  for (let endMinutes = firstCandidate; endMinutes <= DAY_END; endMinutes += 15) {
    const candidate = clonePlan(plan);
    candidate.endBoundaryMinutes = endMinutes;
    if (buildTideProposal(candidate).risk === "safe") return endMinutes;
  }
  return null;
}

export function tideFailure(plan: DayPlan, request: CalendarRequest, proposal: ReturnType<typeof buildTideProposal>): EngineFailure {
  const boundaryIndex = request.actions.findIndex((action) => action.type === "setDayBoundary");
  const boundaryAction = boundaryIndex >= 0 ? request.actions[boundaryIndex] : undefined;
  if (boundaryAction?.type === "setDayBoundary") {
    const alternative = closestSafeBoundary(plan, boundaryAction.endMinutes);
    if (alternative !== null) {
      return {
        status: "clarification",
        request,
        clarification: {
          type: "boundary",
          actionIndex: boundaryIndex,
          question: `${proposal.reasons.join(" ")} Finish at ${formatTime(alternative)} instead?`,
          choices: [{ id: `boundary:${alternative}`, label: `${formatTime(alternative)} — closest safe finish`, endMinutes: alternative }],
        },
      };
    }
  }
  return { status: "conflict", title: "Tide needs a decision", detail: proposal.reasons.join(" "), options: ["Move the boundary later", "Unprotect an event", "Defer low-priority work"] };
}

export function applyTideActions(
  plan: DayPlan,
  proposal: ReturnType<typeof buildTideProposal>,
  changes: ChangeSet,
  request: CalendarRequest,
  selectedId: string | undefined,
  actionIndex: number,
  generatedActions: CalendarAction[] | undefined,
  execute: ActionExecutor,
): EngineFailure | null {
  for (let index = 0; index < proposal.actions.length; index += 1) {
    const failure = execute(plan, proposal.actions[index]!, actionIndex + index + 1, changes, request, selectedId, generatedActions);
    if (failure) return failure;
  }
  // A no-op Tide pass must not inflate the transaction with every anchored
  // item in the day. Anchors are meaningful feedback only when Tide actually
  // had flexible work to route around them.
  if (proposal.actions.length > 0) {
    proposal.anchoredIds.forEach((id) => changes.anchoredIds.add(id));
    changes.notes.push(...proposal.reasons);
  }
  return null;
}

