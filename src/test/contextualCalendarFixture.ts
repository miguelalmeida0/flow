import { createFreshLifeSnapshot } from "../domain/life-storage";
import type { CalendarEvent, DayPlan } from "../features/day-planner/model";
import { projectCalendarDate } from "../domain/life-calendar-world";

export const contextualToday = "2026-09-08";
export const contextualClock = () => new Date("2026-09-08T08:00:00");
export const contextualWeek = { kind: "week" as const, dateKey: "2026-09-07", endDateKey: "2026-09-13" };
export function contextualCalendarFixture() {
  const snapshot = createFreshLifeSnapshot(contextualToday);
  const event = (id: string, title: string, dateKey: string, start: number, end: number, fixed = false): CalendarEvent => ({
    id, title, dateKey, start, end, kind: fixed ? "fixed" : "flexible", priority: "medium", mobility: fixed ? "anchored" : "light", status: "planned", color: "neutral",
  });
  const day = (dateKey: string, suffix: string): DayPlan => ({ dateKey, deferred: [], events: [
    event(`email-${suffix}`, "Review and respond to email", dateKey, 660, 720),
    event(`lunch-${suffix}`, "Lunch", dateKey, 750, 795, true),
  ], breathingRooms: [] });
  const tuesday = day(contextualToday, "tue"), wednesday = day("2026-09-09", "wed");
  wednesday.events.push(event("creative-wed", "Creative Review", "2026-09-09", 960, 1020, true));
  const outside: DayPlan = { dateKey: "2026-09-16", deferred: [], breathingRooms: [], events: [event("lunch-next", "Lunch", "2026-09-16", 750, 795, true)] };
  snapshot.document.calendar = tuesday;
  snapshot.document.calendars = { [tuesday.dateKey]: structuredClone(tuesday), [wednesday.dateKey]: wednesday, [outside.dateKey]: outside };
  snapshot.document = projectCalendarDate(snapshot.document, contextualWeek.dateKey);
  snapshot.temporal = { todayDateKey: contextualToday, scope: contextualWeek };
  snapshot.past = []; snapshot.future = [];
  return snapshot;
}
