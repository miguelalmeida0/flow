import batchE from "./assistedEditorialReviewedE.json";
import batchF from "./assistedEditorialReviewedF.json";
import batchG from "./assistedEditorialReviewedG.json";
import batchH from "./assistedEditorialReviewedH.json";
import { acceptanceFixture, type AcceptanceFixtureId } from "./acceptanceFixtures";
import { expandFrozenSemantic, type FrozenCollectionRecipe } from "./frozenSemanticExpansion";
import type { LifeContext } from "../../domain/life-model";
import type { LanguageCase } from "./languageDatabase";
import type { SemanticExpectation } from "./semanticExpectation";

interface ReviewedEnvelope {
  defaults: { semantic: SemanticExpectation };
  cases: { id: number; utterance: string; fixtureId: AcceptanceFixtureId; contextOverrides?: Partial<LifeContext>; family: string; feature: string; expected: LanguageCase["expected"]; semantic: SemanticExpectation; collectionChanges?: FrozenCollectionRecipe[] }[];
}
const sources = [{"file":"artifacts/voice-control-rebuild-20260908/new-assisted-841-860.json","sha256":"0f616aeaba5ff3846b7f3f40e9efc3d0869956b97ab2c1b281ac28cf2f65bacf"},{"file":"artifacts/voice-control-rebuild-20260908/new-assisted-861-880.json","sha256":"835360ad76a3a0e8bae47b3ef584a2763134f42d3a18731d6882aa1eb3805820"},{"file":"artifacts/voice-control-rebuild-20260908/new-assisted-881-900.json","sha256":"538184c2eb5fb22474fe543c4e4665f2068d6083cb5801d127d91438fede28c8"},{"file":"artifacts/voice-control-rebuild-20260908/new-assisted-901-920.json","sha256":"940f64645b12968ba0aa07bdec8d7a7e6b4f3c4b21910bc4c2eebec362d817f0"}];

/** Broad existing semantic families, never wording-specific namespaces. */
function familyFor(row: ReviewedEnvelope["cases"][number]): string {
  const intent = row.expected.intent!;
  if (intent === "unsupported") return "unsupported-safety";
  if (intent === "calendar") {
    const types = row.semantic.calendarActionTypes ?? [];
    return types.length > 1 ? "calendar-compound" : types[0] === "unprotect" ? "calendar-protect" : `calendar-${types[0] ?? "clarification"}`;
  }
  if (intent.startsWith("navigate")) return "navigation-motion";
  if (intent === "temporal") return "temporal-relative";
  if (intent.startsWith("memory")) return "memory-editing";
  if (intent.startsWith("journal")) return intent === "journal-append" ? "journal-dictation" : "journal-editing";
  if (intent.startsWith("atmosphere")) return "atmosphere-adjust";
  if (intent.startsWith("capture")) return "capture-editing";
  if (intent.startsWith("plan") || intent.startsWith("step")) return "outcome-editing";
  if (intent.startsWith("commitment")) return "commitment-editing";
  return intent;
}

export const pendingReviewedAssistedCases: LanguageCase[] = ([batchE, batchF, batchG, batchH] as unknown as ReviewedEnvelope[]).flatMap((batch, batchIndex) => batch.cases.filter(({ id }) => id !== 845).map((row) => {
  const fixture = acceptanceFixture(row.fixtureId);
  const context = { ...fixture.context, ...row.contextOverrides, ...(row.id === 855 ? { selectedJournalPassage: "Tomorrow feels less daunting." } : {}) };
  const semantic = expandFrozenSemantic({ ...batch.defaults.semantic, ...row.semantic }, fixture.snapshot.document, new Date(context.nowMs!).toISOString(), row.collectionChanges?.map((recipe) => ({ ...recipe, updatedAt: "fixtureClock" })));
  if (row.id === 876) Object.assign(semantic, { resultEntityIds: ["K2"], feedback: { title: "Daniel: Delivery confirmation", detail: "1 locally stored commitment." } });
  return {
    id: `voice-rebuild-editorial-${row.id}`, utterance: row.utterance, fixtureId: row.fixtureId, context, semantic, expected: row.expected,
    source: "editorial_product", family: familyFor(row), editorial: { origin: "product-editorial-review", languageFeature: row.feature, reviewScope: `${context.route}:${row.expected.intent}` },
    provenance: { authoringMethod: "assisted-editorial", baseCaseId: `language-audit-proposal-${row.id}`, transformations: [], reviewStatus: "pending", contractVersion: "2026-09-08", sourceLocation: { ...sources[batchIndex]!, line: 1 }, reviewNote: "Root second-reader review in new-assisted-841-920-review.md; 845 held, 855 selected range explicit, 876 exact result membership. Source coordinate is JSON document root; baseCaseId identifies the exact row. Not admitted." },
  };
}));
