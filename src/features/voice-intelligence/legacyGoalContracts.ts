import slots from "./legacyGoalSlots.json";
import type { SemanticExpectation } from "./semanticExpectation";

/** Fixed authority classification, independent of interpreter output. */
export const legacyGoalContracts = new Map(slots.rows.map((row) => {
  const semantic: SemanticExpectation = { historyDelta: 0, commitCount: 0, noCreation: true, noPending: true,
    actions: [], feedbackPhase: row.scheduling ? "clarification" : "error",
    intent: row.scheduling ? { type: "clarification", continuation: { type: "calendar-create", title: row.title!, durationMinutes: 30, timingHint: "before our family travels to Europe next month" } } : { type: "unsupported" } };
  return [row.id, { text: row.text, line: row.line, intent: row.scheduling ? "clarification" as const : "unsupported" as const,
    resolution: row.scheduling ? "clarify" as const : "unsupported" as const,
    ...(row.scheduling ? { domain: "calendar" } : {}), fixtureId: "legacy-seed" as const, semantic }];
}));
