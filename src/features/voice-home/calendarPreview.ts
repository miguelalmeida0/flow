import type { CalendarEvent, DayPlan } from "../day-planner/model";
import { localDateKey } from "../day-planner/time";

interface PreviewReferences { targetId?: string; candidateIds?: readonly string[] }

/** A projection only: retain original event objects/IDs and never rearrange the
 * calendar. Today looks ahead, a future day starts at its beginning, and a past
 * day shows its most recent history. Explicit references remain visible. */
export function selectCalendarPreviewEvents(plan: DayPlan, now: Date, references: PreviewReferences = {}): CalendarEvent[] {
  const ordered = plan.events.filter((event) => event.dateKey === plan.dateKey)
    .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  const today = localDateKey(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const visible = ordered.filter((event) => event.status !== "cancelled"
    && (plan.dateKey < today || event.status !== "done")
    && (plan.dateKey !== today || event.end > nowMinutes));
  const nearTerm = plan.dateKey < today ? [...visible].reverse() : visible;
  const candidates = ordered.filter(({ id }) => references.candidateIds?.includes(id));
  const target = ordered.find(({ id }) => id === references.targetId);
  const shownIds = new Set([...new Map([...candidates, ...(target ? [target] : []), ...nearTerm]
    .map((event) => [event.id, event])).keys()].slice(0, 4));
  return ordered.filter(({ id }) => shownIds.has(id));
}
