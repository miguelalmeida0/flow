import { createFreshLifeSnapshot } from "../../domain/life-storage";
import type { LifeContext } from "../../domain/life-model";
import { withEventDefaults } from "../day-planner/eventDefaults";
import { cloneAtmosphereLayers } from "../../domain/studio-model";
import { populateDomainAcceptanceFixture, type DomainAcceptanceFixtureId } from "./acceptanceDomainFixtures";
import { populateRepresentativeCalendar } from "./representativeCalendarFixture";
import { legacyAcceptanceFixture } from "./legacyAcceptanceFixture";
import legacyMemory from "./legacyMemoryFixture.json";
import legacyAtmosphere from "./legacyAtmosphereFixture.json";
import legacyJournal from "./legacyJournalFixture.json";
import type { StudioState } from "../../domain/studio-model";

export type AcceptanceFixtureId = DomainAcceptanceFixtureId | "legacy-seed" | "legacy-memory" | "legacy-atmosphere" | "legacy-journal-recording" | "legacy-journal-editing" | "legacy-journal-creation" | "empty-home" | "calendar-representative" | "calendar-reference" | "calendar-near" | "calendar-competing" | "journal-editing" | "journal-recording" | "atmosphere";
export const acceptanceDay = "2026-09-08";
export const acceptanceClock = new Date("2026-09-08T08:00:00.000Z");

/** Independently declared before language resolution. Never infer an entity,
 * title, time, or expected value from the parser being evaluated. */
export function acceptanceFixture(id: AcceptanceFixtureId) {
  if (id === "legacy-seed") return legacyAcceptanceFixture();
  if (id.startsWith("legacy-journal")) {
    const fixture = legacyAcceptanceFixture();
    const journalEntries = structuredClone(legacyJournal.replace["document.studio.journalEntries"]) as StudioState["journalEntries"];
    const mediaAssets = structuredClone(legacyJournal.replace["document.studio.mediaAssets"]) as StudioState["mediaAssets"];
    if (id !== "legacy-journal-recording") journalEntries[0]!.recordingState = "idle";
    if (id === "legacy-journal-creation") journalEntries[0]!.id = "evaluation-journal";
    Object.assign(fixture.snapshot.document.studio, { journalEntries, mediaAssets });
    Object.assign(fixture.context, legacyJournal.context, { voiceMode: id === "legacy-journal-recording" ? "journal-longform" : "command" });
    if (id === "legacy-journal-creation") delete fixture.context.activeJournalEntryId;
    return fixture;
  }
  if (id === "legacy-memory") {
    const fixture = legacyAcceptanceFixture();
    // Literal reviewed LM60 records; metadata does not imply playable bytes.
    Object.assign(fixture.snapshot.document.studio, structuredClone(legacyMemory.studioOverrides) as Pick<StudioState, "journalEntries" | "memories" | "mediaAssets">);
    Object.assign(fixture.context, legacyMemory.context, { nowMs: legacyMemory.nowMs });
    return fixture;
  }
  if (id === "legacy-atmosphere") {
    const fixture = legacyAcceptanceFixture();
    Object.assign(fixture.snapshot.document.studio, { atmospherePresets: [structuredClone(legacyAtmosphere.preset)], activeAtmosphere: structuredClone(legacyAtmosphere.active), workspace: structuredClone(legacyAtmosphere.workspace) } as Pick<StudioState, "atmospherePresets" | "activeAtmosphere" | "workspace">);
    Object.assign(fixture.context, legacyAtmosphere.context, { nowMs: legacyAtmosphere.nowMs });
    return fixture;
  }
  const snapshot = createFreshLifeSnapshot(acceptanceDay);
  const document = snapshot.document;
  document.calendar.events = id.startsWith("calendar") ? [
    withEventDefaults({ id: "E1", title: "Shareholders", dateKey: acceptanceDay, start: id === "calendar-competing" ? 680 : 690, end: id === "calendar-competing" ? 695 : 720, kind: "flexible", priority: "medium" }),
    ...(id === "calendar-competing" ? [withEventDefaults({ id: "E5", title: "Budget", dateKey: acceptanceDay, start: 700, end: 730, kind: "flexible", priority: "medium" })] : []),
    ...(id === "calendar-reference" ? [
      withEventDefaults({ id: "E2", title: "Deep Work", dateKey: acceptanceDay, start: 840, end: 900, kind: "flexible", priority: "medium" }),
      withEventDefaults({ id: "E3", title: "Interview", dateKey: acceptanceDay, start: 1020, end: 1080, kind: "fixed", priority: "high" }),
      withEventDefaults({ id: "E4", title: "Dinner", dateKey: acceptanceDay, start: 1140, end: 1200, kind: "protected", protected: true, priority: "high" }),
    ] : []),
  ] : [];
  document.calendar.deferred = [];
  document.calendars = { [acceptanceDay]: structuredClone(document.calendar) };
  const context: LifeContext = { route: "home", activeMode: "command", nowMs: acceptanceClock.getTime() };
  if (id.startsWith("calendar")) Object.assign(context, { route: "calendar", topic: "calendar", ...(id === "calendar-reference" ? { selected: { kind: "calendar-event", id: "E1", at: acceptanceClock.getTime() - 1000 } } : {}) });
  if (id.startsWith("journal")) {
    const recording = id === "journal-recording";
    document.studio.journalEntries = [{ id: "J1", kind: "journal-entry", title: "My Journey", text: "The train was late. I still enjoyed the walk.\n\nTomorrow feels less daunting.", status: "draft", recordingState: recording ? "recording" : "idle", recordingDurationMs: 12400, photoAssetIds: [], bookmarks: [], transcriptSegments: [], drawings: [], tags: [], createdAt: acceptanceClock.toISOString(), updatedAt: acceptanceClock.toISOString() }];
    Object.assign(context, { route: "journal", topic: "journal", activeJournalEntryId: "J1", voiceMode: recording ? "journal-longform" : "command", journalPositionMs: 12400 });
  }
  if (id === "atmosphere") {
    const preset = document.studio.atmospherePresets[0]!;
    document.studio.activeAtmosphere = { presetId: preset.id, playing: true, muted: false, masterVolume: preset.masterVolume, layers: cloneAtmosphereLayers(preset.layers) };
    Object.assign(context, { route: "atmosphere", topic: "atmosphere" });
  }
  populateDomainAcceptanceFixture(id, document, context, acceptanceClock.toISOString(), acceptanceClock.getTime());
  if (id === "calendar-representative") populateRepresentativeCalendar(document);
  return { snapshot, context };
}
