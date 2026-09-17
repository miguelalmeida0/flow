import type {
  CalendarEvent,
  EventColor,
  EventImportance,
  EventMobility,
  EventStatus,
} from "./model";

export function eventColor(event: CalendarEvent): EventColor {
  return event.color ?? "neutral";
}

export function eventImportance(event: CalendarEvent): EventImportance {
  if (event.importance) return event.importance;
  return event.priority === "high" ? "important" : "normal";
}

export function eventMobility(event: CalendarEvent): EventMobility {
  if (event.mobility) return event.mobility;
  if (event.kind === "fixed") return "anchored";
  if (event.kind === "protected") return "heavy";
  return "light";
}

export function eventProtected(event: CalendarEvent) {
  return event.protected ?? event.kind === "protected";
}

export function eventStatus(event: CalendarEvent): EventStatus {
  return event.status ?? "planned";
}

export function withEventDefaults(event: CalendarEvent): CalendarEvent {
  return {
    ...event,
    color: eventColor(event),
    labels: [...(event.labels ?? [])],
    importance: eventImportance(event),
    mobility: eventMobility(event),
    protected: eventProtected(event),
    status: eventStatus(event),
    bufferBeforeMinutes: event.bufferBeforeMinutes ?? 0,
    bufferAfterMinutes: event.bufferAfterMinutes ?? 0,
    ...(event.mergedFromIds ? { mergedFromIds: [...event.mergedFromIds] } : {}),
  };
}

export function canTideMove(event: CalendarEvent) {
  return !eventProtected(event)
    && eventMobility(event) !== "anchored"
    && eventStatus(event) !== "active"
    && eventStatus(event) !== "done"
    && eventStatus(event) !== "cancelled";
}
