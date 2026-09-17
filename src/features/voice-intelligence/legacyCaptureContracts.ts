import slots from "./legacyCaptureSlots.json";
import type { Capture } from "../../domain/life-model";
import type { SemanticExpectation } from "./semanticExpectation";

/** All payload spans, complete source strings and IDs were independently
 * frozen. No prefix recognition, scheduling or production parsing here. */
export const legacyCaptureContracts = new Map(slots.rows.map((row) => {
  if (row.text.slice(row.start, row.end) !== row.payload) throw new Error(`Changed frozen Capture span: ${row.id}`);
  const title = row.payload[0]!.toUpperCase() + row.payload.slice(1);
  const capture: Capture = { id: row.newId, kind: "capture", title, status: "unresolved", source: "typed",
    provenance: { routerVersion: 2, transcript: row.text, commandId: `evaluation-${row.text}` }, createdAt: "2026-09-05T12:00:00.000Z", updatedAt: "2026-09-05T12:00:00.000Z" };
  const semantic: SemanticExpectation = { historyDelta: 1, commitCount: 1, feedbackPhase: "completed", noCreation: false, noPending: true,
    // Interpretation retains the raw span; displayTitle capitalizes only the
    // stored record. Do not conflate parser representation and product value.
    intent: { type: "capture-create", title: row.payload }, actions: [{ type: "capture.create", capture }], collections: { captures: [capture] } };
  return [row.id, { text: row.text, line: row.line, intent: "capture-create" as const, fixtureId: "legacy-seed" as const, semantic }];
}));
