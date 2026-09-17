import type { CalendarAction, CalendarEvent, CalendarRequest, DayPlan } from "../model";
import { canTideMove } from "../eventDefaults";
import { DAY_END, DAY_START, duration, formatTime } from "../time";
import type { ChangeSet, EngineFailure } from "./engineTypes";
import { moveLinkedRooms } from "./linkedBreathingRooms";
import { placeToday } from "./schedulePlacement";
import { byStart, hasCollision, suggestAlternativeSlots } from "./slots";

type GeometryAction = Extract<CalendarAction, { type: "resize" | "shift" | "move" }>;

export function applyGeometryAction(
  plan: DayPlan,
  action: GeometryAction,
  targets: CalendarEvent[],
  actionIndex: number,
  changes: ChangeSet,
  request: CalendarRequest,
  selectedId?: string,
): EngineFailure | null {
  if (action.type === "resize") {
    for (const target of targets) {
      const nextDuration = action.mode === "end" ? action.minutes - target.start
        : action.mode === "set" ? action.minutes : duration(target) + action.minutes;
      if (nextDuration <= 0) return { status: "conflict", title: "Duration must stay positive", detail: `${target.title} cannot be shortened by that much. Nothing changed.`, options: ["Choose a shorter reduction"] };
      const resized = { ...target, end: target.start + nextDuration };
      const onActiveDate = target.dateKey === plan.dateKey;
      const endBoundary = onActiveDate ? plan.endBoundaryMinutes ?? DAY_END : DAY_END;
      if (resized.end > endBoundary) return { status: "conflict", title: "The resize exceeds the day", detail: `${target.title} would end after your working window.`, options: ["Choose a shorter duration"] };
      const collision = [...plan.events, ...plan.deferred].find((event) => event.id !== target.id && hasCollision(resized, [event]));
      // Tide only rearranges the active date. A moved event must still resize
      // in its destination collection, without promising a later-day reflow.
      if (collision && (!onActiveDate || !canTideMove(collision))) return { status: "conflict", title: "The resize would overlap", detail: `${target.title} would overlap ${collision.title}.`, options: ["Move it first", "Choose a shorter duration"] };
      plan.events = plan.events.map((event) => event.id === target.id ? resized : event);
      plan.deferred = plan.deferred.map((event) => event.id === target.id ? resized : event);
      const delta = resized.end - target.end;
      plan.breathingRooms = (plan.breathingRooms ?? []).map((room) => room.linkedEventId === target.id && room.relation === "after"
        ? { ...room, start: room.start + delta, end: room.end + delta }
        : room);
      changes.changedIds.add(target.id);
      changes.notes.push(`${target.title} is now ${nextDuration} minutes.`);
    }
    return null;
  }
  if (action.type === "shift") {
    if (targets.length > 1) {
      plan.events = plan.events.filter((event) => !targets.some((target) => target.id === event.id));
      for (const target of byStart(targets)) {
        const failure = placeToday(plan, target, { type: "absolute", minutes: target.start + action.deltaMinutes }, changes, request, selectedId, false);
        if (failure) return failure;
        const current = plan.events.find((event) => event.id === target.id);
        if (current) moveLinkedRooms(plan, target.id, current.start - target.start);
      }
      changes.notes.push(`${targets.length} events shifted ${Math.abs(action.deltaMinutes)} minutes ${action.deltaMinutes < 0 ? "earlier" : "later"}.`);
      return null;
    }
    for (const target of targets) {
      const destination = target.start + action.deltaMinutes;
      if (destination < DAY_START || destination + duration(target) > DAY_END) return { status: "conflict", title: "The shift exceeds the day", detail: `${target.title} cannot move ${Math.abs(action.deltaMinutes)} minutes ${action.deltaMinutes < 0 ? "earlier" : "later"}. Nothing changed.`, options: ["Choose another amount"] };
      const failure = placeToday(plan, target, { type: "absolute", minutes: destination }, changes, request, selectedId, true, true);
      if (failure) return failure;
      moveLinkedRooms(plan, target.id, action.deltaMinutes);
      changes.notes.push(`${target.title} shifted ${Math.abs(action.deltaMinutes)} minutes ${action.deltaMinutes < 0 ? "earlier" : "later"}.`);
    }
    return null;
  }
  if (action.type === "move") {
    if (action.origin === "tide") {
      if (action.destination.type !== "absolute") return { status: "conflict", title: "Invalid Tide action", detail: "Tide generated a move without an exact destination.", options: ["Try the request again"] };
      const destinationMinutes = action.destination.minutes;
      for (const target of targets) {
        const length = duration(target);
        const delta = destinationMinutes - target.start;
        plan.events = byStart(plan.events.map((event) => event.id === target.id
          ? { ...event, start: destinationMinutes, end: destinationMinutes + length }
          : event));
        moveLinkedRooms(plan, target.id, delta);
        changes.changedIds.add(target.id);
        changes.notes.push(`${target.title} flowed to ${formatTime(destinationMinutes)}.`);
      }
      return null;
    }
    const ordered = byStart(targets);
    if (action.destination.type === "unresolved") {
      if (ordered.length !== 1) {
        return { status: "conflict", title: "Choose one event first", detail: "I need one event before I can suggest another time. Nothing changed.", options: ["Name the event", "Select it on the calendar"] };
      }
      const target = ordered[0]!;
      const starts = suggestAlternativeSlots(plan.events, target);
      if (!starts.length) {
        return { status: "conflict", title: "No safe alternative", detail: `${target.title} has no other collision-free slot today. Nothing changed.`, options: ["Move it to tomorrow", "Shorten the event"] };
      }
      return {
        status: "clarification",
        request,
        clarification: {
          type: "destination",
          question: `When should I move ${target.title}?`,
          actionIndex,
          choices: starts.map((start) => ({
            id: `time:${start}`,
            label: `${formatTime(start)}–${formatTime(start + duration(target))}`,
            destination: { type: "absolute", minutes: start },
          })),
        },
      };
    }
    if (ordered.length > 1) plan.events = plan.events.filter((event) => !ordered.some((target) => target.id === event.id));
    let cursor = action.destination.type === "absolute" ? action.destination.minutes : undefined;
    for (const target of ordered) {
      let destination = action.destination;
      if (destination.type === "absolute" && cursor !== undefined) destination = { ...destination, minutes: cursor };
      const exact = ordered.length === 1 && destination.type === "absolute";
      const failure = placeToday(plan, target, destination, changes, request, selectedId, exact, exact);
      if (failure) return failure;
      const current = [...plan.events, ...plan.deferred].find((event) => event.id === target.id);
      if (current && current.dateKey === target.dateKey) moveLinkedRooms(plan, target.id, current.start - target.start);
      if (cursor !== undefined) cursor = plan.events.find((event) => event.id === target.id)?.end ?? cursor;
    }
  }
  return null;
  return null;
}
