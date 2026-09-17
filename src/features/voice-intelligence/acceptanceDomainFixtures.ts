import type { LifeContext, LifeDocument } from "../../domain/life-model";
import { withEventDefaults } from "../day-planner/eventDefaults";

export type DomainAcceptanceFixtureId = "capture-reference" | "outcome-reference" | "outcome-scheduled" | "commitment-reference" | "commitment-scheduled" | "memory-source" | "calendar-dated";

/** Test-only, independently declared entities. No interpreter/planner output is
 * used to construct these before states or their stable relationships. */
export function populateDomainAcceptanceFixture(id: string, document: LifeDocument, context: LifeContext, at: string, nowMs: number) {
  const metadata = { createdAt: at, updatedAt: at };
  const reference = (kind: NonNullable<LifeContext["selected"]>["kind"], entityId: string) => ({ kind, id: entityId, at: nowMs - 1000 });
  if (id === "capture-reference") {
    document.captures = [
      { id: "C1", kind: "capture", title: "Boiler receipt", status: "unresolved", source: "typed", ...metadata },
      { id: "C2", kind: "capture", title: "Window measurements", status: "unresolved", source: "typed", ...metadata },
      { id: "C3", kind: "capture", title: "Old packing list", status: "archived", source: "typed", ...metadata },
    ];
    document.people = [{ id: "P-Daniel", kind: "person", name: "Daniel", ...metadata }];
    Object.assign(context, { route: "inbox", topic: "capture", lastReferenced: reference("capture", "C1") });
  }
  if (id === "outcome-reference" || id === "outcome-scheduled") {
    document.plans = [
      { id: "O1", kind: "plan", title: "Home library", outcome: "Home library ready", status: "active", stepIds: ["S1", "S2", "S3"], nextStepId: "S1", ...metadata },
      { id: "O2", kind: "plan", title: "Garden notebook", outcome: "Garden notes organized", status: "paused", stepIds: [], ...metadata },
    ];
    document.steps = [
      { id: "S1", kind: "plan-step", planId: "O1", title: "Measure shelves", status: "planned", estimatedMinutes: 25, ...metadata },
      { id: "S2", kind: "plan-step", planId: "O1", title: "Sort books", status: id === "outcome-scheduled" ? "scheduled" : "planned", estimatedMinutes: 40, ...metadata },
      { id: "S3", kind: "plan-step", planId: "O1", title: "Donate old books", status: "planned", estimatedMinutes: 30, ...metadata },
    ];
    Object.assign(context, { route: "plans", topic: "outcome", activePlanId: "O1", lastReferenced: reference("plan", "O1") });
    if (id === "outcome-scheduled") {
      document.calendar.events = [withEventDefaults({ id: "R1", title: "Sort books", dateKey: "2026-09-08", start: 660, end: 700, kind: "flexible", priority: "medium" })];
      document.links = [{ id: "L1", type: "step-scheduled-as-event", fromId: "S2", toId: "R1", createdAt: at }];
    }
  }
  if (id === "commitment-reference" || id === "commitment-scheduled") {
    document.people = [{ id: "P-Maya", kind: "person", name: "Maya", ...metadata }, { id: "P-Daniel", kind: "person", name: "Daniel", ...metadata }];
    document.commitments = [
      { id: "K1", kind: "commitment", personId: "P-Maya", title: "Send sketch", direction: "i-owe", status: "open", dueAt: "2026-09-11T17:00:00.000Z", ...metadata },
      { id: "K2", kind: "commitment", personId: "P-Daniel", title: "Delivery confirmation", direction: "waiting-on", status: "open", dueAt: "2026-09-10T17:00:00.000Z", ...metadata },
      { id: "K3", kind: "commitment", personId: "P-Maya", title: "Return keys", direction: "i-owe", status: "open", dueAt: "2026-09-09T17:00:00.000Z", ...metadata },
    ];
    Object.assign(context, { route: "people", peopleView: "commitments", topic: "commitment", lastReferenced: reference("commitment", "K1") });
    if (id === "commitment-scheduled") {
      document.calendars["2026-09-09"] = { dateKey: "2026-09-09", deferred: [], events: [withEventDefaults({ id: "R2", title: "Send sketch", dateKey: "2026-09-09", start: 600, end: 630, kind: "flexible", priority: "medium" })] };
      document.links = [{ id: "L2", type: "commitment-reserved-by-event", fromId: "K1", toId: "R2", createdAt: at }];
    }
  }
  if (id === "memory-source") {
    document.studio.journalEntries = [{ id: "J1", kind: "journal-entry", title: "Window seat", text: "I waited by the window.\n\nThe room felt quiet.", status: "draft", recordingState: "idle", recordingDurationMs: 12400, audioAssetId: "A1", photoAssetIds: ["P1", "P2"], bookmarks: [{ id: "B1", timestampMs: 2000, transcriptAnchor: "I waited by the window.", createdAt: at }, { id: "B2", timestampMs: 8400, transcriptAnchor: "The room felt quiet.", createdAt: at }], transcriptSegments: [], drawings: [], tags: ["travel", "family"], ...metadata }];
    document.studio.mediaAssets = [
      { id: "A1", kind: "journal-audio", name: "Original voice", mimeType: "audio/webm", size: 1200, createdAt: at },
      { id: "P1", kind: "journal-photo", name: "station.jpg", mimeType: "image/jpeg", size: 500, createdAt: at },
      { id: "P2", kind: "journal-photo", name: "window.jpg", mimeType: "image/jpeg", size: 600, createdAt: at },
    ];
    document.studio.memories = [{ id: "M1", kind: "memory", journalEntryId: "J1", title: "An afternoon", passage: "An afternoon worth keeping.", composition: "still", photoAssetId: "P1", audioEnabled: true, audioInMs: 2000, audioOutMs: 12000, textScale: 1, textOffset: { x: 0, y: 0 }, showDate: false, datePlacement: "inline", status: "draft", ...metadata }];
    Object.assign(context, { route: "memories", topic: "memory", activeMemoryId: "M1" });
  }
  if (id === "calendar-dated") {
    document.calendar.events = [withEventDefaults({ id: "D1", title: "Draft abstract", dateKey: "2026-09-08", start: 540, end: 600, kind: "flexible", priority: "medium" })];
    document.calendars["2026-09-09"] = { dateKey: "2026-09-09", events: [withEventDefaults({ id: "D2", title: "Swimming", dateKey: "2026-09-09", start: 450, end: 495, kind: "flexible", priority: "medium" })], deferred: [] };
    document.calendars["2026-09-10"] = { dateKey: "2026-09-10", events: [withEventDefaults({ id: "D3", title: "Draft abstract", dateKey: "2026-09-10", start: 600, end: 660, kind: "flexible", priority: "medium" })], deferred: [] };
    Object.assign(context, { route: "calendar", topic: "calendar" });
  }
  document.calendars[document.calendar.dateKey] = structuredClone(document.calendar);
  // Explicit structural defaults for every independently declared day. These
  // match schema hydration, not any observed mutation result.
  for (const day of Object.values(document.calendars)) {
    day.breathingRooms ??= [];
    day.endBoundaryMinutes ??= undefined;
  }
}
