import { describe, it, expect } from "vitest";
import { needsVerification, parseVerifierOutput } from "./verifier";

describe("needsVerification", () => {
  const noHighRisk = new Set<string>();

  it("flags a high-stakes complexity reason regardless of interpreter output kind", () => {
    expect(needsVerification({ complexityReasons: ["condition-clause"], validated: { kind: "answer", text: "x", sources: [] }, highRiskCapabilityIds: noHighRisk })).toBe(true);
    expect(needsVerification({ complexityReasons: ["hypothetical"], validated: { kind: "unavailable", explanation: "x" }, highRiskCapabilityIds: noHighRisk })).toBe(true);
  });

  it("does not flag a plain phrasing with a single-step, low-risk plan", () => {
    const validated = { kind: "plan" as const, steps: [{ capabilityId: "calendar.move", args: {}, utterance: "x" }], summary: "x", conditions: [] };
    expect(needsVerification({ complexityReasons: [], validated, highRiskCapabilityIds: noHighRisk })).toBe(false);
  });

  it("flags a batch plan (more than one step) even with no complexity reasons", () => {
    const validated = { kind: "plan" as const, steps: [{ capabilityId: "calendar.move", args: {}, utterance: "x" }, { capabilityId: "calendar.move", args: {}, utterance: "x" }], summary: "x", conditions: [] };
    expect(needsVerification({ complexityReasons: [], validated, highRiskCapabilityIds: noHighRisk })).toBe(true);
  });

  it("flags a single-step plan naming a high-risk capability even with no complexity reasons", () => {
    const validated = { kind: "plan" as const, steps: [{ capabilityId: "calendar.delete", args: {}, utterance: "x" }], summary: "x", conditions: [] };
    expect(needsVerification({ complexityReasons: [], validated, highRiskCapabilityIds: new Set(["calendar.delete"]) })).toBe(true);
  });

  it("does not flag a bare explanatory-question or ambiguous-action-verb reason alone", () => {
    const validated = { kind: "answer" as const, text: "x", sources: [] };
    expect(needsVerification({ complexityReasons: ["explanatory-question"], validated, highRiskCapabilityIds: noHighRisk })).toBe(false);
    expect(needsVerification({ complexityReasons: ["ambiguous-action-verb"], validated, highRiskCapabilityIds: noHighRisk })).toBe(false);
  });
});

describe("parseVerifierOutput", () => {
  it("parses a well-formed accept verdict", () => {
    const result = parseVerifierOutput(JSON.stringify({ verdict: "accept" }));
    expect(result.verdict).toBe("accept");
  });

  it("parses a well-formed clarify verdict with its question", () => {
    const result = parseVerifierOutput(JSON.stringify({ verdict: "clarify", clarifyQuestion: "Which dinner?" }));
    expect(result.verdict).toBe("clarify");
    expect(result.clarifyQuestion).toBe("Which dinner?");
  });

  it("treats a clarify verdict with no question as unusable (fails open, doesn't ask an empty question)", () => {
    const result = parseVerifierOutput(JSON.stringify({ verdict: "clarify" }));
    expect(result.verdict).toBe("unusable");
  });

  it("parses a well-formed repair verdict and preserves the repaired frame as raw JSON", () => {
    const result = parseVerifierOutput(JSON.stringify({ verdict: "repair", repairedFrame: { kind: "answer", text: "corrected" } }));
    expect(result.verdict).toBe("repair");
    expect(JSON.parse(result.repairedFrameJson!)).toEqual({ kind: "answer", text: "corrected" });
  });

  it("treats a repair verdict with no repairedFrame as unusable", () => {
    const result = parseVerifierOutput(JSON.stringify({ verdict: "repair" }));
    expect(result.verdict).toBe("unusable");
  });

  it("treats malformed JSON as unusable, never throws", () => {
    expect(() => parseVerifierOutput("{ not json")).not.toThrow();
    expect(parseVerifierOutput("{ not json").verdict).toBe("unusable");
  });

  it("treats an unknown verdict string as unusable", () => {
    expect(parseVerifierOutput(JSON.stringify({ verdict: "maybe" })).verdict).toBe("unusable");
  });

  it("bounds and sanitizes the issue-list fields regardless of verdict", () => {
    const huge = Array.from({ length: 20 }, (_, i) => `issue ${i}`);
    const result = parseVerifierOutput(JSON.stringify({ verdict: "accept", missingConstraints: huge }));
    expect(result.missingConstraints.length).toBeLessThanOrEqual(6);
  });
});
