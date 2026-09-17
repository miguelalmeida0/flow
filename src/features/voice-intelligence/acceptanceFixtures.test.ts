import { describe, expect, it } from "vitest";
import { acceptanceClock, acceptanceFixture } from "./acceptanceFixtures";
import { applyLifeTransaction } from "../../domain/life-transaction";
import legacyFullFixture from "./legacyFullFixture.json";

describe("independent fixture schema fidelity", () => {
  it("matches the independently frozen complete legacy BEFORE without manufacturing entities", () => {
    expect(acceptanceFixture("legacy-seed").snapshot).toEqual(legacyFullFixture);
  });
  it("does not create a serialization-only change when normalizing an idempotent representative request", () => {
    const before = acceptanceFixture("calendar-representative").snapshot.document;
    const result = applyLifeTransaction(before, [{ type: "calendar.request", request: { transcript: "Protect lunch", normalized: "protect lunch", mode: "commit", constraints: [], actions: [{ type: "protect", selector: { type: "id", id: "R-Lunch" } }] } }], () => acceptanceClock);
    expect(result.status).toBe("success");
    if (result.status !== "success") throw new Error(result.title);
    expect(result.document).toEqual(before);
    expect(JSON.stringify(result.document)).toBe(JSON.stringify(before));
  });
});
