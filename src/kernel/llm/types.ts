/**
 * Shared types for the conversational-intelligence layer (src/kernel/llm/).
 *
 * This layer's job is narrow: take a transcript the deterministic
 * recognizers (kernel's recognizeIntent, legacy's resolveGlobalCommand)
 * already declined or that a cheap linguistic gate flagged as too complex
 * for them, produce a structured interpretation via the local model, then
 * hand anything action-shaped to the EXISTING kernel `submit()` so it goes
 * through the same validation/preflight/proposal/clarification machinery as
 * every other command. This module never mutates state itself.
 */

/** One capability call the model proposes, before any validation. Shape
 * matches src/kernel/planner.ts's PlanStepInput so it can be handed to
 * kernel `submit()` unchanged once validated. */
export interface ModelStepProposal {
  capabilityId: string;
  args: Record<string, unknown>;
}

/**
 * The single structured-output envelope the model must produce every round.
 * All five kinds share one flat JSON shape (see outputSchema.ts) because
 * Ollama's `format` is one static schema per request; validateModelOutput.ts
 * narrows it back into this discriminated union and rejects anything that
 * doesn't cleanly fit one kind.
 */
export type ModelTurnOutput =
  | { kind: "answer"; text: string; sources?: string[] }
  | { kind: "clarify"; question: string; choices?: string[] }
  | { kind: "plan"; steps: ModelStepProposal[]; summary: string; conditions?: string[] }
  | { kind: "lookup"; capabilityId: string; args: Record<string, unknown> }
  | { kind: "unavailable"; explanation: string };

/** A single prior lookup this turn, fed back into the next round's prompt so
 * the model can use the result instead of re-asking for it. */
export interface LookupRecord {
  capabilityId: string;
  args: Record<string, unknown>;
  resultSummary: string;
}

export interface ConversationBudget {
  /** Max model round-trips for a single turn (a "round" = one model call, optionally followed by one bounded read-only lookup). */
  maxRounds: number;
  /** Max mutating/read steps in a single proposed plan. */
  maxPlanSteps: number;
  /** Wall-clock deadline for the whole turn, milliseconds. */
  turnDeadlineMs: number;
  /** Per-model-call deadline, milliseconds (enforced by the companion too; this is the client-side mirror). */
  roundDeadlineMs: number;
  /** Per-verifier-call deadline, milliseconds — see verifier.ts. Separate
   * from roundDeadlineMs since a verifier call happens at most ONCE per
   * turn (never repeated), after the interpreter's own rounds. */
  verifierRoundDeadlineMs: number;
  /** Below this much remaining turn budget, skip verification entirely and
   * fail open to the interpreter's own (already capability-validated)
   * result rather than risk turning a real answer into a deadline decline. */
  minVerifierBudgetMs: number;
}

export const DEFAULT_CONVERSATION_BUDGET: ConversationBudget = {
  maxRounds: 3,
  maxPlanSteps: 8,
  turnDeadlineMs: 25_000,
  roundDeadlineMs: 15_000,
  verifierRoundDeadlineMs: 15_000,
  minVerifierBudgetMs: 2_000,
};

export type ConversationDeclineReason =
  | "model-unavailable"
  | "invalid-output"
  | "round-limit"
  | "deadline"
  | "cancelled"
  | "plan-rejected"
  | "condition-violated";

export interface ConversationSource {
  label: string;
  entityId?: string;
}
