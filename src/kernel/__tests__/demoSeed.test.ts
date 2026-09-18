import { describe, expect, it } from "vitest";
import { applyLifeTransaction } from "../../domain/life-transaction";
import { buildDemoSeedActions, DEMO_PERSON_SOFIA_ID, DEMO_JOURNAL_LISBON_ID, DEMO_COMMITMENT_SOFIA_ID, DEMO_RESET_PHRASE } from "../demoSeed";
import { emptyDocument, AT } from "./fixtures";
import { searchEverything, commitmentsFor } from "../search";

describe("demo seed", () => {
  it("applies cleanly through the real transaction pipeline", () => {
    const document = emptyDocument();
    const result = applyLifeTransaction(document, buildDemoSeedActions(AT, document), () => new Date(AT));
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.document.people.some((p) => p.id === DEMO_PERSON_SOFIA_ID && p.name === "Sofia")).toBe(true);
    expect(result.document.studio.journalEntries.some((entry) => entry.id === DEMO_JOURNAL_LISBON_ID)).toBe(true);
    expect(result.document.commitments.some((commitment) => commitment.id === DEMO_COMMITMENT_SOFIA_ID)).toBe(true);
  });

  it("is idempotent — running it twice never duplicates Sofia", () => {
    const document = emptyDocument();
    const once = applyLifeTransaction(document, buildDemoSeedActions(AT, document), () => new Date(AT));
    if (once.status !== "success") throw new Error("seed failed");
    const twice = applyLifeTransaction(once.document, buildDemoSeedActions(AT, once.document), () => new Date(AT));
    // A second run with nothing left to add produces zero actions, which
    // applyLifeTransaction still reports as a clean no-op success.
    if (twice.status !== "success") throw new Error("seed failed");
    expect(twice.document.people.filter((p) => p.name === "Sofia")).toHaveLength(1);
  });

  it("seeded Lisbon entry is findable by recall with real audio provenance", () => {
    const document = emptyDocument();
    const result = applyLifeTransaction(document, buildDemoSeedActions(AT, document), () => new Date(AT));
    if (result.status !== "success") throw new Error("seed failed");
    const hits = searchEverything(result.document, [], "Lisbon");
    expect(hits[0]).toMatchObject({ domain: "journal", sourceId: DEMO_JOURNAL_LISBON_ID });

    const hotelHits = searchEverything(result.document, [], "hotel");
    expect(hotelHits[0]?.audioTimestampStart).toBe(4200);
    expect(hotelHits[0]?.audioTimestampEnd).toBe(9800);
  });

  it("seeded commitment is findable via commitmentsFor Sofia", () => {
    const document = emptyDocument();
    const result = applyLifeTransaction(document, buildDemoSeedActions(AT, document), () => new Date(AT));
    if (result.status !== "success") throw new Error("seed failed");
    const hits = commitmentsFor(result.document, DEMO_PERSON_SOFIA_ID);
    expect(hits.some((hit) => hit.sourceId === DEMO_COMMITMENT_SOFIA_ID)).toBe(true);
  });

  it("recognizes the reset phrase in a few natural forms", () => {
    expect(DEMO_RESET_PHRASE.test("reset the demo")).toBe(true);
    expect(DEMO_RESET_PHRASE.test("reset demo data")).toBe(true);
    expect(DEMO_RESET_PHRASE.test("load demo data")).toBe(true);
    expect(DEMO_RESET_PHRASE.test("set up the demo")).toBe(true);
    expect(DEMO_RESET_PHRASE.test("what's the demo")).toBe(false);
  });
});
