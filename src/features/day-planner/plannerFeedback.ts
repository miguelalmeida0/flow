import type { CalendarAction, ChangeRecord, PlannerFeedback, PlannerSnapshot } from "./model";

export const readyFeedback: PlannerFeedback = {
  phase: "ready", title: "Day in balance",
  summary: "Tide can move flexible work around your anchors.",
  detail: "Tell Flow what changed.", changedIds: [],
};

export function transactionKind(actions: CalendarAction[]): PlannerFeedback["transactionKind"] {
  if (actions.some((action) => action.type === "createBreathingRoom" || action.type === "reflow")) return "tide";
  if (actions.some((action) => action.type === "split")) return "split";
  if (actions.some((action) => action.type === "merge")) return "merge";
  if (actions.some((action) => action.type === "complete" || action.type === "reopen")) return "complete";
  if (actions.some((action) => action.type === "update" && action.patch.color)) return "paint";
  if (actions.some((action) => action.type === "resize")) return "resize";
  if (actions.some((action) => action.type === "protect" || action.type === "unprotect")) return "protect";
  return "move";
}

export function minutesInDay(now: Date) {
  return now.getHours() * 60 + now.getMinutes();
}

export function replayFeedback(
  title: string,
  summary: string,
  record: ChangeRecord | undefined,
  from: PlannerSnapshot["plan"],
  to: PlannerSnapshot["plan"],
): PlannerFeedback {
  const fromEvents = new Map([...from.events, ...from.deferred].map((event) => [event.id, event]));
  const toEvents = new Map([...to.events, ...to.deferred].map((event) => [event.id, event]));
  const ids = new Set([...fromEvents.keys(), ...toEvents.keys()]);
  const changedIds = [...ids].filter((id) => JSON.stringify(fromEvents.get(id)) !== JSON.stringify(toEvents.get(id)));
  const originById = Object.fromEntries(changedIds.flatMap((id) => {
    const origin = fromEvents.get(id);
    return origin ? [[id, { start: origin.start, end: origin.end }]] : [];
  }));
  const deferredIds = changedIds.filter((id) => to.deferred.some((event) => event.id === id));
  const boundary = to.endBoundaryMinutes;
  return {
    ...readyFeedback,
    phase: "completed",
    title,
    summary,
    detail: record?.detail ?? "The complete transaction state was restored.",
    transcript: record?.transcript,
    transactionId: record?.transactionId,
    changedIds,
    deferredIds,
    originById,
    transactionKind: transactionKind(record?.actions ?? []),
    ...(boundary !== undefined && record?.actions?.some((action) => action.type === "setDayBoundary")
      ? { markerMinutes: boundary, markerLabel: `Finish boundary restored` }
      : {}),
  };
}


export function applyingFeedback(record: ChangeRecord, result: {
  detail: string;
  changes: {
    changedIds: Set<string>; anchoredIds: Set<string>; deferredIds: Set<string>;
    markerMinutes?: number; markerLabel?: string; originById: Record<string, { start: number; end: number }>;
  };
}): PlannerFeedback {
  return {
    phase: "applying", title: "Tide is reshaping the day", summary: record.summary,
    detail: result.detail, transcript: record.transcript,
    transactionId: record.transactionId,
    changedIds: [...result.changes.changedIds], anchoredIds: [...result.changes.anchoredIds],
    deferredIds: [...result.changes.deferredIds], markerMinutes: result.changes.markerMinutes,
    markerLabel: result.changes.markerLabel, originById: result.changes.originById,
    transactionKind: transactionKind(record.actions ?? []),
  };
}
