/**
 * The planner turns one or more already-segmented intents (capability id +
 * arguments, as produced by Flow's existing per-domain interpreters — this
 * layer does not itself do text pattern matching) into a structural Plan.
 * A single utterance may need one step ("move dinner to 8") or several
 * ("move dinner to 8 and text Sofia that I'll be late"). The planner records
 * ordering/dependencies/confidence so the kernel never executes blindly.
 */

export interface PlanStep {
  id: string;
  capabilityId: string;
  args: Record<string, unknown>;
  /** 0..1 confidence the interpreter had in this step; low confidence forces clarification. */
  confidence: number;
  /** Step ids that must execute (successfully) before this one. */
  dependsOn: string[];
  requiresConfirmation: boolean;
  executionState: "pending" | "executed" | "skipped" | "failed";
  /** The sub-utterance this step came from, for traceability in "what changed"/debugging. */
  utterance?: string;
}

export type PlanStatus = "draft" | "ready" | "executing" | "completed" | "failed" | "cancelled";

export interface Plan {
  id: string;
  sourceUtterance: string;
  steps: PlanStep[];
  status: PlanStatus;
  createdAt: string;
}

export interface PlanStepInput {
  capabilityId: string;
  args: Record<string, unknown>;
  confidence?: number;
  requiresConfirmation?: boolean;
  utterance?: string;
  /** Explicit dependency by step index within this same buildPlan call. Defaults to sequential (each step depends on the previous one). */
  dependsOnIndex?: number[];
}

let sequence = 0;
function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

export function buildPlan(sourceUtterance: string, inputs: PlanStepInput[], now: string): Plan {
  const stepIds = inputs.map(() => nextId("step"));
  const steps: PlanStep[] = inputs.map((input, index) => ({
    id: stepIds[index]!,
    capabilityId: input.capabilityId,
    args: input.args,
    confidence: input.confidence ?? 1,
    dependsOn: (input.dependsOnIndex ?? (index > 0 ? [index - 1] : [])).map((i) => stepIds[i]!),
    requiresConfirmation: input.requiresConfirmation ?? false,
    executionState: "pending",
    utterance: input.utterance,
  }));
  return { id: nextId("plan"), sourceUtterance, steps, status: "draft", createdAt: now };
}

export function nextPendingStep(plan: Plan): PlanStep | undefined {
  return plan.steps.find((step) => {
    if (step.executionState !== "pending") return false;
    return step.dependsOn.every((depId) => plan.steps.find((s) => s.id === depId)?.executionState === "executed");
  });
}

export function isPlanComplete(plan: Plan): boolean {
  return plan.steps.every((step) => step.executionState === "executed" || step.executionState === "skipped");
}
