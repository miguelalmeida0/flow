import type { LifeDocument } from "../../domain/life-model";
import type { CalendarEvent } from "../day-planner/model";
import { withEventDefaults } from "../day-planner/eventDefaults";

/** Independent acceptance data for archived everyday utterances. IDs are
 * deliberately different from the app seed; no utterance/parser input enters
 * this builder. Raw titles and intervals are the frozen fixture contract. */
export function populateRepresentativeCalendar(document: LifeDocument) {
  const dateKey = "2026-09-08";
  document.calendar = { dateKey, events: ([
    { id: "R-Dentist", title: "Dentist appointment", start: 450, end: 510, kind: "fixed", priority: "high" },
    { id: "R-DeepWork", title: "Deep work — project brief", start: 540, end: 600, kind: "flexible", priority: "high" },
    { id: "R-Email", title: "Review and respond to email", start: 660, end: 705, kind: "flexible", priority: "medium" },
    { id: "R-Lunch", title: "Lunch", start: 750, end: 795, kind: "protected", protected: true, priority: "high" },
    { id: "R-Roadmap", title: "Planning — Q3 roadmap", start: 840, end: 900, kind: "flexible", priority: "low" },
    { id: "R-Interview", title: "Interview", start: 960, end: 1020, kind: "fixed", priority: "high" },
    { id: "R-Workout", title: "Workout", start: 1050, end: 1110, kind: "flexible", priority: "medium" },
    { id: "R-Dinner", title: "Dinner", start: 1140, end: 1200, kind: "protected", protected: true, priority: "high" },
  ] satisfies Omit<CalendarEvent, "dateKey">[]).map((event) => withEventDefaults({ ...event, dateKey })), deferred: [], breathingRooms: [], endBoundaryMinutes: 1260 };
  document.calendars = { [dateKey]: structuredClone(document.calendar) };
}
