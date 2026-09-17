import type { CalendarEvent, CalendarPreservedField, CalendarRequest, DayPlan } from "../model";
import { formatTime } from "../time";
import type { EngineResult } from "./engineTypes";
import { resolve } from "./schedulePlacement";

interface ResolvedConstraint { event: CalendarEvent; at?: number; fields?: CalendarPreservedField[]; expectedDurationMinutes?: number; avoidTime?: number }
export function resolveConstraints(plan: DayPlan, request: CalendarRequest, selectedId?: string) {
  const kept: ResolvedConstraint[] = [];
  for (const constraint of request.constraints) {
    const events = resolve(plan, constraint.selector, selectedId, request);
    if (!Array.isArray(events)) return events;
    events.forEach((event) => kept.push({ event: { ...event }, ...(constraint.type === "preserve" ? { fields: constraint.fields, expectedDurationMinutes: constraint.expectedDurationMinutes } : constraint.type === "avoidTime" ? { avoidTime: constraint.minutes } : { at: constraint.at }) }));
  }
  return kept;
}
function fieldValue(event: CalendarEvent, field: CalendarPreservedField) { return field === "duration" ? event.end - event.start : event[field]; }
export function validateConstraints(before: DayPlan, plan: DayPlan, request: CalendarRequest, kept: ResolvedConstraint[]): EngineResult | null {
  // Keeping the whole schedule unchanged also forbids adding/removing events.
  if (request.constraints.some((constraint) => constraint.type === "preserve" && constraint.selector.type === "all" && constraint.fields.includes("dateKey"))
    && (plan.events.length !== before.events.length || plan.events.some(({ id }) => !before.events.some((event) => event.id === id)))) {
    return { status: "conflict", title: "The schedule must remain unchanged", detail: "That request would add, remove or move an event. Nothing changed.", options: ["Keep only the metadata change", "Allow the schedule change"] };
  }
  for (const keep of kept) {
    // A field guard is not an anchor: a date transfer may preserve title or
    // duration. Ordinary keep constraints deliberately require the active day.
    const current = (keep.fields || keep.avoidTime !== undefined ? [...plan.events, ...plan.deferred] : plan.events).find((event) => event.id === keep.event.id);
    if (keep.avoidTime !== undefined) {
      if (current?.start === keep.avoidTime) return { status: "conflict", title: `${keep.event.title} cannot start at ${formatTime(keep.avoidTime)}`, detail: "That is the time you excluded. Nothing changed.", options: ["Choose another time"] };
      continue;
    }
    if (keep.fields) {
      if (!current || (keep.expectedDurationMinutes !== undefined && current.end - current.start !== keep.expectedDurationMinutes) || keep.fields.some((field) => fieldValue(current, field) !== fieldValue(keep.event, field))) return {
        status: "conflict", title: `${keep.event.title} must keep its ${keep.fields.join(", ")}`,
        detail: "The requested change contradicts your unchanged-field constraint. Nothing changed.", options: ["Keep the original fields", "Allow the field change"],
      };
      continue;
    }
    if (!current || current.start !== keep.event.start || (keep.at !== undefined && current.start !== keep.at)) return {
      status: "conflict", title: `${keep.event.title} must stay anchored`,
      detail: keep.at === undefined ? "That compound request would move protected time. Nothing changed." : `${keep.event.title} is not at ${formatTime(keep.at)}. Nothing changed.`,
      options: ["Remove that constraint", "Choose a different window"],
    };
  }
  return null;
}
