import { expect, it } from "vitest";
import { createOutcomeLedger } from "./productionOutcomeLedger";

it("records a failed oracle and continues independent cases", () => {
  const ledger = createOutcomeLedger(["a", "b"]);
  ledger.run("a", () => { throw new Error("exact document mismatch"); });
  ledger.run("b", () => ({ feedback: "clarification", expectedResolution: "execute" }));
  expect(ledger.summary()).toMatchObject({ complete: true, passed: 1, failed: 1, skipped: 0, accuracy: 0.5, safetyMetricsComplete: false });
  expect(ledger.outcomes()).toMatchObject([{ id: "a", status: "failed", reason: "exact document mismatch" }, { id: "b", status: "passed" }]);
});

it("records dependent dialogue skips without hiding later dialogues", () => {
  const ledger = createOutcomeLedger(["d1-1", "d1-2", "d2-1"]);
  ledger.run("d1-1", () => { throw new Error("failed turn"); });
  ledger.skip("d1-2", "dependency:d1-1");
  ledger.run("d2-1", () => true);
  expect(ledger.summary()).toMatchObject({ complete: false, passed: 1, failed: 1, skipped: 1, missing: 0, accuracy: null });
});

it("reports every unexecuted identity in a filtered or interrupted run", () => {
  const ledger = createOutcomeLedger(["a", "b", "c"]);
  ledger.run("b", () => true);
  expect(ledger.summary()).toMatchObject({ complete: false, expected: 3, cases: 3, missing: 2, accuracy: null });
  expect(ledger.outcomes()).toMatchObject([{ id: "a", status: "skipped", reason: "not-executed" }, { id: "b", status: "passed" }, { id: "c", status: "skipped", reason: "not-executed" }]);
});

it("rejects empty, duplicate, foreign and repeated identities", () => {
  expect(() => createOutcomeLedger([])).toThrow();
  expect(() => createOutcomeLedger(["a", "a"])).toThrow();
  const ledger = createOutcomeLedger(["a"]);
  expect(() => ledger.run("b", () => true)).toThrow();
  ledger.run("a", () => true);
  expect(() => ledger.run("a", () => true)).toThrow();
});
