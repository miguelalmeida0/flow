import { describe, expect, it } from "vitest";
import { acceptanceFixture } from "./acceptanceFixtures";
import { expandFrozenSemantic } from "./frozenSemanticExpansion";
import type { SemanticExpectation } from "./semanticExpectation";

describe("independent frozen declaration expansion", () => {
  it("represents explicit optional-field removal without storing a marker string", () => {
    const before = acceptanceFixture("memory-source").snapshot.document;
    const frozen = { historyDelta: 1, memoryChanges: [{ id: "M1", patch: { photoAssetId: "$UNDEFINED" } }] };
    expect(expandFrozenSemantic(frozen, before, "2026-09-08T08:00:00.000Z").memoryChanges).toEqual([{ id: "M1", patch: { photoAssetId: undefined } }]);
    expect(before.studio.memories[0]!.photoAssetId).toBe("P1");
  });
  it("does not timestamp an untouched alias just because its explicit patch is empty", () => {
    const before = acceptanceFixture("outcome-reference").snapshot.document;
    before.plans[1]!.updatedAt = "2026-01-01T00:00:00.000Z";
    const declaration = { historyDelta: 0, collections: { plans: [{ $entity: "O1" }, { $entity: "O2", patch: {} }] } } as unknown as SemanticExpectation;
    expect(expandFrozenSemantic(declaration, before, "2026-09-08T08:00:00.000Z").collections!.plans).toEqual(before.plans);
  });
});
