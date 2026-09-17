import type { LifeDocument, TemporalScope } from "../../domain/life-model";
import { dateKeysForScope, formatCompactScopeDate } from "../elite/temporal";
import { allCalendarPlans, emptyDay } from "../../domain/life-calendar-world";
import { DAY_END, DAY_START, formatRange, formatTime } from "./time";
import { eventProtected, eventStatus } from "./eventDefaults";
import { ParticipantBadges } from "../friends/ParticipantBadges";

/** A projection of the same dated calendar documents, not a second editor.
 * Opening a day/event delegates to the canonical scope and selection owners. */
export function WeekTimeline({ document, scope, openDay }: {
  document: LifeDocument;
  scope: TemporalScope;
  openDay: (dateKey: string, eventId?: string) => void;
}) {
  const days = dateKeysForScope(scope);
  const plans = new Map(allCalendarPlans(document).map((plan) => [plan.dateKey, plan]));
  const minutes = DAY_END - DAY_START;
  const hours = Array.from({ length: minutes / 60 + 1 }, (_, index) => DAY_START + index * 60);
  return <section aria-label="Week calendar" className="mx-4 mt-5 overflow-x-auto rounded-2xl border border-flow-border sm:mx-8" data-testid="week-calendar">
    <div className="grid min-w-[840px]" style={{ gridTemplateColumns: `48px repeat(${days.length}, minmax(112px, 1fr))` }}>
      <div aria-hidden="true" className="border-b border-flow-border" />
      {days.map((dateKey) => <button data-action-id="today.open-date" data-flow-action="Open Calendar date" key={dateKey} className="min-h-12 border-b border-l border-flow-border px-2 py-3 text-xs font-semibold hover:bg-flow-blue-soft focus-visible:outline-flow-blue" onClick={() => openDay(dateKey)}>{formatCompactScopeDate(dateKey)}</button>)}
      <div aria-hidden="true" className="relative" style={{ height: minutes }}>
        {hours.map((hour) => <span className="absolute right-2 text-[10px] text-flow-secondary" key={hour} style={{ top: Math.min(minutes - 14, hour - DAY_START) }}>{formatTime(hour)}</span>)}
      </div>
      {days.map((dateKey) => {
        const plan = plans.get(dateKey) ?? emptyDay(dateKey);
        return <div key={dateKey} aria-label={formatCompactScopeDate(dateKey)} className="relative border-l border-flow-border" data-week-date={dateKey} style={{ height: minutes }}>
          {hours.map((hour) => <div className="absolute inset-x-0 border-t border-flow-border/60" key={hour} style={{ top: hour - DAY_START }} />)}
          {plan.breathingRooms?.map((room) => <div key={room.id} aria-label={`${room.label}, ${formatTime(room.start)} to ${formatTime(room.end)}`} className="absolute inset-x-1 overflow-hidden rounded-lg border border-dashed border-flow-green-strong bg-flow-green-soft px-1 text-[10px]" style={{ top: room.start - DAY_START, height: room.end - room.start }}>{room.label}</div>)}
          {plan.events.filter((event) => eventStatus(event) !== "cancelled").map((event) => <button data-action-id="calendar.inspect"
            aria-label={`${event.title}, ${formatRange(event)}, ${formatCompactScopeDate(dateKey)}${eventProtected(event) ? ", protected" : ""}`}
            className="absolute inset-x-1 overflow-hidden rounded-lg border border-flow-border bg-flow-elevated px-2 py-1 text-left text-xs text-flow-ink hover:border-flow-blue focus-visible:outline-flow-blue"
            data-flow-action="Open Today event" data-life-entity-id={event.id} data-week-event-id={event.id} data-start={event.start} data-end={event.end} key={event.id}
            onClick={() => openDay(dateKey, event.id)} style={{ top: event.start - DAY_START, height: event.end - event.start }}
          ><span className="block truncate font-semibold">{eventProtected(event) ? "⚓ " : ""}{event.title}</span><span className="block text-[10px] text-flow-secondary">{formatRange(event)}</span><ParticipantBadges event={event} people={document.people} /></button>)}
        </div>;
      })}
    </div>
  </section>;
}
