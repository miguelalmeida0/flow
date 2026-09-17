import { describe, expect, it } from "vitest";
import type { LanguageCase } from "./languageDatabase";
import { reviewedLanguageAdmission } from "./reviewedLanguageAdmission";

const reviewed: LanguageCase = {
  id: "admission-schema-example", utterance: "Open calendar for the full week", fixtureId: "empty-home",
  context: { route: "home", nowMs: 1788854400000, activeMode: "command", currentTimeScope: { kind: "day", dateKey: "2026-09-08" } },
  expected: { intent: "navigate-temporal", resolution: "execute", route: "calendar" }, source: "editorial_product", family: "calendar-view",
  editorial: { origin: "product-editorial-review", languageFeature: "explicit-calendar-week", reviewScope: "home:navigate-temporal" },
  provenance: { authoringMethod: "assisted-editorial", baseCaseId: "admission-schema-only", reviewStatus: "admitted", transformations: [], contractVersion: "2026-09-08" },
  semantic: { historyDelta: 0, feedbackPhase: "completed", intent: { type: "navigate-temporal", route: "calendar", scope: { kind: "week", dateKey: "2026-09-07", endDateKey: "2026-09-13" } }, noCreation: true },
};
describe("rich editorial admission schema, not a corpus utterance", () => {
  it("retains every independently frozen field without flattening it through legacy seeds", () => {
    const result = reviewedLanguageAdmission([reviewed]);
    expect(result).toEqual([reviewed]); expect(result[0]).not.toBe(reviewed);
  });
  it("never counts a pending proposal", () => {
    expect(reviewedLanguageAdmission([{ ...reviewed, provenance: { ...reviewed.provenance!, reviewStatus: "pending" } }])).toEqual([]);
  });
  it.each(["fixtureId", "semantic", "editorial"] as const)("rejects admitted records missing %s", (key) => {
    expect(() => reviewedLanguageAdmission([{ ...reviewed, [key]: undefined }])).toThrow("Incomplete independent editorial admission");
  });
  it("requires an exact feedback outcome and route instead of broad execution or parser-derived expectations", () => {
    expect(() => reviewedLanguageAdmission([{ ...reviewed, semantic: { ...reviewed.semantic!, feedbackPhase: undefined } }])).toThrow();
    expect(() => reviewedLanguageAdmission([{ ...reviewed, expected: { ...reviewed.expected, route: undefined } }])).toThrow();
  });
});
