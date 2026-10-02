import { getRuntimeMode } from "../../app/runtimeMode";
import type { KernelEnvironment } from "../kernel";
import { submit } from "../kernel";
import { phaseFor, type KernelOutcome, type KernelPhase } from "../kernel";
import { messageFor, type KernelTurnResult } from "../productionBridge";
import { createClarification } from "../clarification";
import type { ConversationSession } from "../session";
import { describeCapabilitiesForModel, type CapabilityDescription } from "./capabilityModel";
import { buildSystemPrompt, buildUserPrompt, type PromptContext, type RecentTurn, type ReferentSummary } from "./promptBuilder";
import { MODEL_TURN_OUTPUT_SCHEMA } from "./outputSchema";
import { interpretTurn } from "./modelClient";
import { validateModelOutput, type ValidatedTurn } from "./validateModelOutput";
import { assessComplexity } from "./complexityGate";
import { needsVerification, runVerifier, parseVerifierOutput } from "./verifier";
import { DEFAULT_CONVERSATION_BUDGET, type ConversationBudget, type ConversationDeclineReason, type ConversationSource, type LookupRecord } from "./types";
import type { PlanStepInput } from "../planner";
import type { TurnAuthority } from "../turnAuthority";

export interface ConversationTurnResult extends KernelTurnResult {
  /** Free-form hosted model prose is displayed as untrusted detail, never spoken as application status. */
  hostedModelResponse?: boolean;
  sources: ConversationSource[];
  /** The first plan step's capability id, when this turn executed a model
   * plan — mirrors tryKernelBridge's own `recognized.steps[0]?.capabilityId`
   * so the caller can persist the mutation via the same
   * `persistKernelMutation` document diff every other kernel-recognized
   * command already uses. */
  primaryCapabilityId?: string;
  /** Set only when the turn produced nothing usable at all (model down,
   * every round rejected, deadline, or cancellation) — the caller should
   * fall through to whatever "I didn't understand"/"local model
   * unavailable" messaging it already shows for a fully unrecognized turn. */
  declineReason?: ConversationDeclineReason;
  /** Present only for kind "clarify" — the caller is expected to remember
   * this and feed it back as `activeClarificationQuestion` on the NEXT
   * conversation turn so a short reply ("after dinner") is interpreted in
   * context, mirroring the kernel's own pendingClarification/pendingPlan
   * pairing without reusing its plan-bound machinery (a model-issued
   * clarification isn't tied to one concrete plan step). */
  conversationalClarification?: { question: string; choices: string[] };
}

export interface ConversationTurnInput {
  rawTranscript: string;
  normalizedTranscript: string;
  env: KernelEnvironment;
  session: ConversationSession;
  recentTurns: RecentTurn[];
  referents: ReferentSummary[];
  activeClarificationQuestion?: string;
  activeProposalSummary?: string;
  budget?: ConversationBudget;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  /** Benchmark/dev override only — see modelClient.ts's InterpretTurnRequest.model. */
  model?: string;
  /** Benchmark/dev override only — forces a DIFFERENT allowlisted model for
   * the verifier round specifically (see verifier.ts), so a heterogeneous
   * cascade (e.g. a fast small interpreter + a slower/stronger verifier
   * used only on the bounded subset of complex turns) can be measured
   * without touching production, which never sets this. Falls back to
   * `model` when unset — the homogeneous same-model cascade already
   * benchmarked. Never used by any production call site. */
  verifierModel?: string;
  authority?: TurnAuthority;
  /** Production owns freshness, locking, execution and durable publication. */
  executePlan?: (steps: PlanStepInput[], context: { signal?: AbortSignal; authority?: TurnAuthority }) => Promise<KernelTurnResult> | KernelTurnResult;
}

/** Truthful, cause-specific decline text (see FINAL REPORT's physical-test
 * repair "A" — every prior message collapsed every failure into the same
 * generic "model isn't available," which told the user to try rephrasing
 * even when the real cause was an unpaired/unauthenticated companion or a
 * pure network failure that no rephrasing could ever fix). `modelResult.reason`
 * (see modelClient.ts's ModelCallOutcome) is the most specific signal
 * available at this boundary. */
function modelUnavailableMessage(reason: Exclude<Awaited<ReturnType<typeof interpretTurn>>, { ok: true }>["reason"]): string {
  if (getRuntimeMode() !== "local") return reason === "unauthorized" ? "Cloud access expired. Activate it again. Typed commands still work." : reason === "cancelled" ? "Cancelled." : "Cloud reasoning is unavailable. Typed commands still work.";
  switch (reason) {
    case "not-configured":
      return "Flow's desktop companion isn't paired yet — open Flow's companion settings and enter the token printed by `npm run companion:dev`.";
    case "offline":
      return "Flow's desktop companion isn't running — start it with `npm run companion:dev`.";
    case "unauthorized":
      return "Flow's desktop companion rejected the stored pairing token — re-pair it in Flow's companion settings.";
    case "unavailable":
    case "rejected":
    default:
      return "Flow's local reasoning model isn't responding — check that Ollama is running and the selected model is installed.";
  }
}

