import type { LifeDocument } from "../../domain/life-model";
import type { CalendarEvent, DayPlan } from "../../features/day-planner/model";

export interface CalendarMatch {
  event: CalendarEvent;
  dateKey: string;
}

function daysOf(document: LifeDocument): DayPlan[] {
  const byKey = new Map<string, DayPlan>(Object.entries(document.calendars));
  byKey.set(document.calendar.dateKey, document.calendar);
  return [...byKey.values()];
}

/** Looks up candidate calendar events by id or (case-insensitive, substring) title,
 * optionally scoped to a date. Never guesses across an ambiguous match — callers
 * inspect the returned array length themselves. */
export function findCalendarMatches(
  document: LifeDocument,
  query: { eventId?: string; title?: string; dateKey?: string },
): CalendarMatch[] {
  const days = query.dateKey ? daysOf(document).filter((day) => day.dateKey === query.dateKey) : daysOf(document);
  const matches: CalendarMatch[] = [];
  for (const day of days) {
    for (const event of [...day.events, ...day.deferred]) {
      if (query.eventId && event.id === query.eventId) matches.push({ event, dateKey: day.dateKey });
      else if (!query.eventId && query.title && event.title.toLowerCase().includes(query.title.toLowerCase())) {
        matches.push({ event, dateKey: day.dateKey });
      }
    }
  }
  const seen = new Set<string>();
  return matches.filter((match) => (seen.has(match.event.id) ? false : (seen.add(match.event.id), true)));
}

export function dayPlanFor(document: LifeDocument, dateKey: string): DayPlan | undefined {
  return document.calendars[dateKey] ?? (document.calendar.dateKey === dateKey ? document.calendar : undefined);
}
