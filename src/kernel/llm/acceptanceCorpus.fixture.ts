import { withEventDefaults } from "../../features/day-planner/eventDefaults";
import type { LifeDocument, Person } from "../../domain/life-model";
import type { JournalEntry } from "../../domain/studio-model";
import { journeyDocument } from "../__tests__/fixtures";

/**
 * A single richer document shared by every acceptance-corpus case: Dinner
 * (7-7:30pm) and Drinks (8-8:30pm) from journeyDocument, plus a Call with
 * Daniel, two named people, and one journal entry with real searchable
 * content — enough real entity data for entity-existence validation,
 * disambiguation, and recall cases to mean something, without pretending to
 * be a full production dataset.
 */
export function corpusDocument(dateKey = "2026-09-17"): LifeDocument {
  const document = journeyDocument(dateKey);
  const daniel: Person = { id: "person-daniel", kind: "person", name: "Daniel", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" };
  const sofia: Person = { id: "person-sofia", kind: "person", name: "Sofia", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" };
  // Held-out entities (see FINAL REPORT Phase 9) — kept SEPARATE from the
  // dev-tuned Daniel/Sofia/dinner/drinks/Lisbon set so held-out cases
  // reference genuinely fresh names/events/content, not ones this session
  // already iterated prompt wording against.
  const maya: Person = { id: "person-maya", kind: "person", name: "Maya", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" };
  document.people = [daniel, sofia, maya];

  const callWithDaniel = withEventDefaults({ id: "call-daniel", title: "Call with Daniel", dateKey, start: 15 * 60, end: 15 * 60 + 30, kind: "fixed", priority: "medium" });
  const yogaWithMaya = withEventDefaults({ id: "yoga-maya", title: "Yoga with Maya", dateKey, start: 17 * 60 + 30, end: 18 * 60 + 15, kind: "flexible", priority: "medium" });
  document.calendar = { ...document.calendar, events: [...document.calendar.events, callWithDaniel, yogaWithMaya] };
  document.calendars = { [dateKey]: structuredClone(document.calendar) };

  const lisbonEntry: JournalEntry = {
    id: "journal-lisbon",
    kind: "journal-entry",
    title: "Lisbon trip",
    text: "Decided to book Lisbon for the first week of November instead of Porto — better flight times and Sofia can join for the middle weekend.",
    status: "draft",
    recordingState: "idle",
    recordingDurationMs: 0,
    photoAssetIds: [],
    bookmarks: [],
    transcriptSegments: [],
    drawings: [],
    tags: [],
    createdAt: "2026-09-10T09:00:00.000Z",
    updatedAt: "2026-09-10T09:00:00.000Z",
  };
  const hotelEntry: JournalEntry = {
    id: "journal-hotel",
    kind: "journal-entry",
    title: "Lisbon hotel note",
    text: "The hotel near Alfama had great reviews — book before prices go up.",
    status: "draft",
    recordingState: "idle",
    recordingDurationMs: 0,
    photoAssetIds: [],
    bookmarks: [],
    transcriptSegments: [],
    drawings: [],
    tags: [],
    createdAt: "2026-09-11T09:00:00.000Z",
    updatedAt: "2026-09-11T09:00:00.000Z",
  };
  const flightEntry: JournalEntry = {
    id: "journal-flight",
    kind: "journal-entry",
    title: "Lisbon flight note",
    text: "Direct flight lands at 10pm, need airport transfer booked.",
    status: "draft",
    recordingState: "idle",
    recordingDurationMs: 0,
    photoAssetIds: [],
    bookmarks: [],
    transcriptSegments: [],
    drawings: [],
    tags: [],
    createdAt: "2026-09-12T09:00:00.000Z",
    updatedAt: "2026-09-12T09:00:00.000Z",
  };
  const portoEntry: JournalEntry = {
    id: "journal-porto",
    kind: "journal-entry",
    title: "Porto weekend idea",
    text: "Maya suggested a long weekend in Porto in October instead of another Lisbon trip — need to check train times from Lisbon first.",
    status: "draft",
    recordingState: "idle",
    recordingDurationMs: 0,
    photoAssetIds: [],
    bookmarks: [],
    transcriptSegments: [],
    drawings: [],
    tags: [],
    createdAt: "2026-09-14T09:00:00.000Z",
    updatedAt: "2026-09-14T09:00:00.000Z",
  };
  document.studio = { ...document.studio, journalEntries: [lisbonEntry, hotelEntry, flightEntry, portoEntry] };

  return document;
}
