import type { CalendarEvent, EventSelector } from "../day-planner/model";
import type { LifeRoute, TemporalScope } from "../../domain/life-model";
import type { LanguageCase } from "./languageDatabase";
import type { SemanticExpectation } from "./semanticExpectation";
import protect from "./legacyProtectSlots.json";
import defer from "./legacyDeferSlots.json";
import temporal from "./legacyTemporalSlots.json";
import navigation from "./legacyNavigationSlots.json";
import { legacyCalendarEdits } from "./legacyCalendarEditContracts";
import { legacyMemoryContracts } from "./legacyMemoryContracts";
import type { AcceptanceFixtureId } from "./acceptanceFixtures";
import { legacyAtmosphereContracts } from "./legacyAtmosphereContracts";
import type { AtmospherePreset } from "../../domain/studio-model";
import { legacyCaptureContracts } from "./legacyCaptureContracts";
import { legacyGoalContracts } from "./legacyGoalContracts";
import { legacyJournalContracts } from "./legacyJournalContracts";
import { legacyOtherContracts } from "./legacyOtherContracts";
import { legacyAttentionContracts } from "./legacyAttentionContracts";
import { legacyCommitmentContracts } from "./legacyCommitmentContracts";

type Declaration = { text: string; line: number; semantic: SemanticExpectation; intent: LanguageCase["expected"]["intent"]; resolution?: LanguageCase["expected"]["resolution"]; domain?: string; route?: LifeRoute; target?: CalendarEvent; fixtureId?: AcceptanceFixtureId; playingPreset?: AtmospherePreset; fixtureCollections?: SemanticExpectation["collections"] };
const declarations = new Map<string, Declaration>([...legacyMemoryContracts, ...legacyAtmosphereContracts, ...legacyCaptureContracts, ...legacyGoalContracts, ...legacyJournalContracts, ...legacyOtherContracts, ...legacyAttentionContracts, ...legacyCommitmentContracts]);
const SOURCE_HASH = "341a5f8cd4bc720cedee6c24c10167512c39da596d8db413dc4babba61397295";
const base: SemanticExpectation = { historyDelta: 1, feedbackPhase: "completed", noCreation: true, noPending: true, commitCount: 1 };

// These inputs are independently frozen title/time slots, never parsed text.
function targetRecord(title: string, morning = false): CalendarEvent {
  return { id: `evaluation-event-${title.toLowerCase().replaceAll(" ", "-")}`, title, dateKey: "2026-09-05", start: morning ? 510 : 900, end: morning ? 540 : 930, kind: "flexible", priority: "medium", color: "neutral", labels: [], importance: "normal", mobility: "light", protected: false, status: "planned", bufferBeforeMinutes: 0, bufferAfterMinutes: 0 };
}
for (const [id, declaration] of legacyCalendarEdits) {
  const target = targetRecord(declaration.title);
  declarations.set(id, { text: declaration.text, line: declaration.line, target, intent: "calendar", semantic: declaration.semantic(target) });
}
for (const tuple of protect.rows) {
  const [suffix, line, text, title, flavor] = tuple as [string, number, string, string, string];
  const target = targetRecord(title, flavor === "M");
  const selector: EventSelector = flavor === "M" ? { type: "source", period: "morning", query: title.toLowerCase() } : { type: "title", query: title.toLowerCase() };
  declarations.set(`curated-${suffix}`, { text, line, target, intent: "calendar", semantic: { ...base, targetIds: [target.id], eventChanges: [{ id: target.id, patch: { protected: true } }], calendarActionTypes: ["protect"], actions: [{ type: "calendar.request", request: { actions: [{ type: "protect", selector }], constraints: flavor === "K" ? [{ type: "keep", selector }] : [] } }] } });
}
for (const tuple of defer.rows) {
  const [suffix, line, text, title, spokenDate, destinationDate] = tuple as [string, number, string, string, string, string];
  const target = targetRecord(title), selector: EventSelector = { type: "title", query: title.toLowerCase() };
  declarations.set(`curated-${suffix}`, { text, line, target, intent: "calendar", semantic: { ...base, targetIds: [target.id], datedEventChanges: [{ id: target.id, sourceDate: "2026-09-05", destinationDate, patch: {} }], calendarActionTypes: ["defer"], actions: [{ type: "calendar.request", request: { actions: [{ type: "defer", selector, date: spokenDate.toLowerCase() === "tomorrow" ? "tomorrow" : { dateKey: destinationDate } }], constraints: [] } }] } });
}
for (const tuple of temporal.rows) {
  const [suffix, line, text, kind, dateKey, endDateKey] = tuple as [string, number, string, TemporalScope["kind"], string, string | null, string];
  const scope: TemporalScope = { kind, dateKey, ...(endDateKey ? { endDateKey } : {}) };
  declarations.set(`curated-${suffix}`, { text, line, intent: "temporal", route: "home", semantic: { ...base, historyDelta: 0, commitCount: 0, intent: { type: "temporal", scope }, scope, actions: [] } });
}
for (const tuple of navigation.rows) {
  const [suffix, line, text, route] = tuple as [string, number, string, LifeRoute, string, string, string, string];
  declarations.set(`curated-${suffix}`, { text, line, intent: "navigate", route, semantic: { ...base, historyDelta: 0, commitCount: 0, intent: { type: "navigate", route }, actions: [] } });
}

/** Overlay preserves source text, IDs and editorial classification. Unmapped
 * rows remain explicitly legacy, never promoted to independent semantics. */
export function applyLegacySemanticOverlay(row: LanguageCase): LanguageCase {
  const declared = declarations.get(row.id);
  if (!declared) return row;
  if (row.utterance !== declared.text) throw new Error(`Changed immutable legacy text: ${row.id}`);
  return { ...row, fixtureId: declared.fixtureId ?? "legacy-seed", fixtureSpec: { ...(declared.target ? { calendarTarget: declared.target } : {}), ...(declared.playingPreset ? { playingPreset: declared.playingPreset } : {}), ...(declared.fixtureCollections ? { collections: declared.fixtureCollections } : {}) },
    context: { ...row.context, weekStartsOn: 1 },
    expected: { intent: declared.intent, resolution: declared.resolution ?? "execute", route: declared.route ?? row.context.route, ...(declared.domain ? { domain: declared.domain } : {}) },
    semantic: declared.semantic,
    provenance: { authoringMethod: "independent-legacy-review", baseCaseId: row.id, transformations: ["literal-before-fixture-and-state-oracle-v1"], contractVersion: "2026-09-08", reviewStatus: "pending", sourceLocation: { file: "src/features/voice-intelligence/curatedLanguageSeeds.json", line: declared.line, sha256: SOURCE_HASH }, reviewNote: "Existing editorial row, zero new quota credit; independently reviewed static slots, pending strict execution." },
  };
}
