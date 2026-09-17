import type { CalendarEvent, CalendarRequest, DateTarget, DayPlan, Destination, EventSelector } from "../model";
import { dateKeyAfter, dayPartStart } from "../interpretation/temporal";
import { canTideMove, withEventDefaults } from "../eventDefaults";
import { DAY_END, DAY_START, duration, formatTime } from "../time";
import type { ChangeSet, EngineFailure } from "./engineTypes";
import { hasProtectedLinkedRoom, moveLinkedRooms } from "./linkedBreathingRooms";
import { resolveEventReference } from "./resolution";
import { byStart, firstAvailable, hasCollision, lastAvailable } from "./slots";

export function clonePlan(plan: DayPlan): DayPlan {
  return {
    ...plan,
    events: plan.events.map(withEventDefaults),
    deferred: plan.deferred.map(withEventDefaults),
    breathingRooms: (plan.breathingRooms ?? []).map((room) => ({ ...room })),
  };
}

function dateKeyFor(target: DateTarget | undefined, today: string) {
  if (!target || target === "today") return today;
  if (target === "tomorrow") return dateKeyAfter(today, 1);
  return target.dateKey;
}

export function resolve(plan: DayPlan, selector: EventSelector, selectedId: string | undefined, request: CalendarRequest, includeDone = false): CalendarEvent[] | EngineFailure {
  const destructive = request.actions.some((action) => action.type === "delete" && JSON.stringify(action.selector) === JSON.stringify(selector));
  const result = resolveEventReference(plan, selector, selectedId, request.nowMinutes, includeDone, destructive);
  if (result.status === "resolved") return result.events;
  if (result.status === "clarification") return { status: "clarification", request, clarification: result };
  return { status: "conflict", title: "Event not found", detail: result.detail, options: ["Use its time", "Use more of its title"] };
}

export function movable(plan: DayPlan, events: CalendarEvent[], selector: EventSelector, changes: ChangeSet) {
  if (selector.type !== "all" && !(selector.type === "filter" && selector.cardinality === "many")) return events;
  const allowed = events.filter((event) => canAutoMove(plan, event));
  events.filter((event) => !canAutoMove(plan, event)).forEach((event) => changes.anchoredIds.add(event.id));
  return allowed;
}

export function canAutoMove(plan: DayPlan, event: CalendarEvent) {
  return canTideMove(event) && !hasProtectedLinkedRoom(plan, event.id);
}

