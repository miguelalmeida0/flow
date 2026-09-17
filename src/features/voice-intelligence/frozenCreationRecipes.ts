import type { Capture, Commitment, LifeDocument, Person, Plan, PlanStep } from "../../domain/life-model";
import type { LanguageCase } from "./languageDatabase";
import type { SemanticExpectation } from "./semanticExpectation";

export interface FrozenCreationSlots {
  oracleRecipe: "capture" | "step" | "outcome" | "commitment";
  utterance: string; newId: string; title?: string; intentTitle?: string; storedTitle?: string;
  stepId?: string; personName?: string; personId?: string; direction?: "i-owe" | "waiting-on" | "next-conversation"; dueAt?: string;
}

/** Literal slot/record recipes independently reviewed before execution. There
 * is deliberately no transcript parsing, ID allocator or planner call here. */
export function frozenCreation(row: FrozenCreationSlots, before: LifeDocument, at: string): { expected: LanguageCase["expected"]; semantic: SemanticExpectation } {
  const metadata = { createdAt: at, updatedAt: at };
  const semantic: SemanticExpectation = { historyDelta: 1, feedbackPhase: "completed", noPending: true, noCreation: false };
  if (row.oracleRecipe === "capture") {
    if (!row.intentTitle || !row.storedTitle) throw new Error("Capture declaration is incomplete");
    const capture: Capture = { id: row.newId, kind: "capture", title: row.storedTitle, status: "unresolved", source: "typed", provenance: { routerVersion: 2, transcript: row.utterance, commandId: `evaluation-${row.utterance}` }, ...metadata };
    return { expected: { intent: "capture-create", resolution: "execute", route: "home" }, semantic: { ...semantic, intent: { type: "capture-create", title: row.intentTitle }, actions: [{ type: "capture.create", capture }], collections: { captures: [...before.captures, capture] } } };
  }
  if (!row.title) throw new Error("Creation declaration needs its literal title");
  if (row.oracleRecipe === "step") {
    const parent = before.plans.find(({ id }) => id === "O1");
    if (!parent) throw new Error("Step recipe requires independently declared O1");
    const step: PlanStep = { id: row.newId, kind: "plan-step", planId: "O1", title: row.title, status: "planned", estimatedMinutes: 25, ...metadata };
    return { expected: { intent: "step-add", resolution: "execute", route: "plans" }, semantic: { ...semantic, intent: { type: "step-add", title: row.title }, actions: [{ type: "plan.step.add", step }], collections: { steps: [...before.steps, step], plans: before.plans.map((plan) => plan.id === "O1" ? { ...plan, stepIds: [...plan.stepIds, row.newId], updatedAt: at } : plan) } } };
  }
  if (row.oracleRecipe === "outcome") {
    if (!row.stepId) throw new Error("Outcome declaration needs its initial step identity");
    const step: PlanStep = { id: row.stepId, kind: "plan-step", planId: row.newId, title: "Define the next action", status: "planned", estimatedMinutes: 20, ...metadata };
    const plan: Plan = { id: row.newId, kind: "plan", title: row.title, outcome: `Ready: ${row.title}`, status: "active", stepIds: [], nextStepId: row.stepId, ...metadata };
    return { expected: { intent: "outcome-create", resolution: "execute", route: "plans" }, semantic: { ...semantic, intent: { type: "outcome-create", title: row.title }, actions: [{ type: "plan.create", plan }, { type: "plan.step.add", step }], collections: { plans: [...before.plans, { ...plan, stepIds: [row.stepId] }], steps: [...before.steps, step] } } };
  }
  if (!row.personId || !row.personName || !row.direction) throw new Error("Commitment declaration needs its exact person and direction");
  const person: Person = { id: row.personId, kind: "person", name: row.personName, ...metadata };
  const commitment: Commitment = { id: row.newId, kind: "commitment", personId: row.personId, title: row.title, direction: row.direction, status: "open", dueAt: row.dueAt, ...metadata };
  return { expected: { intent: "commitment-create", resolution: "execute", route: "people" }, semantic: { ...semantic, intent: { type: "commitment-create", person: row.personName, title: row.title, direction: row.direction, status: "open", ...(row.dueAt ? { dueAt: row.dueAt } : {}) }, ...(!row.dueAt ? { absentIntentFields: ["dueAt"] } : {}), actions: [{ type: "person.ensure", person }, { type: "commitment.create", commitment }], collections: { people: [...before.people, person], commitments: [...before.commitments, commitment] } } };
}
