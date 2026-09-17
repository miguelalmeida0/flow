import type { CalendarAction, CalendarEvent, CalendarRequest, DayPlan } from "../model";
import { eventProtected, eventStatus } from "../eventDefaults";
import { formatTime } from "../time";
import type { ChangeSet, EngineFailure } from "./engineTypes";
import { mergeEvents, splitEvent, updateEvents } from "./eventTransforms";
import { removeLinkedRooms } from "./linkedBreathingRooms";
import { deferEvent, uniqueId } from "./schedulePlacement";

type StateAction = Extract<CalendarAction, { type: "protect" | "unprotect" | "update" | "complete" | "reopen" | "split" | "merge" | "defer" | "delete" }>;

export function applyStateAction(
  plan: DayPlan,
  action: StateAction,
  targets: CalendarEvent[],
  changes: ChangeSet,
  request: CalendarRequest,
): EngineFailure | null {
  if (action.type === "protect" || action.type === "unprotect") {
    plan.events = plan.events.map((event) => {
      if (!targets.some((target) => target.id === event.id)) return event;
      const nextProtected = action.type === "protect";
      if (eventProtected(event) !== nextProtected) changes.changedIds.add(event.id);
      else changes.anchoredIds.add(event.id);
      return { ...event, protected: nextProtected };
    });
    changes.notes.push(`${targets.map((event) => event.title).join(", ")} ${action.type === "protect" ? "protected" : "unprotected"}.`);
    return null;
  }
  if (action.type === "update") {
    if (action.patch.status === "active") {
      if (targets.length !== 1) {
        return { status: "conflict", title: "Start one event at a time", detail: "Choose the single event that is current. Nothing changed.", options: ["Name the current event"] };
      }
      const target = targets[0]!;
      const alreadyActive = plan.events.find((event) => event.id !== target.id && eventStatus(event) === "active");
      if (alreadyActive) {
        return { status: "conflict", title: `${alreadyActive.title} is already active`, detail: `Complete ${alreadyActive.title} before starting ${target.title}. Nothing changed.`, options: [`Complete ${alreadyActive.title}`, "Keep the new event planned"] };
      }
      if (request.nowMinutes === undefined) {
        return { status: "conflict", title: "Current time is unavailable", detail: `${target.title} stayed planned because its current-time safety could not be checked.`, options: ["Try again when the time spine is visible"] };
      }
      if (request.nowMinutes < target.start || request.nowMinutes >= target.end) {
        return { status: "conflict", title: `${target.title} is not current`, detail: `${target.title} runs ${formatTime(target.start)}–${formatTime(target.end)}. Start it when the time spine reaches that block. Nothing changed.`, options: ["Choose the current event", `Wait until ${formatTime(target.start)}`] };
      }
    }
    updateEvents(plan, targets, action, changes);
    return null;
  }
  if (action.type === "complete" || action.type === "reopen") {
    const ids = new Set(targets.map((event) => event.id));
    plan.events = plan.events.map((event) => {
      if (!ids.has(event.id)) return event;
      changes.changedIds.add(event.id);
      if (action.type === "reopen") return { ...event, status: "planned" as const, completedAtMinutes: undefined };
      const completedAtMinutes = action.atMinutes
        ?? (action.earlyByMinutes ? event.end - action.earlyByMinutes : request.nowMinutes ?? event.end);
      if (completedAtMinutes > event.start && completedAtMinutes < event.end) {
        const roomId = uniqueId(plan, `reclaimed-${event.id}`);
        plan.breathingRooms = [...(plan.breathingRooms ?? []), {
          id: roomId, dateKey: plan.dateKey, start: completedAtMinutes, end: event.end,
          protected: false, source: "tide", label: `Reclaimed from ${event.title}`,
        }];
        changes.changedIds.add(roomId);
        changes.markerMinutes = completedAtMinutes;
        changes.markerLabel = `${event.end - completedAtMinutes} min reclaimed`;
      }
      return { ...event, status: "done" as const, completedAtMinutes };
    });
    if (action.type === "reopen") {
      plan.breathingRooms = (plan.breathingRooms ?? []).filter((room) => !targets.some((target) => room.id.startsWith(`reclaimed-${target.id}`)));
    }
    changes.notes.push(`${targets.map((event) => event.title).join(", ")} ${action.type === "reopen" ? "reopened" : "completed"}.`);
    return null;
  }
  if (action.type === "split") {
    if (targets.length !== 1) return { status: "conflict", title: "Choose one event to split", detail: "Split works on one event at a time.", options: ["Use its title or time"] };
    return splitEvent(plan, targets[0]!, action, changes);
  }
  if (action.type === "merge") {
    if (action.expectedCount !== undefined && targets.length !== action.expectedCount) {
      return {
        status: "conflict", title: `Expected ${action.expectedCount} matching events`,
        detail: `I found ${targets.length} matching event${targets.length === 1 ? "" : "s"}. Nothing changed.`,
        options: ["Adjust the count", "Name the events explicitly"],
      };
    }
    return mergeEvents(plan, targets, action.title, changes);
  }
  if (action.type === "defer") {
    for (const event of targets) {
      const error = deferEvent(plan, event, action.date, action.part, changes, action.atMinutes);
      if (error) return { status: "conflict", title: "No safe deferred slot", detail: `${error} Nothing changed.`, options: ["Choose another day"] };
    }
    return null;
  }
  if (action.type === "delete") {
    const removedRooms = removeLinkedRooms(plan, new Set(targets.map((target) => target.id)));
    plan.events = plan.events.filter((event) => !targets.some((target) => target.id === event.id));
    plan.deferred = plan.deferred.filter((event) => !targets.some((target) => target.id === event.id));
    targets.forEach((event) => changes.changedIds.add(event.id));
    removedRooms.forEach((room) => changes.changedIds.add(room.id));
    changes.notes.push(`${targets.map((event) => event.title).join(", ")} removed.${removedRooms.length ? ` ${removedRooms.length} linked Breathing Room${removedRooms.length === 1 ? "" : "s"} removed with it.` : ""}`);
    return null;
  }
  return null;
}

