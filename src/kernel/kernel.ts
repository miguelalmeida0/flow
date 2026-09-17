import type { LifeDocument } from "../domain/life-model";
import type { CapabilityRegistry } from "./registry";
import { emptyPreflight, type CapabilityContext, type CapabilityMutation, type KernelClock, type NavigationState, type PersonalMemoryFact } from "./types";
import { buildPlan, nextPendingStep, type Plan, type PlanStepInput } from "./planner";
import { createClarification, matchClarificationReply, type ClarificationRequest } from "./clarification";
import { createProposal, invalidateProposal, approveProposal, classifyReply, matchProposalAlternative, type Proposal } from "./proposals";
import { resolveArgReferents } from "./referents";
import { createSession, rememberResult, clearInFlight, type ConversationSession } from "./session";
import { emptyHistory, recordMutation, undo as undoHistory, redo as redoHistory, whatChanged as describeChanges, captureState, type HistoryState } from "./history";

export { createSession };

export interface KernelEnvironment {
  registry: CapabilityRegistry;
  document: LifeDocument;
  navigation: NavigationState;
  memory: PersonalMemoryFact[];
  history: HistoryState;
  clock: KernelClock;
}

export function createEnvironment(
  registry: CapabilityRegistry,
  document: LifeDocument,
  navigation: NavigationState,
  clock: KernelClock = { now: () => new Date() },
): KernelEnvironment {
  return { registry, document, navigation, memory: [], history: emptyHistory(), clock };
}

function contextOf(env: KernelEnvironment): CapabilityContext {
  return { document: env.document, navigation: env.navigation, memory: env.memory, history: env.history.entries, historyPointer: env.history.pointer, clock: env.clock };
}

function applyMutation(env: KernelEnvironment, mutation: CapabilityMutation): KernelEnvironment {
  return {
    ...env,
    document: mutation.document ?? env.document,
    navigation: mutation.navigation ?? env.navigation,
    memory: mutation.memory ?? env.memory,
  };
}

export type KernelPhase = "listening" | "thinking" | "checking" | "needs-clarification" | "ready-to-act" | "done";

export type KernelOutcome =
  | { status: "executed"; descriptions: string[] }
  | { status: "proposed"; proposal: Proposal }
  | { status: "clarify"; clarification: ClarificationRequest }
  | { status: "cancelled"; reason: string }
  | { status: "error"; message: string };

export function phaseFor(outcome: KernelOutcome): KernelPhase {
  switch (outcome.status) {
    case "executed":
      return "done";
    case "proposed":
      return "ready-to-act";
    case "clarify":
      return "needs-clarification";
    case "cancelled":
      return "done";
    case "error":
      return "done";
  }
}

export interface KernelStep {
  env: KernelEnvironment;
  session: ConversationSession;
  outcome: KernelOutcome;
}

function fail(env: KernelEnvironment, session: ConversationSession, message: string): KernelStep {
  return { env, session, outcome: { status: "error", message } };
}

/** Executes one already-validated, already-preflighted step and folds its
 * result into env/session, then keeps going through the rest of the plan. */
function executeStep(env: KernelEnvironment, session: ConversationSession, plan: Plan, stepId: string, args: Record<string, unknown>): KernelStep {
  const step = plan.steps.find((candidate) => candidate.id === stepId);
  if (!step) return fail(env, session, `Unknown plan step: ${stepId}`);
  const capability = env.registry.get(step.capabilityId);
  if (!capability) return fail(env, session, `Unknown capability: ${step.capabilityId}`);
  const before = captureState(contextOf(env));
  const result = capability.execute(args, contextOf(env));
  if (result.status === "error") {
    return fail(env, session, result.message);
  }
  let nextEnv = applyMutation(env, result.mutation);
  const after = captureState(contextOf(nextEnv));
  if (capability.mutates && capability.undoable) {
    nextEnv = { ...nextEnv, history: recordMutation(nextEnv.history, capability.id, result.description, env.clock.now().toISOString(), before, after) };
  }
  const nextSession = rememberResult(session, {
    description: result.description,
    entityId: result.entityId,
    entityKind: result.entityKind,
    capabilityId: capability.id,
    timestamp: env.clock.now().toISOString(),
  });
  const updatedPlan: Plan = { ...plan, steps: plan.steps.map((candidate) => (candidate.id === step.id ? { ...candidate, executionState: "executed" } : candidate)) };
  return continuePlan(nextEnv, nextSession, updatedPlan, [result.description]);
}

/** Advances a plan step by step until it needs a proposal, a clarification,
 * fails, or completes. This is the only place steps get executed, so
 * multi-step plans ("move dinner AND text Sofia") never run ahead of an
 * unresolved conflict or confirmation. */
