import { canTideMove, eventImportance, eventMobility, eventStatus } from "../eventDefaults";
import type { CalendarAction, CalendarEvent, DayPlan } from "../model";
import { DAY_END, DAY_START, duration } from "../time";
import { dateKeyAfter } from "../interpretation/temporal";
import { byStart, firstAvailable, hasCollision, lastAvailable } from "../scheduling/slots";
import { scoreSchedule, type ScheduleScore } from "./scoreSchedule";
import { hasProtectedLinkedRoom } from "../scheduling/linkedBreathingRooms";

export interface TideProposal {
  plan: DayPlan;
  movedIds: string[];
  deferredIds: string[];
  anchoredIds: string[];
  beforeScore: ScheduleScore;
  afterScore: ScheduleScore;
  risk: "safe" | "review" | "blocked";
  reasons: string[];
  actions: CalendarAction[];
}

function roomEvents(plan: DayPlan): CalendarEvent[] {
  return (plan.breathingRooms ?? []).filter((room) => room.dateKey === plan.dateKey).map((room) => ({
    id: room.id, title: room.label ?? "Breathing Room", dateKey: room.dateKey,
    start: room.start, end: room.end, kind: "fixed", priority: "high",
    mobility: "anchored", protected: room.protected, status: "planned",
  }));
}

function deferRank(event: CalendarEvent) {
  const importance = { normal: 0, important: 10, critical: 100 }[eventImportance(event)];
  const mobility = { fluid: 0, light: 2, heavy: 8, anchored: 100 }[eventMobility(event)];
  return importance + mobility + (event.priority === "low" ? 0 : event.priority === "medium" ? 4 : 12);
}

export function buildTideProposal(plan: DayPlan): TideProposal {
  const draft: DayPlan = {
    ...plan,
    events: plan.events.map((event) => ({ ...event, labels: [...(event.labels ?? [])] })),
    deferred: plan.deferred.map((event) => ({ ...event, labels: [...(event.labels ?? [])] })),
    breathingRooms: (plan.breathingRooms ?? []).map((room) => ({ ...room })),
  };
  const boundary = draft.endBoundaryMinutes ?? DAY_END;
  const live = draft.events.filter((event) => !["done", "cancelled"].includes(eventStatus(event)));
  const finished = draft.events.filter((event) => ["done", "cancelled"].includes(eventStatus(event)));
  const autoMovable = (event: CalendarEvent) => canTideMove(event) && !hasProtectedLinkedRoom(draft, event.id);
  const anchored = live.filter((event) => !autoMovable(event));
  const moving = byStart(live.filter(autoMovable));
  const scheduled: CalendarEvent[] = [];
  const movedIds: string[] = [];
  const deferredIds: string[] = [];
  const anchoredIds = anchored.map((event) => event.id);
  const blockers = [...anchored, ...roomEvents(draft)];
  const anchoredOverflow = blockers.find((event) => event.end > boundary);
  if (anchoredOverflow) {
    return {
      plan, movedIds: [], deferredIds: [], anchoredIds, actions: [], beforeScore: scoreSchedule(plan, plan), afterScore: scoreSchedule(plan, plan),
      risk: "blocked", reasons: [`${anchoredOverflow.title} ends at ${Math.floor(anchoredOverflow.end / 60)}:${String(anchoredOverflow.end % 60).padStart(2, "0")}, after the day boundary.`],
    };
  }
  const orderedBlockers = byStart(blockers);
  for (let index = 1; index < orderedBlockers.length; index += 1) {
    const previous = orderedBlockers[index - 1];
    const current = orderedBlockers[index];
    if (previous && current && current.start < previous.end) {
      return {
        plan, movedIds: [], deferredIds: [], anchoredIds, actions: [],
        beforeScore: scoreSchedule(plan, plan), afterScore: scoreSchedule(plan, plan),
        risk: "blocked",
        reasons: [`${current.title} overlaps anchored ${previous.title}; Tide will not move either automatically.`],
      };
    }
  }

  for (const event of moving) {
    const occupied = [...blockers, ...scheduled];
    const stays = event.start >= DAY_START && event.end <= boundary && !hasCollision(event, occupied);
    if (stays) {
      scheduled.push(event);
      continue;
    }
    const length = duration(event);
    const later = firstAvailable(occupied, length, Math.max(DAY_START, event.start), boundary);
    const earlier = lastAvailable(occupied, length, DAY_START, Math.min(boundary, event.start));
    const start = later ?? earlier;
    if (start !== null) {
      scheduled.push({ ...event, start, end: start + length });
      if (start !== event.start) movedIds.push(event.id);
      continue;
    }
    const deferrable = eventImportance(event) === "normal" && eventMobility(event) !== "heavy";
    if (!deferrable) {
      return {
        plan, movedIds: [], deferredIds: [], anchoredIds, actions: [], beforeScore: scoreSchedule(plan, plan), afterScore: scoreSchedule(plan, plan),
        risk: "blocked", reasons: [`${event.title} cannot fit without moving an anchored or important event.`],
      };
    }
    const tomorrow = dateKeyAfter(plan.dateKey, 1);
    const deferredToday = draft.deferred.filter((item) => item.dateKey === tomorrow);
    const startTomorrow = firstAvailable(deferredToday, length, Math.max(DAY_START, event.start), DAY_END)
      ?? firstAvailable(deferredToday, length, DAY_START, DAY_END);
    if (startTomorrow === null) {
      return {
        plan, movedIds: [], deferredIds: [], anchoredIds, actions: [], beforeScore: scoreSchedule(plan, plan), afterScore: scoreSchedule(plan, plan),
        risk: "blocked", reasons: [`${event.title} has no safe slot today or tomorrow.`],
      };
    }
    draft.deferred.push({ ...event, dateKey: tomorrow, start: startTomorrow, end: startTomorrow + length });
    deferredIds.push(event.id);
  }

  // Lower-risk work is the first candidate for deferral; the sort is a stable,
  // documented tie-breaker rather than an opaque score.
  draft.deferred.sort((left, right) => deferRank(left) - deferRank(right) || left.start - right.start || left.id.localeCompare(right.id));
  draft.events = byStart([...finished, ...anchored, ...scheduled]).filter((event) => !deferredIds.includes(event.id));
  const reasons = [
    movedIds.length ? `${movedIds.length} flexible event${movedIds.length === 1 ? "" : "s"} moved.` : "No flexible event needed to move.",
    deferredIds.length ? `${deferredIds.length} low-risk event${deferredIds.length === 1 ? "" : "s"} moved to tomorrow.` : "Nothing was deferred.",
  ];
  const actions: CalendarAction[] = [
    ...movedIds.map((id): CalendarAction => {
      const event = draft.events.find((candidate) => candidate.id === id)!;
      return { type: "move", selector: { type: "id", id }, destination: { type: "absolute", minutes: event.start }, origin: "tide" };
    }),
    ...deferredIds.map((id): CalendarAction => {
      const event = draft.deferred.find((candidate) => candidate.id === id)!;
      return { type: "defer", selector: { type: "id", id }, date: { dateKey: event.dateKey }, atMinutes: event.start, origin: "tide" };
    }),
  ];
  return {
    plan: draft, movedIds, deferredIds, anchoredIds, actions,
    beforeScore: scoreSchedule(plan, plan), afterScore: scoreSchedule(plan, draft),
    risk: "safe", reasons,
  };
}
