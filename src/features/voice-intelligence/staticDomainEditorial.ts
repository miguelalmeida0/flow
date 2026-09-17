import batchA from "./staticDomainEditorialA.json";
import batchB from "./staticDomainEditorialB.json";
import representativeA from "./staticRepresentativeEditorialA.json";
import { acceptanceFixture, type AcceptanceFixtureId } from "./acceptanceFixtures";
import type { LifeContext } from "../../domain/life-model";
import type { LanguageCase } from "./languageDatabase";
import type { SemanticExpectation } from "./semanticExpectation";
import { expandFrozenSemantic, type FrozenCollectionRecipe } from "./frozenSemanticExpansion";

interface FrozenDomainCase {
  id: string; utterance: string; fixtureId: AcceptanceFixtureId; contextOverrides: Partial<LifeContext>;
  expected: LanguageCase["expected"]; semantic: SemanticExpectation;
  source: { file: string; line: number; sha256: string };
  editorial: { family: string; languageFeature: string };
  collectionRecipes?: FrozenCollectionRecipe[];
  contextReferenceRecipes?: { field: "lastReferenced"; kind: NonNullable<LifeContext["lastReferenced"]>["kind"]; id: string; ageMs: number }[];
  pendingActions?: SemanticExpectation["actions"];
}

/** Pending contracts, never a release-inventory shortcut. */
export const pendingStaticDomainCases: LanguageCase[] = ([batchA, batchB, { ...representativeA, semanticDefaults: { noPending: true } }] as unknown as { cases: FrozenDomainCase[]; semanticDefaults?: Partial<SemanticExpectation> }[]).flatMap(({ cases, semanticDefaults }) => cases.map((row) => {
  const fixture = acceptanceFixture(row.fixtureId);
  const context = { ...fixture.context, ...row.contextOverrides };
  for (const reference of row.contextReferenceRecipes ?? []) context[reference.field] = { kind: reference.kind, id: reference.id, at: context.nowMs! - reference.ageMs };
  const semantic = expandFrozenSemantic({ ...semanticDefaults, ...row.semantic }, fixture.snapshot.document, new Date(context.nowMs!).toISOString(), row.collectionRecipes);
  if (row.pendingActions) Object.assign(semantic, { actions: row.pendingActions.map((action) => {
    // The trace records the attempted request, while pending owns the later
    // authorization. Neither implies the user has already confirmed it.
    if (action.type !== "calendar.request") return action;
    const attempt = { ...action };
    delete attempt.confirmed;
    return attempt;
  }), pendingActions: row.pendingActions });
  return {
    id: row.id, utterance: row.utterance, fixtureId: row.fixtureId, context, expected: row.expected, semantic,
    source: "editorial_product", family: row.editorial.family,
    editorial: { origin: "product-editorial-review", languageFeature: row.editorial.languageFeature, reviewScope: `${context.route}:${row.expected.intent}` },
    provenance: { authoringMethod: "repository-test-extraction", baseCaseId: row.id, transformations: [], reviewStatus: "pending", contractVersion: "2026-09-08", sourceLocation: row.source },
  };
}));
