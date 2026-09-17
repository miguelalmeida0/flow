import type { CalendarEvent, CalendarRequest, DayPlan } from "../model";
import { applyCalendarAction } from "./applyCalendarAction";
import { createChangeSet, type ChangeSet, type EngineFailure, type EngineResult } from "./engineTypes";
import { canAutoMove, clonePlan, resolve } from "./schedulePlacement";
import { eventDateLabel } from "./resolution";
import { formatTime } from "../time";

export interface ConfirmationScope {
  key: string;
  destructive: CalendarEvent[];
  anchored: CalendarEvent[];
  merge: CalendarEvent[];
  proposed?: CalendarEvent[];
}

export function latestSurvivingId(changes: ChangeSet, plan: DayPlan, existing = new Set<string>()) {
  const liveIds = new Set([...plan.events, ...plan.deferred].map((event) => event.id));
  return [...changes.changedIds].reverse().find((id) => !existing.has(id) && liveIds.has(id));
}

export function inspectConfirmationScope(plan: DayPlan, request: CalendarRequest, selectedId?: string): ConfirmationScope | EngineFailure | null {
  const draft = clonePlan(plan);
  const changes = createChangeSet();
  const destructive: CalendarEvent[] = [];
  const anchored: CalendarEvent[] = [];
  const merge: CalendarEvent[] = [];
  const tokens: string[] = [];
  let transactionSelectedId = selectedId;
  for (let actionIndex = 0; actionIndex < request.actions.length; actionIndex += 1) {
    const action = request.actions[actionIndex]!;
    const existingChangedIds = new Set(changes.changedIds);
    let resolvedIds: string[] = [];
    if ("selector" in action) {
      const resolved = resolve(draft, action.selector, transactionSelectedId, request, action.type === "reopen");
      if (!Array.isArray(resolved)) return resolved;
      resolvedIds = resolved.map((event) => event.id);
      if (action.type === "delete") {
        resolved.forEach((event) => { destructive.push(event); tokens.push(`${actionIndex}:delete:${event.id}`); });
      }
      if (action.type === "merge") {
        resolved.forEach((event) => { merge.push(event); tokens.push(`${actionIndex}:merge:${event.id}`); });
      }
      if (["move", "shift", "defer", "split"].includes(action.type)
        && action.selector.type !== "all"
        && !(action.selector.type === "filter" && action.selector.cardinality === "many")) {
        resolved.filter((event) => !canAutoMove(draft, event)).forEach((event) => {
          anchored.push(event);
          tokens.push(`${actionIndex}:${action.type}:${event.id}`);
        });
      }
    }
    const failure = applyCalendarAction(draft, action, actionIndex, changes, request, transactionSelectedId, []);
    if (failure) {
      const explicitCrossDate = action.type === "move" && action.destination.type === "absolute" && action.destination.date
        && (typeof action.destination.date === "string" ? action.destination.date === "tomorrow" : action.destination.date.dateKey !== plan.dateKey);
      // An unavailable exact destination cannot be authorized or bind a
      // following “it” to a move that never happened in the preview draft.
      if (tokens.length && !explicitCrossDate) continue;
      return failure;
    }
    const survivingResolvedId = [...resolvedIds].reverse().find((id) => [...draft.events, ...draft.deferred].some((event) => event.id === id));
    transactionSelectedId = latestSurvivingId(changes, draft, existingChangedIds) ?? survivingResolvedId ?? transactionSelectedId;
  }
  if (!tokens.length) return null;
  const unique = (events: CalendarEvent[]) => [...new Map(events.map((event) => [event.id, event])).values()];
  return { key: [...new Set(tokens)].join("|"), destructive: unique(destructive), anchored: unique(anchored), merge: unique(merge), proposed: [...draft.events, ...draft.deferred] };
}

export function confirmationResult(request: CalendarRequest, scope: ConfirmationScope): Extract<EngineResult, { status: "confirmation" }> {
  const destructiveNames = scope.destructive.map((event) => event.title);
  const mergeNames = scope.merge.map((event) => event.title);
  const anchoredNames = scope.anchored.map((event) => event.title);
  const allNames = [...new Set([...destructiveNames, ...mergeNames, ...anchoredNames])];
  if (scope.destructive.length && !scope.merge.length && !scope.anchored.length) {
    return {
      status: "confirmation", request, authorizationKey: scope.key,
      title: `Remove ${destructiveNames.join(", ")}?`,
      detail: `${scope.destructive.map((event) => `${event.title} · ${eventDateLabel(event.dateKey)}, ${formatTime(event.start)}–${formatTime(event.end)}`).join("; ")}. Only these events and their linked Breathing Room will be removed. Other dates stay unchanged.`,
      confirmLabel: "Confirm removal",
    };
  }
  if (scope.merge.length && !scope.destructive.length && !scope.anchored.length) {
    return {
      status: "confirmation", request, authorizationKey: scope.key,
      title: `Combine ${mergeNames.join(", ")}?`,
      detail: `These ${scope.merge.length} source blocks become one undoable event; their full ancestry remains in history.`,
      confirmLabel: "Combine events",
    };
  }
  if (scope.anchored.length === 1 && !scope.destructive.length && !scope.merge.length) {
    const name = scope.anchored[0]!.title;
    const before = scope.anchored[0]!;
    const after = scope.proposed?.find(({ id }) => id === before.id);
    const duration = after && after.end - after.start !== before.end - before.start
      ? `Its duration changes from ${before.end - before.start} to ${after.end - after.start} minutes.`
      : `Its ${before.end - before.start}-minute duration stays the same.`;
    const movement = after && (after.start !== before.start || after.dateKey !== before.dateKey)
      ? ` From ${eventDateLabel(before.dateKey)}, ${formatTime(before.start)} to ${eventDateLabel(after.dateKey)}, ${formatTime(after.start)}. ${duration}` : "";
    return {
      status: "confirmation", request, authorizationKey: scope.key,
      title: `Move anchored ${name}?`,
      detail: `${name} is fixed or protected.${movement} It will move only after your explicit confirmation.`,
      confirmLabel: "Move anyway",
    };
  }
  return {
    status: "confirmation", request, authorizationKey: scope.key,
    title: `Review changes to ${allNames.join(", ")}?`,
    detail: `${scope.destructive.length ? `Remove: ${destructiveNames.join(", ")}. ` : ""}${scope.merge.length ? `Combine: ${mergeNames.join(", ")}. ` : ""}${scope.anchored.length ? `Release or move anchored: ${anchoredNames.join(", ")}.` : ""}`,
    confirmLabel: "Confirm all listed changes",
  };
}