function continuePlan(env: KernelEnvironment, session: ConversationSession, plan: Plan, doneDescriptions: string[] = []): KernelStep {
  const step = nextPendingStep(plan);
  if (!step) {
    return { env, session: clearInFlight(session), outcome: { status: "executed", descriptions: doneDescriptions } };
  }
  const resolvedArgs = resolveArgReferents(session, step.args);
  if (resolvedArgs === null) {
    const clarification = createClarification("What do you mean?", step.id, [], env.clock.now().toISOString());
    return { env, session: { ...session, pendingClarification: clarification, pendingPlan: plan }, outcome: { status: "clarify", clarification } };
  }
  const capability = env.registry.get(step.capabilityId);
  if (!capability) return fail(env, session, `Unknown capability: ${step.capabilityId}`);
  const ctx = contextOf(env);
  const validationError = capability.validate(resolvedArgs, ctx);
  if (validationError) {
    const clarification = createClarification(validationError, step.id, [], env.clock.now().toISOString());
    return { env, session: { ...session, pendingClarification: clarification, pendingPlan: plan }, outcome: { status: "clarify", clarification } };
  }
  const preflight = capability.preflight?.(resolvedArgs, ctx) ?? emptyPreflight();
  const needsConfirmation = capability.riskLevel === "high" || capability.requiresConfirmation(resolvedArgs, ctx);
  if (preflight.blocking) {
    if (preflight.alternatives.length === 0) {
      return fail(env, session, preflight.conflicts.map((conflict) => conflict.message).join(" ") || "That can't be done as stated.");
    }
    const bestAlternative = preflight.alternatives[0]!;
    const proposedStep = { ...step, args: { ...resolvedArgs, ...bestAlternative.args } };
    const proposedPlan: Plan = { ...plan, steps: plan.steps.map((candidate) => (candidate.id === step.id ? proposedStep : candidate)) };
    const proposal = createProposal(plan.id, plan.sourceUtterance, proposedStep, preflight, env.clock.now().toISOString());
    return { env, session: { ...session, activeProposal: proposal, pendingPlan: proposedPlan, pendingClarification: undefined }, outcome: { status: "proposed", proposal } };
  }
  if (needsConfirmation) {
    const confirmStep = { ...step, args: resolvedArgs };
    const confirmPlan: Plan = { ...plan, steps: plan.steps.map((candidate) => (candidate.id === step.id ? confirmStep : candidate)) };
    const proposal = createProposal(plan.id, plan.sourceUtterance, confirmStep, preflight, env.clock.now().toISOString());
    return { env, session: { ...session, activeProposal: proposal, pendingPlan: confirmPlan, pendingClarification: undefined }, outcome: { status: "proposed", proposal } };
  }
  return executeStep(env, session, plan, step.id, resolvedArgs);
}

/** Entry point for a fresh utterance. `intents` are the already-segmented
 * capability calls a domain interpreter produced for this utterance — the
 * kernel does not itself pattern-match natural language (see planner.ts). */
export function submit(env: KernelEnvironment, session: ConversationSession, utterance: string, intents: PlanStepInput[]): KernelStep {
  const plan = buildPlan(utterance, intents, env.clock.now().toISOString());
  return continuePlan(env, clearInFlight(session), plan);
}

function requireProposal(env: KernelEnvironment, session: ConversationSession): { proposal: Proposal; plan: Plan } | KernelStep {
  if (!session.activeProposal || session.activeProposal.status !== "pending" || !session.pendingPlan) {
    return fail(env, session, "There's nothing to confirm.");
  }
  return { proposal: session.activeProposal, plan: session.pendingPlan };
}

/** "yes"/"do it" — approves ONLY the session's current activeProposal. A
 * proposal that has already been replaced (see submit/continuePlan building
 * a new one) can never be approved here because it's no longer session.activeProposal. */
export function approve(env: KernelEnvironment, session: ConversationSession): KernelStep {
  const found = requireProposal(env, session);
  if ("outcome" in found) return found;
  const { proposal, plan } = found;
  const approved = approveProposal(proposal);
  const nextSession = { ...session, activeProposal: approved };
  return executeStep(env, nextSession, plan, proposal.step.id, proposal.step.args);
}

/** Picks a non-default alternative the proposal offered, e.g. "the first one" / "7:30". */
export function chooseAlternative(env: KernelEnvironment, session: ConversationSession, label: string): KernelStep {
  const found = requireProposal(env, session);
  if ("outcome" in found) return found;
  const { proposal, plan } = found;
  const alternative = proposal.consequences.alternatives.find((candidate) => candidate.label.toLowerCase() === label.toLowerCase());
  if (!alternative) return fail(env, session, `"${label}" wasn't one of the options.`);
  const args = { ...proposal.step.args, ...alternative.args };
  const approved = approveProposal({ ...proposal, step: { ...proposal.step, args } });
  return executeStep(env, { ...session, activeProposal: approved }, plan, proposal.step.id, args);
}

