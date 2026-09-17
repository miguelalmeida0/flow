import type { LifeDocument, TemporalScope } from "../domain/life-model";
import { allCalendarPlans } from "../domain/life-calendar-world";
import type { CalendarRequest, DayPlan, EventClarificationRequest } from "../features/day-planner/model";
import { dateKeyAfter } from "../features/day-planner/interpretation/temporal";
import { resolveEventReference } from "../features/day-planner/scheduling/resolution";

/** This is a reference-only projection. It must never be passed to a schedule
 * transform: overlapping clock positions on different dates are legitimate. */
export function calendarReferenceScope(document: LifeDocument, scope?: TemporalScope): DayPlan {
  const referenceEvents = allCalendarPlans(document).flatMap(({ events, deferred }) => [...events, ...deferred]);
  if (scope?.kind !== "week") return { ...(scope?.dateKey && scope.dateKey !== document.calendar.dateKey ? document.calendars[scope.dateKey] ?? { dateKey: scope.dateKey, events: [], deferred: [] } : document.calendar), referenceEvents };
  const last = scope.endDateKey ?? dateKeyAfter(scope.dateKey, 6);
  const plans = allCalendarPlans(document).filter(({ dateKey }) => dateKey >= scope.dateKey && dateKey <= last);
  return { dateKey: scope.dateKey, events: plans.flatMap(({ events }) => events), deferred: plans.flatMap(({ deferred }) => deferred), referenceEvents };
}

export function calendarRequestSourceDate(document: LifeDocument, scope: TemporalScope, request: CalendarRequest, selectedId?: string): { dateKey: string } | { question: string; detail: string; clarification?: EventClarificationRequest } {
  const pool = calendarReferenceScope(document, scope);
  const dates = new Set<string>();
  let priorTarget = false;
  for (const action of [...request.actions, ...request.constraints]) {
    if (action.type === "create" || action.type === "fit") { priorTarget = true; continue; }
    if (!("selector" in action) || (dates.size && ["selected", "anaphor"].includes(action.selector.type))) continue;
    if (priorTarget && ["selected", "anaphor"].includes(action.selector.type)) continue;
    const targetPool = dates.size === 1 && !action.selector.date && ["keep", "preserve", "avoidTime"].includes(action.type)
      ? calendarReferenceScope(document, { kind: "day", dateKey: [...dates][0]! }) : pool;
    const resolved = resolveEventReference(targetPool, action.selector, selectedId, request.nowMinutes, action.type === "reopen", action.type === "delete");
    if (resolved.status !== "resolved") return {
      question: resolved.status === "clarification" ? resolved.question : "Which event should I use?",
      detail: resolved.status === "clarification" ? resolved.choices.map(({ label }) => label).join(" · ") : resolved.detail,
      ...(resolved.status === "clarification" ? { clarification: resolved } : {}),
    };
    resolved.events.forEach(({ dateKey }) => dates.add(dateKey));
    priorTarget = true;
  }
  if (dates.size === 1) return { dateKey: [...dates][0]! };
  if (dates.size > 1) return { question: "These changes target several dates", detail: "I can currently rearrange one source day per request. Name a single day; nothing changed." };
  if (scope.kind !== "week") return { dateKey: scope.dateKey };
  const creation = request.actions.find((action) => action.type === "create" || action.type === "fit");
  if (creation && "destination" in creation && "date" in creation.destination && creation.destination.date && typeof creation.destination.date === "object") return { dateKey: creation.destination.date.dateKey };
  return { question: "Which day should I use?", detail: "Name a day for this whole-day or new-event request. Nothing changed." };
}
