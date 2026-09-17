import batchI from "./assistedEditorialFrozenI.json";
import batchJ from "./assistedEditorialFrozenJ.json";
import metadata from "./assistedEditorialMetadataIJ.json";
import { acceptanceFixture, type AcceptanceFixtureId } from "./acceptanceFixtures";
import { frozenCreation, type FrozenCreationSlots } from "./frozenCreationRecipes";
import { expandFrozenSemantic } from "./frozenSemanticExpansion";
import type { LifeContext } from "../../domain/life-model";
import type { LanguageCase } from "./languageDatabase";
import type { SemanticExpectation } from "./semanticExpectation";

interface Row extends Partial<FrozenCreationSlots> {
  id: number; utterance: string; fixtureId?: AcceptanceFixtureId; contextOverrides?: Partial<LifeContext>;
  expected?: LanguageCase["expected"]; semantic?: SemanticExpectation; sourceLocator: { file: string; line: number };
  contextUnset?: string[]; clock?: string; commitCount?: number;
}
interface Envelope { sources: Record<string, { file: string; sha256: string }>; defaults: { fixtureId: AcceptanceFixtureId; semantic: SemanticExpectation }; cases: Row[] }

/** Review corrections are explicit and pre-execution; archived originals are
 * retained unchanged. These 50 rows are still pending, not quota admission. */
export const pendingLateAssistedCases: LanguageCase[] = ([batchI, batchJ] as unknown as Envelope[]).flatMap((batch, index) => batch.cases.map((row) => {
  const fixtureId = row.fixtureId ?? batch.defaults.fixtureId;
  const fixture = acceptanceFixture(fixtureId);
  const context = { ...fixture.context, ...row.contextOverrides };
  if (row.clock) {
    context.nowMs = Date.parse(row.clock);
    // Archive placeholders are not actual LifeContext fields.
    delete (context as Record<string, unknown>).now;
  }
  for (const field of row.contextUnset ?? []) delete (context as Record<string, unknown>)[field === "selectedEventId" ? "selected" : field];
  if (row.id === 187) context.lastReferenced = { kind: "plan", id: "O2", at: 1788854399000 };
  const at = new Date(context.nowMs!).toISOString();
  const creation = ["capture", "step", "outcome", "commitment"].includes(row.oracleRecipe ?? "") ? frozenCreation(row as FrozenCreationSlots, fixture.snapshot.document, at) : undefined;
  let expected = creation?.expected ?? row.expected;
  if (!expected) throw new Error(`Unspecified frozen outcome for ${row.id}`);
  let semantic = expandFrozenSemantic(creation?.semantic ?? { ...batch.defaults.semantic, ...row.semantic }, fixture.snapshot.document, at);
  if (row.commitCount !== undefined) semantic.commitCount = row.commitCount;
  if (row.id === 160) semantic = { historyDelta: 1, feedbackPhase: "completed", noPending: true, noCreation: true, commitCount: 1, intent: { type: "calendar" }, actions: [{ type: "calendar.request" }], calendarActionTypes: ["resize"], eventChanges: [{ id: "E3", patch: { end: 1140 } }], targetIds: ["E3"] };
  if (row.id === 163) semantic.targetIds = ["R-Lunch"];
  // Root's explicit operation-specific review supersedes the archived draft:
  // near-time deletion first clarifies; compound leave-alone is a constraint.
  if (row.id === 94) {
    expected = { intent: "clarification", resolution: "clarify", route: "calendar" };
    semantic = { historyDelta: 0, commitCount: 0, feedbackPhase: "clarification", noCreation: true, actions: [], intent: { type: "clarification" }, feedback: { title: "I found Shareholders at 11:30 AM, not an exact 11 AM start. Which event should I remove?", detail: "Shareholders — 11:30 AM Nothing changed." } };
  }
  if (row.id === 178) semantic = { ...semantic, calendarActionTypes: ["shift"], actions: [{ type: "calendar.request", request: { constraints: [{ type: "keep", selector: { type: "title", query: "lunch" } }] } }] };
  // capture.update's discriminated union has a top-level title. This is a
  // schema correction to the frozen exact value, never an observed output.
  for (const action of semantic.actions ?? []) if (action.type === "capture.update" && "patch" in action) {
    action.title = (action.patch as { title: string }).title; delete action.patch;
  }
  if (semantic.feedbackPhase !== "confirmation" && row.id !== 94) semantic.noPending = true;
  const classification = (index ? metadata.J : metadata.I).find(([id]) => id === row.id);
  if (!classification) throw new Error(`Missing independently reviewed editorial metadata: ${row.id}`);
  const source = batch.sources[row.sourceLocator.file]!;
  return { id: `voice-rebuild-editorial-${String(row.id).padStart(3, "0")}`, utterance: row.utterance, fixtureId, context, expected, semantic,
    source: "editorial_product", family: String(classification[1]), editorial: { origin: "product-editorial-review", languageFeature: String(classification[2]), reviewScope: `${context.route}:${expected.intent}` },
    provenance: { authoringMethod: "assisted-editorial", baseCaseId: `language-audit-proposal-${row.id}`, transformations: [], reviewStatus: "pending", contractVersion: "2026-09-08", sourceLocation: { file: `artifacts/voice-control-rebuild-20260908/${source.file}`, sha256: source.sha256, line: row.sourceLocator.line }, reviewNote: "FROZEN-I-J-STUDIO-SECOND-REVIEW.md and frozen-I-J-editorial-metadata.json; explicit I160 resize/noPending, clock/context schema corrections, no admission." } };
}));