/** "no"/rejecting the active proposal outright — nothing changes. */
export function reject(env: KernelEnvironment, session: ConversationSession): KernelStep {
  const found = requireProposal(env, session);
  if ("outcome" in found) return found;
  const { proposal } = found;
  invalidateProposal(proposal);
  return { env, session: clearInFlight(session), outcome: { status: "cancelled", reason: "Rejected." } };
}

/** "wait"/"stop"/"cancel"/"never mind" — clears whatever is in flight without touching earlier committed state. */
export function cancel(env: KernelEnvironment, session: ConversationSession): KernelStep {
  return { env, session: clearInFlight(session), outcome: { status: "cancelled", reason: "Cancelled." } };
}

export function undo(env: KernelEnvironment, session: ConversationSession): KernelStep {
  const step = undoHistory(env.history);
  if (!step) return fail(env, session, "There's nothing to undo.");
  const nextEnv: KernelEnvironment = { ...env, document: step.state.document, navigation: step.state.navigation, memory: step.state.memory, history: { ...env.history, pointer: step.pointer } };
  const nextSession = rememberResult(clearInFlight(session), { description: step.description, capabilityId: "system.undo", timestamp: env.clock.now().toISOString() });
  return { env: nextEnv, session: nextSession, outcome: { status: "executed", descriptions: [step.description] } };
}

export function redo(env: KernelEnvironment, session: ConversationSession): KernelStep {
  const step = redoHistory(env.history);
  if (!step) return fail(env, session, "There's nothing to redo.");
  const nextEnv: KernelEnvironment = { ...env, document: step.state.document, navigation: step.state.navigation, memory: step.state.memory, history: { ...env.history, pointer: step.pointer } };
  const nextSession = rememberResult(clearInFlight(session), { description: step.description, capabilityId: "system.redo", timestamp: env.clock.now().toISOString() });
  return { env: nextEnv, session: nextSession, outcome: { status: "executed", descriptions: [step.description] } };
}

export function whatChanged(env: KernelEnvironment, sinceTimestamp?: string): string[] {
  return describeChanges(env.history, sinceTimestamp);
}

/** Answers an open clarification using structured args an NLU/interpretation
 * layer already extracted from the reply (e.g. "8" -> { startMinutes: 480 }).
 * The kernel itself never parses that natural language. */
export function answerClarificationWithArgs(env: KernelEnvironment, session: ConversationSession, argsPatch: Record<string, unknown>): KernelStep {
  const clarification = session.pendingClarification;
  const plan = session.pendingPlan;
  if (!clarification || !plan) return fail(env, session, "There's nothing to clarify.");
  const step = plan.steps.find((candidate) => candidate.id === clarification.planStepId);
  if (!step) return fail(env, session, "That question no longer applies.");
  const patchedStep = { ...step, args: { ...step.args, ...argsPatch } };
  const patchedPlan: Plan = { ...plan, steps: plan.steps.map((candidate) => (candidate.id === step.id ? patchedStep : candidate)) };
  return continuePlan(env, { ...session, pendingClarification: undefined }, patchedPlan);
}

/** Answers an open clarification by picking one of its offered choices ("the first one" / a specific label). */
export function answerClarificationChoice(env: KernelEnvironment, session: ConversationSession, reply: string): KernelStep {
  const clarification = session.pendingClarification;
  if (!clarification) return fail(env, session, "There's nothing to clarify.");
  const match = matchClarificationReply(clarification, reply);
  if (match.kind === "unresolved") return fail(env, session, "I still didn't catch which one you mean.");
  return answerClarificationWithArgs(env, session, match.choice.args);
}

/** Classifies the small closed set of discourse markers ("yes"/"no"/"cancel"/
 * "undo"/"redo") and dispatches to the matching kernel action; anything else
 * is reported back to the caller as unresolved. A reply that doesn't match
 * that fixed vocabulary is also checked against the active proposal's own
 * offered alternatives (e.g. "8:30 works" picking the "8:30 PM" alternative)
 * before giving up — the proposal-side counterpart of clarification
 * fallback below. */
export function reply(env: KernelEnvironment, session: ConversationSession, text: string): KernelStep {
  const intent = classifyReply(text);
  if (session.pendingClarification && intent === "unknown") return answerClarificationChoice(env, session, text);
  if (session.activeProposal && session.activeProposal.status === "pending" && intent === "unknown") {
    const alternative = matchProposalAlternative(session.activeProposal, text);
    if (alternative) return chooseAlternative(env, session, alternative.label);
  }
  switch (intent) {
    case "approve":
      return approve(env, session);
    case "reject":
      return reject(env, session);
    case "cancel":
      return cancel(env, session);
    case "undo":
      return undo(env, session);
    case "redo":
      return redo(env, session);
    case "whatChanged":
      return { env, session: clearInFlight(session), outcome: { status: "executed", descriptions: whatChanged(env) } };
    case "unknown":
      return fail(env, session, `I didn't understand "${text}".`);
  }
}
