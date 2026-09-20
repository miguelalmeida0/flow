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

export interface ConversationTurnResult extends KernelTurnResult {
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
}

/** Truthful, cause-specific decline text (see FINAL REPORT's physical-test
 * repair "A" — every prior message collapsed every failure into the same
 * generic "model isn't available," which told the user to try rephrasing
 * even when the real cause was an unpaired/unauthenticated companion or a
 * pure network failure that no rephrasing could ever fix). `modelResult.reason`
 * (see modelClient.ts's ModelCallOutcome) is the most specific signal
 * available at this boundary. */
function modelUnavailableMessage(reason: Exclude<Awaited<ReturnType<typeof interpretTurn>>, { ok: true }>["reason"]): string {
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
  return { env, session, outcome, phase: "done" as KernelPhase, message: text, recognized: true, sources };
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

type VerifierRoundResult =
  | { kind: "accept" }
  | { kind: "clarify"; question: string }
  | { kind: "repaired"; validated: ValidatedTurn }
  | { kind: "cancelled" };

/** Runs the "complex path" second pass (see verifier.ts's module doc) for
 * ONE already-validated interpreter result. Fails open to "accept" (use
 * the interpreter's own result unchanged) on any verifier-side problem —
 * a model-unavailable verifier, a timeout, or unparseable verifier JSON
 * never turns an already-good, already-validated interpretation into a
 * decline; the verifier can only make things MORE cautious (clarify) or
 * MORE correct (a re-validated repair), never less safe. */
async function runVerifierRound(
  input: ConversationTurnInput,
  capabilities: CapabilityDescription[],
  validated: ValidatedTurn,
  remainingMs: number,
  budget: ConversationBudget,
  todayDateKey: string,
): Promise<VerifierRoundResult> {
  let timedOut = false;
  const timeout = new Promise<"timeout">((resolve) => {
    setTimeout(() => {
      timedOut = true;
      resolve("timeout");
    }, Math.min(remainingMs, budget.verifierRoundDeadlineMs));
  });
  const modelResult = await Promise.race([
    runVerifier({ rawTranscript: input.rawTranscript, interpreterOutputJson: serializeForVerifier(validated), capabilities, signal: input.signal, fetchImpl: input.fetchImpl, model: input.verifierModel ?? input.model }),
    timeout,
  ]);
  if (input.signal?.aborted) return { kind: "cancelled" };
  if (timedOut || modelResult === "timeout" || !modelResult.ok) return { kind: "accept" };

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
    // invalid repair (invented capability, invented entity, an exclusion
    // it itself now violates) is rejected the same way and we fail open to
    // the ORIGINAL (already-valid) interpretation rather than the broken repair.
    if (revalidated.kind !== "rejected") return { kind: "repaired", validated: revalidated };
  }
  return { kind: "accept" };
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
    let timedOut = false;
    const timeout = new Promise<never>((resolve) => {
      setTimeout(() => {
        timedOut = true;
        resolve(undefined as never);
      }, Math.min(remainingMs, budget.roundDeadlineMs));
    });
    const modelResult = await Promise.race([
      interpretTurn({ system: systemPrompt, user: buildUserPrompt(promptCtx), schema: MODEL_TURN_OUTPUT_SCHEMA, signal: input.signal, fetchImpl: input.fetchImpl, model: input.model }),
      timeout,
    ]);
    if (timedOut || modelResult === undefined) return declined(input.env, input.session, "deadline", "That took too long to work out — try asking again.");

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
        // "accept": fall through with the original `validated` unchanged.
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
        const step = submit(input.env, input.session, input.rawTranscript, validated.steps);
        return { env: step.env, session: step.session, outcome: step.outcome, phase: phaseFor(step.outcome), message: messageFor(step.outcome), recognized: true, sources: [], primaryCapabilityId: validated.steps[0]?.capabilityId };
      }
    }
  }

  return declined(input.env, input.session, "round-limit", "Flow couldn't settle on an answer in time.");
}
