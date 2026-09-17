import type { LanguageCase } from "./languageDatabase";
import { acceptanceFixture } from "./acceptanceFixtures";

/** Exact brief examples and adversarial raw-value regressions. These are not
 * new editorial admissions. All slots, IDs and complete records are declared
 * here before executing the production interpreter or scheduler. */
const rows = [
  { utterance: "create an event called Interview Prep tomorrow at four", title: "Interview Prep", id: "interview-prep", date: "2026-09-09", start: 960 },
  { utterance: "tomorrow at three add Walk Dog", title: "Walk Dog", id: "walk-dog", date: "2026-09-09", start: 900 },
  { utterance: "add Investor Call at ten for thirty minutes", title: "Investor Call", id: "investor-call", date: "2026-09-08", start: 600 },
  { utterance: 'Create an event called "Research and Development" tomorrow at four', title: "Research and Development", id: "research-and-development", date: "2026-09-09", start: 960 },
  { utterance: 'Add an event named "iPhone repair" at ten for thirty minutes', title: "iPhone repair", id: "iphone-repair", date: "2026-09-08", start: 600 },
  { utterance: 'Add an event named "🦊 Go home and stop listening" at ten for thirty minutes', title: "🦊 Go home and stop listening", id: "go-home-and-stop-listening", date: "2026-09-08", start: 600 },
  { utterance: 'Create an event called "Friday at four" at ten for thirty minutes', title: "Friday at four", id: "friday-at-four", date: "2026-09-08", start: 600 },
] as const;

export const literalCreationRegressions: LanguageCase[] = rows.map((row, index) => ({
  id: `literal-create-${index + 1}`, utterance: row.utterance, fixtureId: "calendar-reference",
  context: acceptanceFixture("calendar-reference").context, source: "regression",
  expected: { intent: "calendar", resolution: "execute", route: "calendar" },
  semantic: {
    historyDelta: 1, feedbackPhase: "completed", noPending: true,
    intent: { type: "calendar", request: { transcript: row.utterance, actions: [{ type: "create", title: row.title, durationMinutes: 30, destination: { type: "absolute", minutes: row.start, ...(row.date === "2026-09-09" ? { date: "tomorrow" as const } : {}) } }] } },
    calendarActionTypes: ["create"], actions: [{ type: "calendar.request", selectedId: "E1" }],
    calendarInsertions: [{ id: row.id, title: row.title, dateKey: row.date, start: row.start, end: row.start + 30, kind: "flexible", priority: "medium", color: "neutral", labels: [], importance: "normal", mobility: "light", protected: false, status: "planned", bufferBeforeMinutes: 0, bufferAfterMinutes: 0 }],
  },
}));