function declined(env: KernelEnvironment, session: ConversationSession, reason: ConversationDeclineReason, message: string): ConversationTurnResult {
  const outcome: KernelOutcome = { status: "error", message };
  return { env, session, outcome, phase: "listening", message, recognized: false, sources: [], declineReason: reason };
}

function answered(env: KernelEnvironment, session: ConversationSession, text: string, sources: ConversationSource[]): ConversationTurnResult {
  const outcome: KernelOutcome = { status: "executed", descriptions: [text] };
  return { env, session, outcome, phase: "done" as KernelPhase, message: text, recognized: true, sources, ...(getRuntimeMode() === "hosted" ? { hostedModelResponse: true } : {}) };
}

/** Serializes a VALIDATED (already capability-checked) interpreter output
 * for the verifier prompt — deliberately the sanitized version, not the
 * model's raw JSON, since that's exactly what would actually execute. */
function serializeForVerifier(validated: ValidatedTurn): string {
  switch (validated.kind) {
    case "answer":
      return JSON.stringify({ kind: "answer", text: validated.text });
    case "unavailable":
      return JSON.stringify({ kind: "unavailable", explanation: validated.explanation });
    case "plan":
      return JSON.stringify({ kind: "plan", steps: validated.steps.map((step) => ({ capabilityId: step.capabilityId, args: step.args })), summary: validated.summary, conditions: validated.conditions });
    default:
      return JSON.stringify(validated);
  }
}

/** A timeout revokes the underlying fetch as well as ending the UI wait. */
async function boundedModelCall(run: (signal: AbortSignal) => Promise<Awaited<ReturnType<typeof interpretTurn>>>, parent: AbortSignal | undefined, ms: number): Promise<Awaited<ReturnType<typeof interpretTurn>> | undefined> {
  const controller = new AbortController();
  let finish: () => void = () => {};
  const cancelled = new Promise<undefined>(resolve => { finish = () => resolve(undefined); });
  const abort = () => { controller.abort(); finish(); };
  parent?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, Math.max(0, ms));
  if (parent?.aborted) abort();
  try { return await Promise.race([controller.signal.aborted ? cancelled : run(controller.signal), cancelled]); }
  finally { clearTimeout(timer); parent?.removeEventListener("abort", abort); }
}

type VerifierRoundResult =
  | { kind: "accept" }
  | { kind: "clarify"; question: string }
  | { kind: "repaired"; validated: ValidatedTurn }
  | { kind: "cancelled" };

/** Hosted verification failure asks for clarification. Local mode retains its
 * existing policy of using the capability-validated original interpretation. */
async function runVerifierRound(
  input: ConversationTurnInput,
  capabilities: CapabilityDescription[],
  validated: ValidatedTurn,
  remainingMs: number,
  budget: ConversationBudget,
  todayDateKey: string,
): Promise<VerifierRoundResult> {
  const modelResult = await boundedModelCall(signal => runVerifier({ rawTranscript: input.rawTranscript, interpreterOutputJson: serializeForVerifier(validated), capabilities, signal, fetchImpl: input.fetchImpl, model: input.verifierModel ?? input.model }), input.signal, Math.min(remainingMs, budget.verifierRoundDeadlineMs));
  const failure: VerifierRoundResult = getRuntimeMode() === "hosted" ? { kind: "clarify", question: "Flow couldn't verify the complete request. Please ask for one clear change at a time. Nothing changed." } : { kind: "accept" };
  if (input.signal?.aborted) return { kind: "cancelled" };
  if (!modelResult || !modelResult.ok) return failure;

  const parsed = parseVerifierOutput(modelResult.response.content);
  if (parsed.verdict === "clarify" && parsed.clarifyQuestion) return { kind: "clarify", question: parsed.clarifyQuestion };
  if (parsed.verdict === "repair" && parsed.repairedFrameJson) {
    const revalidated = validateModelOutput({
      raw: parsed.repairedFrameJson,
      registry: input.env.registry,
      session: input.session,
      document: input.env.document,
      rawTranscript: input.rawTranscript,
      now: input.env.clock.now(),
      todayDateKey,
    });
    // The repair is exactly as untrusted as a fresh interpreter round — an
    // invalid repair follows the runtime-specific failure policy above.
    if (revalidated.kind !== "rejected") return { kind: "repaired", validated: revalidated };
  }
  return parsed.verdict === "accept" ? { kind: "accept" } : failure;
}

