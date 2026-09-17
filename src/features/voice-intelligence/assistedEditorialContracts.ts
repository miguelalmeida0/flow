import batchA from "./assistedEditorialFrozenA.json";
import batchB from "./assistedEditorialFrozenB.json";
import batchC from "./assistedEditorialFrozenC.json";
import batchD from "./assistedEditorialFrozenD.json";
import { expandFrozenSemantic } from "./frozenSemanticExpansion";
import { acceptanceFixture, type AcceptanceFixtureId } from "./acceptanceFixtures";
import type { LifeContext } from "../../domain/life-model";
import type { LanguageCase } from "./languageDatabase";
import type { SemanticExpectation } from "./semanticExpectation";

interface FrozenAssistedEnvelope {
  sources: Record<string, { file: string; sha256: string }>;
  caseDefaults: { editorial: { reviewScope: string } };
  semanticDefaults: SemanticExpectation;
  cases: { id: number; utterance: string; fixtureId: AcceptanceFixtureId; contextOverrides: Partial<LifeContext>; family: string; feature: string; expected: LanguageCase["expected"]; semantic: SemanticExpectation; sourceLocator: { file: string; row: number; line: number } }[];
}

/** The two independent reviewers froze these declarations before execution.
 * Schema expansion is mechanical, not admission and not a parser oracle. */
export const pendingAssistedEditorialCases: LanguageCase[] = ([batchA, batchB, batchC, batchD] as unknown as FrozenAssistedEnvelope[]).flatMap((batch) => batch.cases.map((row) => {
  const fixture = acceptanceFixture(row.fixtureId);
  const context = { ...fixture.context, ...row.contextOverrides };
  const source = batch.sources[row.sourceLocator.file]!;
  return {
    id: `voice-rebuild-editorial-${String(row.id).padStart(3, "0")}`, utterance: row.utterance,
    fixtureId: row.fixtureId, context, expected: row.expected, source: "editorial_product" as const, family: row.family,
    semantic: expandFrozenSemantic({ ...batch.semanticDefaults, ...row.semantic }, fixture.snapshot.document, new Date(context.nowMs!).toISOString()),
    editorial: { origin: "product-editorial-review" as const, languageFeature: row.feature, reviewScope: `${context.route}:${row.expected.intent}` },
    provenance: { authoringMethod: "assisted-editorial" as const, baseCaseId: `language-audit-proposal-${String(row.id).padStart(3, "0")}`, transformations: [], reviewStatus: "pending" as const, contractVersion: "2026-09-08" as const, reviewNote: batch.caseDefaults.editorial.reviewScope, sourceLocation: { file: `artifacts/voice-control-rebuild-20260908/${source.file}`, line: row.sourceLocator.line, sha256: source.sha256 } },
  };
}));
