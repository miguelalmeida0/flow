import type { CalendarAction, CalendarEvent, CalendarRequest, DayPlan } from "../model";
import { canTideMove } from "../eventDefaults";
import { buildTideProposal } from "../tide/buildTideProposal";
import { DAY_END, DAY_START, duration, formatTime } from "../time";
import { applyGeometryAction } from "./applyGeometryAction";
import { applyStateAction } from "./applyStateAction";
import { createBreathingRoom, createOrFit } from "./createActions";
import type { ChangeSet, EngineFailure } from "./engineTypes";
import { movable, resolve } from "./schedulePlacement";
import { byStart, firstAvailable } from "./slots";
import { applyTideActions, tideFailure } from "./tideExecution";

export function applyCalendarAction(
  plan: DayPlan,
  action: CalendarAction,
  actionIndex: number,
  changes: ChangeSet,
  request: CalendarRequest,
  selectedId?: string,
  generatedActions?: CalendarAction[],
): EngineFailure | null {
  if (action.type === "undo" || action.type === "redo" || action.type === "reset" || action.type === "whatChanged"
    || action.type === "confirm" || action.type === "cancel" || action.type === "commitPreview"
    || action.type === "cancelPreview" || action.type === "adjustPreview") return null;
  if (action.type === "create" || action.type === "fit") return createOrFit(plan, action, changes, request, selectedId);
  if (action.type === "createBreathingRoom") return createBreathingRoom(plan, action, changes, request, selectedId);
  if (action.type === "setDayBoundary") {
    plan.endBoundaryMinutes = action.endMinutes;
    changes.markerMinutes = action.endMinutes;
    changes.markerLabel = `Finish by ${formatTime(action.endMinutes)}`;
    changes.notes.push(`Day boundary set to ${formatTime(action.endMinutes)}.`);
    return null;
  }
  if (action.type === "reflow") {
    const proposal = buildTideProposal(plan);
    if (proposal.risk !== "safe") return tideFailure(plan, request, proposal);
    generatedActions?.push(...proposal.actions);
    return applyTideActions(plan, proposal, changes, request, selectedId, actionIndex, generatedActions, applyCalendarAction);
  }
  if (action.type === "recover") {
    const cutoff = request.nowMinutes ?? DAY_START;
    const moving = byStart(plan.events.filter((event) => canTideMove(event) && event.start >= cutoff));
    const stationary = plan.events.filter((event) => !moving.some((candidate) => candidate.id === event.id));
    stationary.filter((event) => !canTideMove(event)).forEach((event) => changes.anchoredIds.add(event.id));
    if (!moving.length) {
      changes.notes.push("No remaining flexible work needed to move.");
      return null;
    }
    const scheduled: CalendarEvent[] = [];
    for (const event of moving) {
      const start = firstAvailable([...stationary, ...scheduled], duration(event), event.start + action.delayMinutes, DAY_END);
      if (start === null) return { status: "conflict", title: "The delay will not fit", detail: `${event.title} has no safe slot after absorbing ${action.delayMinutes} minutes. Nothing changed.`, options: ["Defer low-priority work", "Shorten a flexible event", "Choose a smaller delay"] };
      scheduled.push({ ...event, start, end: start + duration(event) });
      if (start !== event.start) changes.changedIds.add(event.id);
    }
    plan.events = byStart([...stationary, ...scheduled]);
    changes.markerMinutes = Math.min(...moving.map((event) => event.start + action.delayMinutes));
    changes.markerLabel = `${action.delayMinutes} min absorbed`;
    changes.notes.push(`${action.delayMinutes} minutes absorbed${action.assumedDelay ? " (assumed)" : ""}.`);
    return null;
  }

  const resolved = resolve(plan, action.selector, selectedId, request, action.type === "reopen");
  if (!Array.isArray(resolved)) return resolved;
  const guarded = action.type === "move" || action.type === "shift" || action.type === "resize" || action.type === "defer";
  const targets = guarded ? movable(plan, resolved, action.selector, changes) : resolved;
  if (!targets.length) return { status: "conflict", title: "Protected time stayed put", detail: "The matching events are fixed or protected. Name one explicitly to authorize moving it.", options: ["Choose a flexible event", "Unprotect it first"] };

  if (action.type === "resize" || action.type === "shift" || action.type === "move") {
    return applyGeometryAction(plan, action, targets, actionIndex, changes, request, selectedId);
  }
  return applyStateAction(plan, action, targets, changes, request);
}
