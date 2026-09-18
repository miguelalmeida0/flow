import { describe, expect, it } from "vitest";
import { recallSearch, recallCommitments } from "../capabilities/recall";
import { emptyDocument, fixedClock, AT } from "./fixtures";
import type { CapabilityContext } from "../types";

function contextFor(document = emptyDocument()): CapabilityContext {
  return { document, navigation: { route: "home" }, memory: [], history: [], historyPointer: -1, clock: fixedClock() };
}

describe("recall.search", () => {
  it("returns provenance-carrying hits for a matching query", () => {
    const document = emptyDocument();
    document.plans.push({ id: "plan-1", kind: "plan", title: "Lisbon trip", outcome: "Book flights", status: "active", stepIds: [], createdAt: AT, updatedAt: AT });
    const ctx = contextFor(document);
    const result = recallSearch.execute({ query: "Lisbon" }, ctx);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect((result.data as { sourceId: string }[])[0]?.sourceId).toBe("plan-1");
  });

  it("fails clearly instead of fabricating an answer when nothing matches", () => {
    const ctx = contextFor();
    const result = recallSearch.execute({ query: "atlantis" }, ctx);
    expect(result.status).toBe("error");
  });
});

describe("recall.commitments", () => {
  it("finds what was promised to a specific person", () => {
    const document = emptyDocument();
    document.commitments.push({ id: "c1", kind: "commitment", personId: "person-sofia", title: "Book dinner", direction: "i-owe", status: "open", createdAt: AT, updatedAt: AT });
    const ctx = contextFor(document);
    const result = recallCommitments.execute({ personId: "person-sofia" }, ctx);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect((result.data as { title: string }[])[0]?.title).toBe("Book dinner");
  });

  it("fails clearly when nothing was promised", () => {
    const ctx = contextFor();
    const result = recallCommitments.execute({ personId: "person-nobody" }, ctx);
    expect(result.status).toBe("error");
  });
});
