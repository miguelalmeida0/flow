import type { CalendarEvent, DayPlan } from "./model";
import { withEventDefaults } from "./eventDefaults";
import { localDateKey } from "./time";

interface SeedTimes {
  interview: number;
  workout: number;
}

function createSeedPlan(dateKey: string, times: SeedTimes): DayPlan {
  return {
    dateKey,
    breathingRooms: [],
    deferred: [],
    events: ([
      { id: "dentist", title: "Dentist appointment", dateKey, start: 450, end: 510, kind: "fixed", priority: "high" },
      { id: "deep-work", title: "Deep work — project brief", dateKey, start: 540, end: 600, kind: "flexible", priority: "high" },
      { id: "email", title: "Review and respond to email", dateKey, start: 660, end: 705, kind: "flexible", priority: "medium" },
      { id: "lunch", title: "Lunch", dateKey, start: 750, end: 795, kind: "protected", priority: "high" },
      { id: "roadmap", title: "Planning — Q3 roadmap", dateKey, start: 840, end: 900, kind: "flexible", priority: "low" },
      { id: "interview", title: "Interview", dateKey, start: times.interview, end: times.interview + 60, kind: "fixed", priority: "high" },
      { id: "workout", title: "Workout", dateKey, start: times.workout, end: times.workout + 60, kind: "flexible", priority: "medium" },
      { id: "dinner", title: "Dinner", dateKey, start: 1140, end: 1200, kind: "protected", priority: "high" },
    ] satisfies CalendarEvent[]).map(withEventDefaults),
  };
}

export function createInitialPlan(dateKey = localDateKey()): DayPlan {
  return createSeedPlan(dateKey, { interview: 16 * 60, workout: 17 * 60 + 30 });
}

/** Initial content for the multi-space product. This is sample data only; the
 * scheduler never branches on these IDs or times. */
export function createInitialLifePlan(dateKey = localDateKey()): DayPlan {
  return createSeedPlan(dateKey, { interview: 17 * 60, workout: 15 * 60 + 30 });
}

/** A second real day for the temporal demo. It is ordinary seed data; the
 * interpreter and scheduler never know these identities or positions. */
export function createInitialTomorrowPlan(dateKey: string): DayPlan {
  return {
    dateKey,
    breathingRooms: [],
    deferred: [],
    events: ([
      { id: `deep-work-${dateKey}`, title: "Deep work — project brief", dateKey, start: 9 * 60, end: 10 * 60, kind: "flexible", priority: "high" },
      { id: `email-${dateKey}`, title: "Review and respond to email", dateKey, start: 11 * 60, end: 12 * 60 + 2, kind: "flexible", priority: "medium" },
      { id: `lunch-${dateKey}`, title: "Lunch", dateKey, start: 12 * 60 + 30, end: 13 * 60 + 15, kind: "protected", priority: "high" },
      { id: `creative-review-${dateKey}`, title: "Creative Review", dateKey, start: 16 * 60, end: 17 * 60, kind: "fixed", priority: "high" },
    ] satisfies CalendarEvent[]).map(withEventDefaults),
  };
}
