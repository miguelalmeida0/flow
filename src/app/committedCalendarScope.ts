import type { LifeDocument, TemporalScope } from "../domain/life-model";
import { allCalendarEvents } from "../domain/life-calendar-world";
import { weekScope } from "../features/elite/temporal";

/** Select the visible scope from the successful draft, before its single CAS.
 * This is a view projection and creates no second business transaction. */
export function committedCalendarScope(document: LifeDocument, scope: TemporalScope, eventId: string): TemporalScope {
  const event = allCalendarEvents(document).find(({ id }) => id === eventId);
  if (!event || (event.dateKey >= scope.dateKey && event.dateKey <= (scope.kind === "week" ? scope.endDateKey ?? scope.dateKey : scope.dateKey))) return scope;
  return scope.kind === "week" ? weekScope(event.dateKey, document.preferences.weekStartsOn) : { kind: "day", dateKey: event.dateKey };
}
