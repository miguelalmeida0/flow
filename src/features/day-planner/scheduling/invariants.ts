import type { DayPlan } from "../model";
import { eventStatus } from "../eventDefaults";
import { DAY_END, DAY_START } from "../time";
import { linkedGeometryError } from "./linkedBreathingRooms";

export function validatePlan(plan: DayPlan): string | null {
  const all = [...plan.events, ...plan.deferred];
  const ids = new Set<string>();
  for (const event of all) {
    if (!event.id || ids.has(event.id)) return `Event IDs must be unique; “${event.id}” is duplicated.`;
    ids.add(event.id);
    if (!event.title.trim()) return "Every event needs a title.";
    if (event.end <= event.start) return `${event.title} must have a positive duration.`;
    if ((event.bufferBeforeMinutes ?? 0) < 0 || (event.bufferAfterMinutes ?? 0) < 0) return `${event.title} has an invalid negative buffer.`;
    if (event.start < DAY_START || event.end > DAY_END) return `${event.title} falls outside the supported 7 AM–9 PM day.`;
  }
  for (const room of plan.breathingRooms ?? []) {
    if (!room.id || ids.has(room.id)) return `Schedule item IDs must be unique; “${room.id}” is duplicated.`;
    ids.add(room.id);
    if (room.end <= room.start) return "Breathing Room must have a positive duration.";
    if (room.start < DAY_START || room.end > DAY_END) return "Breathing Room falls outside the supported 7 AM–9 PM day.";
  }
  if (plan.endBoundaryMinutes !== undefined && (plan.endBoundaryMinutes < DAY_START || plan.endBoundaryMinutes > DAY_END)) {
    return "The end-of-day boundary falls outside the supported day.";
  }
  if (plan.events.some((event) => event.dateKey !== plan.dateKey)) return "Today’s event list contains an event from another date.";
  if (plan.deferred.some((event) => event.dateKey === plan.dateKey)) return "A deferred event still points to today.";
  if (plan.deferred.some((event) => eventStatus(event) === "active")) return "Deferred work cannot be active.";
  const active = plan.events.filter((event) => eventStatus(event) === "active");
  if (active.length > 1) return `Only one event can be active; ${active.map((event) => event.title).join(" and ")} are both active.`;

  const dates = new Map<string, { start: number; end: number; title: string; id: string }[]>();
  for (const event of all.filter((item) => !["done", "cancelled"].includes(eventStatus(item)))) {
    dates.set(event.dateKey, [...(dates.get(event.dateKey) ?? []), event]);
  }
  for (const room of plan.breathingRooms ?? []) {
    dates.set(room.dateKey, [...(dates.get(room.dateKey) ?? []), { ...room, title: room.label ?? "Breathing Room" }]);
  }
  for (const occupants of dates.values()) {
    const ordered = [...occupants].sort((left, right) => left.start - right.start || left.id.localeCompare(right.id));
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const current = ordered[index];
      if (previous && current && current.start < previous.end) return `${current.title} overlaps ${previous.title}.`;
    }
  }
  const linkage = linkedGeometryError(plan);
  if (linkage) return linkage;
  if (plan.endBoundaryMinutes !== undefined) {
    const overflow = plan.events.find((event) => eventStatus(event) !== "done" && eventStatus(event) !== "cancelled" && event.end > plan.endBoundaryMinutes!);
    if (overflow) return `${overflow.title} ends after the day boundary.`;
  }
  return null;
}
