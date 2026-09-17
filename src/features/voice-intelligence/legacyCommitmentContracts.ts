import frozen from "./legacyCommitmentSlots.json";
import type { Commitment, LifeRoute, Person } from "../../domain/life-model";
import type { SemanticExpectation } from "./semanticExpectation";

/** Frozen recipient/object/ISO values were independently authored, not parsed
 * from evaluated text. A missing upper deadline cannot create a partial person. */
export const legacyCommitmentContracts = new Map(frozen.rows.map((row) => {
  const at = "2026-09-05T12:00:00.000Z";
  const person: Person = { id: `person-${row.person.toLowerCase()}`, kind: "person", name: row.person, createdAt: at, updatedAt: at };
  const commitment: Commitment = { id: row.newId, kind: "commitment", personId: person.id, title: row.title, direction: "i-owe", status: "open", dueAt: row.dueAt, createdAt: at, updatedAt: at };
  const changes = row.boundary !== "clarification";
  const semantic: SemanticExpectation = {
    historyDelta: changes ? 1 : 0, commitCount: changes ? 1 : 0, feedbackPhase: changes ? "completed" : "clarification",
    noPending: true, noCreation: !changes,
    intent: { type: "commitment-create", person: person.name, title: row.title, direction: "i-owe", status: "open" },
    actions: changes ? [{ type: "person.ensure", person }, { type: "commitment.create", commitment }] : [],
    collections: changes ? { people: [person], commitments: [commitment] } : {},
  };
  return [row.id, { text: row.text, line: row.line, intent: "commitment-create" as const, route: (changes ? "people" : row.route) as LifeRoute, fixtureId: "legacy-seed" as const, semantic }];
}));