export function uniqueId(plan: DayPlan, title: string) {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "event";
  const ids = new Set([...plan.events, ...plan.deferred, ...(plan.breathingRooms ?? [])].map((event) => event.id));
  if (!ids.has(base)) return base;
  let suffix = 2;
  while (ids.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

export function deferEvent(
  plan: DayPlan,
  event: CalendarEvent,
  target: DateTarget,
  part: "morning" | "afternoon" | undefined,
  changes: ChangeSet,
  explicitStart?: number,
) {
  const dateKey = dateKeyFor(target, plan.dateKey);
  const start = explicitStart ?? (part ? dayPartStart(part) : event.start);
  const moved = { ...event, dateKey, start, end: start + duration(event) };
  const blocked = plan.deferred.filter((item) => item.dateKey === dateKey && item.id !== event.id);
  if (explicitStart !== undefined) {
    const collision = blocked.find((item) => hasCollision(moved, [item]));
    if (collision) return `${event.title} cannot start at ${formatTime(start)} on ${dateKey}: it would overlap ${collision.title}. Nothing changed.`;
    if (start < DAY_START || moved.end > DAY_END) return `${event.title} at ${formatTime(start)} on ${dateKey} falls outside the supported day. Nothing changed.`;
  }
  const fitted = explicitStart ?? firstAvailable(blocked, duration(moved), start, DAY_END);
  if (fitted === null) return `${event.title} has no open slot on ${dateKey}.`;
  moved.start = fitted;
  moved.end = fitted + duration(event);
  moveLinkedRooms(plan, event.id, fitted - event.start, dateKey);
  plan.events = plan.events.filter((item) => item.id !== event.id);
  plan.deferred = [...plan.deferred.filter((item) => item.id !== event.id), moved];
  changes.changedIds.add(event.id);
  changes.deferredIds.add(event.id);
  changes.notes.push(`${event.title} moved to ${dateKey}.`);
  return null;
}

export function placeToday(
  plan: DayPlan,
  event: CalendarEvent,
  destination: Destination,
  changes: ChangeSet,
  request: CalendarRequest,
  selectedId?: string,
  exact = false,
  makeRoom = false,
): EngineFailure | null {
  const length = duration(event);
  plan.deferred = plan.deferred.filter((item) => item.id !== event.id);
  let blocked = plan.events.filter((item) => item.id !== event.id);
  let start: number | null = null;
  if (destination.type === "unresolved") {
    return { status: "conflict", title: "A time is still needed", detail: `Choose a time for ${event.title}. Nothing changed.`, options: ["Choose one of the suggested times"] };
  }
  if (destination.type === "absolute") {
    const dateKey = dateKeyFor(destination.date, plan.dateKey);
    if (dateKey !== plan.dateKey) {
      const error = deferEvent(plan, event, destination.date ?? "today", undefined, changes, destination.minutes);
      return error ? { status: "conflict", title: "That time is unavailable", detail: error, options: ["Choose another time", "Move the blocking event explicitly"] } : null;
    }
    start = destination.minutes;
    if (!exact) start = firstAvailable(blocked, length, start, DAY_END);
  } else if (destination.type === "dayPart") {
    const dateKey = dateKeyFor(destination.date, plan.dateKey);
    if (dateKey !== plan.dateKey) return deferEvent(plan, event, destination.date, destination.part, changes)
      ? { status: "conflict", title: "No room on that day", detail: `${event.title} could not be deferred.`, options: ["Choose another day"] }
      : null;
    const from = dayPartStart(destination.part);
    const to = destination.part === "morning" ? 12 * 60 : 17 * 60;
    start = firstAvailable(blocked, length, from, to);
  } else if (destination.type === "window") {
    start = firstAvailable(blocked, length, destination.start, destination.end);
  } else if (destination.type === "nextFree") {
    start = firstAvailable(blocked, length, DAY_START, DAY_END);
  } else {
    const anchors = resolve(plan, destination.anchor, selectedId, request);
    if (!Array.isArray(anchors)) return anchors;
    const anchor = anchors[0];
    if (!anchor || anchor.id === event.id) return { status: "conflict", title: "Invalid anchor", detail: "An event cannot be placed relative to itself.", options: ["Choose another anchor"] };
    const alreadyRelative = destination.relation === "before" ? event.end <= anchor.start : event.start >= anchor.end;
    start = destination.preserveIfSatisfied && alreadyRelative && !hasCollision(event, blocked) ? event.start : destination.relation === "before"
      ? lastAvailable(blocked.filter((item) => item.id !== anchor.id), length, DAY_START, anchor.start)
      : firstAvailable(blocked.filter((item) => item.id !== anchor.id), length, anchor.end, DAY_END);
  }
  if (start === null || start < DAY_START || start + length > DAY_END) {
    return { status: "conflict", title: "No safe slot", detail: `${event.title} does not fit in the requested time. Nothing changed.`, options: ["Choose a different window", "Shorten a flexible event", "Move low-priority work to tomorrow"] };
  }
  const moved = { ...event, dateKey: plan.dateKey, start, end: start + length };
  if (exact && makeRoom && hasCollision(moved, blocked)) {
    const collisions = blocked.filter((item) => hasCollision(moved, [item]));
    if (collisions.length && collisions.every((collision) => canAutoMove(plan, collision))) {
      const anchored = blocked.filter((item) => !collisions.some((collision) => collision.id === item.id));
      const relocated: CalendarEvent[] = [];
      for (const collision of byStart(collisions)) {
        const occupied = [...anchored, moved, ...relocated];
        const nextStart = firstAvailable(occupied, duration(collision), moved.end, DAY_END)
          ?? lastAvailable(occupied, duration(collision), DAY_START, moved.start);
        if (nextStart === null) {
          return { status: "conflict", title: "No safe room", detail: `${collision.title} cannot move out of the requested time. Nothing changed.`, options: ["Choose another time", "Defer the flexible event"] };
        }
        relocated.push({ ...collision, start: nextStart, end: nextStart + duration(collision) });
        changes.changedIds.add(collision.id);
        changes.notes.push(`${collision.title} made room at ${formatTime(nextStart)}.`);
      }
      blocked = [...anchored, ...relocated];
    }
  }
  if (hasCollision(moved, blocked)) {
    const conflict = blocked.find((item) => hasCollision(moved, [item]));
    return { status: "conflict", title: "That time is occupied", detail: `${event.title} would overlap ${conflict?.title ?? "another event"}. Nothing changed.`, options: ["Choose another time", "Move the blocking event explicitly"] };
  }
  if (moved.start === event.start && moved.end === event.end && moved.dateKey === event.dateKey) {
    changes.anchoredIds.add(event.id);
    changes.notes.push(`${event.title} is already at ${formatTime(start)}.`);
    plan.events = byStart([...blocked, moved]);
    return null;
  }
  plan.events = byStart([...blocked, moved]);
  changes.changedIds.add(event.id);
  changes.notes.push(`${event.title} → ${formatTime(start)}.`);
  return null;
}