export async function runConversationTurn(input: ConversationTurnInput): Promise<ConversationTurnResult> {
  const budget = input.budget ?? DEFAULT_CONVERSATION_BUDGET;
  const capabilities = describeCapabilitiesForModel(input.env.registry);
  const systemPrompt = buildSystemPrompt(capabilities);
  const lookups: LookupRecord[] = [];
  const deadline = Date.now() + budget.turnDeadlineMs;
  const todayDateKey = input.env.document.calendar.dateKey;
  const highRiskCapabilityIds = new Set(capabilities.filter((c) => c.riskLevel === "high").map((c) => c.id));
  const complexityReasons = assessComplexity(input.rawTranscript).reasons;

  for (let round = 1; round <= budget.maxRounds; round += 1) {
    if (input.signal?.aborted) return declined(input.env, input.session, "cancelled", "Cancelled.");
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) return declined(input.env, input.session, "deadline", "That took too long to work out — try asking again.");

    const promptCtx: PromptContext = {
      rawTranscript: input.rawTranscript,
      normalizedTranscript: input.normalizedTranscript,
      todayDateKey,
      nowIso: input.env.clock.now().toISOString(),
      recentTurns: input.recentTurns,
      referents: input.referents,
      activeClarificationQuestion: input.activeClarificationQuestion,
      activeProposalSummary: input.activeProposalSummary,
      lookups,
      round,
      maxRounds: budget.maxRounds,
    };

    // Races the model call against the TURN's own remaining deadline (not
    // just the per-round one) so a slow round can't silently eat the whole
    // budget — a deadline decline is returned even if `interpretTurn` itself
    // never settles in time.
    const modelResult = await boundedModelCall(signal => interpretTurn({ system: systemPrompt, user: buildUserPrompt(promptCtx), schema: MODEL_TURN_OUTPUT_SCHEMA, hostedRequest: { version: 1, kind: "interpret", context: { ...promptCtx, recentTurns: promptCtx.recentTurns.slice(-4) } }, signal, fetchImpl: input.fetchImpl, model: input.model }), input.signal, Math.min(remainingMs, budget.roundDeadlineMs));
    if (input.signal?.aborted) return declined(input.env, input.session, "cancelled", "Cancelled.");
    if (!modelResult) return declined(input.env, input.session, "deadline", "That took too long to work out — try asking again.");

    if (!modelResult.ok) {
      const reason: ConversationDeclineReason = modelResult.reason === "cancelled" ? "cancelled" : "model-unavailable";
      return declined(input.env, input.session, reason, modelUnavailableMessage(modelResult.reason));
    }

    let validated = validateModelOutput({
      raw: modelResult.response.content,
      registry: input.env.registry,
      session: input.session,
      document: input.env.document,
      rawTranscript: input.rawTranscript,
      now: input.env.clock.now(),
      todayDateKey,
    });

    // Complex-path second pass (see verifier.ts's module doc): only for the
    // bounded subset of turns where a single model pass is demonstrably
    // unreliable — compound/conditional/negated/hypothetical phrasing, or
    // the interpretation itself being a batch/destructive plan. A plain
    // "Open Calendar." never pays this extra round.
    if ((validated.kind === "answer" || validated.kind === "unavailable" || validated.kind === "plan") && needsVerification({ complexityReasons, validated, highRiskCapabilityIds })) {
      const verifyRemainingMs = deadline - Date.now();
      if (verifyRemainingMs >= budget.minVerifierBudgetMs && !input.signal?.aborted) {
        const verifierResult = await runVerifierRound(input, capabilities, validated, verifyRemainingMs, budget, todayDateKey);
        if (verifierResult.kind === "cancelled") return declined(input.env, input.session, "cancelled", "Cancelled.");
        if (verifierResult.kind === "clarify") {
          const clarification = createClarification(verifierResult.question, "conversational", [], input.env.clock.now().toISOString());
          const outcome: KernelOutcome = { status: "clarify", clarification };
          const result: ConversationTurnResult = { env: input.env, session: input.session, outcome, phase: "needs-clarification", message: verifierResult.question, recognized: true, sources: [] };
          result.conversationalClarification = { question: verifierResult.question, choices: [] };
          return result;
        }
        if (verifierResult.kind === "repaired") validated = verifierResult.validated;
        // "accept": fall through with the original validated unchanged.
      } else if (getRuntimeMode() === "hosted") {
        const question = "Flow couldn't verify the complete request in time. Please ask for one clear change. Nothing changed.";
        const clarification = createClarification(question, "conversational", [], input.env.clock.now().toISOString());
        return { env: input.env, session: input.session, outcome: { status: "clarify", clarification }, phase: "needs-clarification", message: question, recognized: true, sources: [], conversationalClarification: { question, choices: [] } };
      }
    }

    switch (validated.kind) {
      case "rejected":
        if (round >= budget.maxRounds) return declined(input.env, input.session, "invalid-output", "Flow couldn't work out a safe interpretation of that.");
        continue;

      case "answer":
        return answered(input.env, input.session, validated.text, validated.sources.map((label) => ({ label })));

      case "unavailable":
        return answered(input.env, input.session, validated.explanation, []);

      case "clarify": {
        // Not bound to a concrete plan step (the model may not have picked a
        // capability yet) — "conversational" is a marker id, never looked up
        // as a real plan step. Follow-up is handled by the caller re-running
        // a fresh conversation turn with `activeClarificationQuestion` set
        // (see ConversationTurnResult.conversationalClarification's doc),
        // not by the kernel's plan-bound answerClarification* functions.
        const clarification = createClarification(
          validated.question,
          "conversational",
          validated.choices.map((label, index) => ({ id: `choice-${index}`, label, args: {} })),
          input.env.clock.now().toISOString(),
        );
        const outcome: KernelOutcome = { status: "clarify", clarification };
        const result: ConversationTurnResult = { env: input.env, session: input.session, outcome, phase: "needs-clarification", message: validated.question, recognized: true, sources: [] };
        result.conversationalClarification = { question: validated.question, choices: validated.choices };
        return result;
      }

      case "lookup": {
        // The final round must produce a real decision (answer/plan/clarify/
        // unavailable) — a "lookup" here would silently burn the whole turn
        // down to a bare round-limit decline with nothing to show for
        // whatever was already looked up. Force it to decide NOW with
        // whatever it already has, same as the "final round" prompt text
        // already tells it to.
        if (round >= budget.maxRounds) return declined(input.env, input.session, "round-limit", "Flow couldn't settle on an answer in time.");

        // A 2B model will sometimes repeat an IDENTICAL lookup instead of
        // using the result it already has (see FINAL REPORT's round-limit
        // failure cluster — this was observed burning all 3 rounds on the
        // exact same friends.lookup/journal.search call). Don't re-execute
        // it — that's wasted latency for a result we already have — and
        // feed back an explicit correction instead of the same result, so
        // the next round has real pressure to move on rather than repeat
        // the mistake a third time.
        const duplicate = lookups.find((prior) => prior.capabilityId === validated.capabilityId && JSON.stringify(prior.args) === JSON.stringify(validated.args));
        if (duplicate) {
          lookups.push({ capabilityId: validated.capabilityId, args: validated.args, resultSummary: "(repeated — you already have this result above. Do not look it up again: respond with answer/plan/clarify/unavailable now.)" });
          continue;
        }

        const capability = input.env.registry.get(validated.capabilityId);
        if (!capability) return declined(input.env, input.session, "invalid-output", "Flow couldn't work out a safe interpretation of that.");
        const ctx = { document: input.env.document, navigation: input.env.navigation, memory: input.env.memory, history: input.env.history.entries, historyPointer: input.env.history.pointer, clock: input.env.clock };
        const invalidReason = capability.validate(validated.args, ctx);
        const result = invalidReason ? { status: "error" as const, message: invalidReason } : capability.execute(validated.args, ctx);
        lookups.push({
          capabilityId: validated.capabilityId,
          args: validated.args,
          resultSummary: result.status === "ok" ? result.description : result.message,
        });
        continue;
      }

      case "plan": {
        if (validated.steps.length > budget.maxPlanSteps) {
          return declined(input.env, input.session, "plan-rejected", `That would take more than ${budget.maxPlanSteps} steps — try breaking it up.`);
        }
        if (input.signal?.aborted) return declined(input.env, input.session, "cancelled", "Cancelled.");
        if (getRuntimeMode() === "hosted" && validated.steps.length > 1 && validated.steps.some(step => input.env.registry.get(step.capabilityId)?.mutates)) {
          return declined(input.env, input.session, "plan-rejected", "Please ask for each change separately so you can review it. Nothing changed.");
        }
        if (input.executePlan) {
          const result = await input.executePlan(validated.steps, { signal: input.signal, authority: input.authority });
          return { ...result, sources: [], primaryCapabilityId: validated.steps[0]?.capabilityId };
        }
        const step = submit({ ...input.env, requireMutationReview: getRuntimeMode() === "hosted" }, input.session, input.rawTranscript, validated.steps);
        return { env: step.env, session: step.session, outcome: step.outcome, phase: phaseFor(step.outcome), message: messageFor(step.outcome), recognized: true, sources: [], primaryCapabilityId: validated.steps[0]?.capabilityId };
      }
    }
  }

  return declined(input.env, input.session, "round-limit", "Flow couldn't settle on an answer in time.");
}
