import { createFreshLifeSnapshot } from "../../domain/life-storage";
import { withEventDefaults } from "../day-planner/eventDefaults";

/** Explicit fixture for the existing week→tomorrow→edit dialogue family.
 * Previously its evaluator kept editing the original day after navigation.
 * This table is authored before interpretation and does not inspect a command
 * or parser result. Every dialogue shares these declared preconditions. */
export function calendarDialogueFixture() {
  const snapshot = createFreshLifeSnapshot("2026-09-05");
  const day = "2026-09-06";
  const appointments: [string, string, number, number][] = [
    ["dialogue-dentist", "Dentist appointment", 480, 510],
    ["dialogue-deep-work", "Deep work", 540, 600],
    ["dialogue-workout", "Workout", 600, 630],
    ["dialogue-roadmap", "Roadmap", 630, 660],
    ["dialogue-email", "Email", 660, 690],
    ["dialogue-lunch", "Lunch", 750, 795],
    ["dialogue-meeting", "Meeting", 840, 900],
    ["dialogue-interview", "Interview", 990, 1050],
  ];
  snapshot.document.calendars[day] = { dateKey: day, events: appointments.map(([id, title, start, end]) => withEventDefaults({ id, title, dateKey: day, start, end, kind: "flexible", priority: "medium" })), deferred: [] };
  return snapshot;
}
