/**
 * Structured-output schema for the semantic verifier (see verifier.ts's
 * module doc). A second, independent model pass over the interpreter's own
 * proposed response — never an executor, never trusted any more than the
 * interpreter's own output (validateModelOutput.ts re-validates a
 * `repair` verdict's `repairedFrame` exactly like a fresh interpreter
 * round, nothing here gets a shortcut past that boundary).
 */
export const VERIFIER_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["accept", "repair", "clarify"] },
    missingConstraints: { type: "array", items: { type: "string" } },
    contradictions: { type: "array", items: { type: "string" } },
    unsupportedAssumptions: { type: "array", items: { type: "string" } },
    referentProblems: { type: "array", items: { type: "string" } },
    temporalProblems: { type: "array", items: { type: "string" } },
    clarifyQuestion: { type: ["string", "null"] },
    repairedFrame: {
      type: ["object", "null"],
      properties: {
        kind: { type: "string", enum: ["answer", "clarify", "plan", "unavailable"] },
        text: { type: ["string", "null"] },
        question: { type: ["string", "null"] },
        choices: { type: "array", items: { type: "string" } },
        steps: {
          type: "array",
          items: { type: "object", properties: { capabilityId: { type: "string" }, args: { type: "object" } }, required: ["capabilityId", "args"] },
        },
        summary: { type: ["string", "null"] },
        conditions: { type: "array", items: { type: "string" } },
        explanation: { type: ["string", "null"] },
      },
    },
  },
  required: ["verdict"],
} as const;
