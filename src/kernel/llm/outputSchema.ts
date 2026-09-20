/**
 * The single flat JSON-Schema envelope sent as Ollama's `format` for every
 * conversational-model round. Ollama's structured-output decoding accepts
 * one static schema per request, so this describes the union of all five
 * `ModelTurnOutput` kinds as one object with mostly-optional fields;
 * validateModelOutput.ts is what actually enforces "exactly the fields for
 * this kind, nothing else trusted blindly" after the JSON comes back. The
 * model choosing valid JSON against this schema is necessary, never
 * sufficient — see validateModelOutput.ts's module doc.
 */
export const MODEL_TURN_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["answer", "clarify", "plan", "lookup", "unavailable"] },
    text: { type: ["string", "null"] },
    sources: { type: "array", items: { type: "string" } },
    question: { type: ["string", "null"] },
    choices: { type: "array", items: { type: "string" } },
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: { capabilityId: { type: "string" }, args: { type: "object" } },
        required: ["capabilityId", "args"],
      },
    },
    summary: { type: ["string", "null"] },
    conditions: { type: "array", items: { type: "string" } },
    capabilityId: { type: ["string", "null"] },
    args: { type: "object" },
    explanation: { type: ["string", "null"] },
  },
  required: ["kind"],
} as const;
