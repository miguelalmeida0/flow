import drafts from "./staticSourceEditorialDrafts.json";
import { acceptanceFixture, type AcceptanceFixtureId } from "./acceptanceFixtures";
import type { LanguageCase } from "./languageDatabase";
import type { SemanticExpectation } from "./semanticExpectation";
import type { LifeContext } from "../../domain/life-model";

interface FrozenSourceDraft {
  id: string; utterance: string; fixtureId: AcceptanceFixtureId; contextOverrides: Partial<LifeContext>;
  expected: LanguageCase["expected"]; semantic: SemanticExpectation;
  source: { file: string; line: number; sha256: string };
  editorial: { family: string; languageFeature: string };
}

/** Exact archived repository literals + independently reviewed field oracles.
 * Review does not bypass unchanged editorial lint or production execution.
 * These records remain pending and are NOT counted in the release quota. */
export const pendingStaticSourceCases: LanguageCase[] = (drafts as FrozenSourceDraft[]).map((draft) => {
  const context = { ...acceptanceFixture(draft.fixtureId).context, ...draft.contextOverrides };
  return {
    id: draft.id, utterance: draft.utterance, fixtureId: draft.fixtureId, context, expected: draft.expected,
    semantic: { ...draft.semantic, feedbackPhase: draft.expected.resolution === "execute" ? "completed" : draft.expected.resolution === "clarify" ? "clarification" : "error", ...(draft.expected.intent === "calendar" ? { actions: [{ type: "calendar.request" as const }] } : {}) },
    source: "editorial_product", family: draft.editorial.family,
    editorial: { origin: "product-editorial-review", languageFeature: draft.editorial.languageFeature, reviewScope: `${context.route}:${draft.expected.intent}` },
    provenance: { authoringMethod: "repository-test-extraction", baseCaseId: draft.id, transformations: [], reviewStatus: "pending", contractVersion: "2026-09-08", sourceLocation: draft.source },
  };
});
