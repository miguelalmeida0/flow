/**
 * Semantic verifier — the "complex path" second pass (see FINAL REPORT
 * §4's cascade). The interpreter (promptBuilder.ts/conversationCoordinator.ts)
 * already produces a structured, capability-validated response; this module
 * exists for the narrow class of utterances where a SINGLE model pass is
 * demonstrably unreliable — compound clauses, conditions/exclusions,
 * negation, self-correction, hypotheticals, multiple entities, unresolved
 * pronouns, destructive/batch actions (see `needsVerification`). It asks a
 * SEPARATE model call one question: does the interpreter's own proposed
 * response actually represent the ENTIRE user utterance, or did it
 * silently drop a clause, invent an assumption, or substitute a different
 * goal?
 *
 * The verifier is NOT a second executor and cannot authorize anything on
 * its own:
 *   - "accept": proceed with the interpreter's original output, unchanged.
 *   - "clarify": the turn becomes a clarification, using the verifier's
 *     own question (a genuine disagreement is surfaced to the user, never
 *     silently resolved by guessing).
 *   - "repair": the verifier's `repairedFrame` replaces the interpreter's
 *     output — but it is fed straight back through validateModelOutput.ts,
 *     the SAME capability-allowlist / entity-existence / condition-
 *     violation checks any interpreter round already goes through. A
 *     repaired frame is exactly as untrusted as a fresh interpreter round;
 *     it is never given a shortcut past that boundary.
 *
 * This is one extra model round for a bounded subset of turns, not a
 * standing second architecture layer: `needsVerification` decides per-turn
 * whether the extra latency is worth it, and simple turns ("Open
 * Calendar.") never pay it.
 */
import type { ComplexityReason } from "./complexityGate";
import type { CapabilityDescription } from "./capabilityModel";
import { renderCapabilitiesForPrompt } from "./capabilityModel";
import type { ValidatedTurn } from "./validateModelOutput";
import { interpretTurn, type ModelCallOutcome } from "./modelClient";
import { VERIFIER_OUTPUT_SCHEMA } from "./verifierSchema";

/** High-stakes complexity reasons where a single pass is demonstrably
 * unreliable enough to justify a second model round. Deliberately
 * excludes "explanatory-question" and "ambiguous-action-verb" alone — a
 * plain "how does X work" or a bare "book...appointment" case doesn't need
 * a second opinion once the interpreter already resolved it to "answer" /
 * "unavailable". */
const HIGH_STAKES_REASONS = new Set<ComplexityReason>(["condition-clause", "hypothetical", "negated-action", "compound-fallback-clause", "cross-domain-conjunction"]);

export interface VerificationDecisionInput {
  complexityReasons: ComplexityReason[];
  validated: ValidatedTurn;
  highRiskCapabilityIds: ReadonlySet<string>;
}

/**
 * Decides whether THIS turn's interpretation is worth a second, verifying
 * model round. Two independent triggers:
 *   1. The utterance itself was already flagged complex for one of the
 *      HIGH_STAKES_REASONS (compound/conditional/negated/hypothetical
 *      language — the classes most likely to have a silently-dropped
 *      clause).
 *   2. The interpreter's OWN output is high-stakes regardless of how the
 *      utterance was phrased: a batch action (>1 plan step) or a
 *      destructive one (any step naming a "high" riskLevel capability).
 * A plain "answer"/"lookup"/"unavailable" with no batch/destructive step
 * and no high-stakes phrasing is NOT re-verified — that's the fast path.
 */
export function needsVerification(input: VerificationDecisionInput): boolean {
  if (input.complexityReasons.some((reason) => HIGH_STAKES_REASONS.has(reason))) return true;
  if (input.validated.kind === "plan") {
    if (input.validated.steps.length > 1) return true;
    if (input.validated.steps.some((step) => input.highRiskCapabilityIds.has(step.capabilityId))) return true;
  }
  return false;
}

const VERIFIER_SYSTEM_PROMPT_HEADER = `You are Flow's semantic verifier. Another model (the interpreter) already turned a user's request into a structured response. Your ONLY job is to check whether that response actually represents the user's COMPLETE request — you do not execute anything, you only judge and optionally repair the interpretation.

Check specifically:
1. Did the interpretation preserve the user's WHOLE goal, or only part of it (e.g. executed the first clause and dropped a trailing "unless"/"but"/exception)?
2. Were ALL stated conditions/exclusions preserved in the plan (not just mentioned and then ignored)?
3. Was negation respected (nothing executed that the user said NOT to do)?
4. If the user self-corrected mid-utterance, did the interpretation use the FINAL corrected value, not the discarded one?
5. If the request was hypothetical ("what if...") or explicitly said not to change anything, is the interpretation read-only (kind "answer" or "clarify"), never a "plan" that would mutate?
6. Are all referenced entities ("it"/"that"/"the other one"/a name) actually grounded to something real, not guessed?
7. Is the outcome the interpretation proposes actually something Flow's capabilities can do — did it silently substitute an available action for one the user actually asked for (e.g. quietly created a calendar event when the user asked for something Flow can't do)?
8. Did the interpreter invent an assumption the transcript doesn't support?

Respond with exactly one JSON object, one of:
- {"verdict":"accept"} — the interpretation is correct and complete as-is.
- {"verdict":"clarify","clarifyQuestion":"..."} — the interpretation is materially wrong or incomplete AND you cannot safely fix it yourself; ask ONE concise question.
- {"verdict":"repair","repairedFrame":{...}} — you can confidently produce the CORRECT structured response yourself (same shape as the interpreter's own response format), fully accounting for every clause/condition/negation/correction in the transcript.

Always fill missingConstraints/contradictions/unsupportedAssumptions/referentProblems/temporalProblems (empty arrays when none) explaining WHY you reached your verdict — this is checked, not decorative.

Never mark "accept" merely because the JSON is well-formed; judge whether it means what the user actually said.`;

export interface VerifierPromptContext {
  rawTranscript: string;
  interpreterOutputJson: string;
  capabilities: CapabilityDescription[];
}

export function buildVerifierSystemPrompt(capabilities: CapabilityDescription[]): string {
  return `${VERIFIER_SYSTEM_PROMPT_HEADER}\n\nCAPABILITIES (same registry the interpreter used):\n${renderCapabilitiesForPrompt(capabilities)}`;
}

export function buildVerifierUserPrompt(ctx: VerifierPromptContext): string {
  return [
    `USER'S RAW TRANSCRIPT (exact words): ${ctx.rawTranscript}`,
    `INTERPRETER'S PROPOSED RESPONSE (JSON): ${ctx.interpreterOutputJson}`,
    "Judge this response against the transcript now. Respond with exactly one JSON object.",
  ].join("\n\n");
}

export interface RunVerifierInput {
  rawTranscript: string;
  interpreterOutputJson: string;
  capabilities: CapabilityDescription[];
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  model?: string;
}

export async function runVerifier(input: RunVerifierInput): Promise<ModelCallOutcome> {
  return interpretTurn({
    system: buildVerifierSystemPrompt(input.capabilities),
    user: buildVerifierUserPrompt({ rawTranscript: input.rawTranscript, interpreterOutputJson: input.interpreterOutputJson, capabilities: input.capabilities }),
    schema: VERIFIER_OUTPUT_SCHEMA,
    signal: input.signal,
    fetchImpl: input.fetchImpl,
    model: input.model,
  });
}

const MAX_ISSUE_LIST_LENGTH = 6;
const MAX_ISSUE_TEXT_LENGTH = 300;

export interface ParsedVerifierOutput {
  verdict: "accept" | "repair" | "clarify" | "unusable";
  clarifyQuestion?: string;
  /** Present only for verdict "repair" — the RAW JSON string of the
   * repaired frame, meant to be fed straight into validateModelOutput()
   * exactly like a fresh interpreter round's raw output. Never trusted or
   * executed directly by this module. */
  repairedFrameJson?: string;
  missingConstraints: string[];
  contradictions: string[];
  unsupportedAssumptions: string[];
  referentProblems: string[];
  temporalProblems: string[];
}

function boundedStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").slice(0, MAX_ISSUE_LIST_LENGTH).map((item) => item.slice(0, MAX_ISSUE_TEXT_LENGTH));
}

/** Parses the verifier's raw JSON defensively — this is exactly as
 * untrusted as the interpreter's own raw output (see validateModelOutput.ts's
 * module doc for why "valid JSON" is never treated as "correct"). Never
 * throws. */
export function parseVerifierOutput(raw: string): ParsedVerifierOutput {
  const empty = { missingConstraints: [], contradictions: [], unsupportedAssumptions: [], referentProblems: [], temporalProblems: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { verdict: "unusable", ...empty };
  }
  if (typeof parsed !== "object" || parsed === null) return { verdict: "unusable", ...empty };
  const obj = parsed as Record<string, unknown>;
  const issues = {
    missingConstraints: boundedStringArray(obj.missingConstraints),
    contradictions: boundedStringArray(obj.contradictions),
    unsupportedAssumptions: boundedStringArray(obj.unsupportedAssumptions),
    referentProblems: boundedStringArray(obj.referentProblems),
    temporalProblems: boundedStringArray(obj.temporalProblems),
  };

  if (obj.verdict === "accept") return { verdict: "accept", ...issues };

  if (obj.verdict === "clarify") {
    const question = typeof obj.clarifyQuestion === "string" && obj.clarifyQuestion.trim().length > 0 ? obj.clarifyQuestion.trim().slice(0, MAX_ISSUE_TEXT_LENGTH) : undefined;
    if (!question) return { verdict: "unusable", ...issues }; // claimed clarify but gave nothing to ask
    return { verdict: "clarify", clarifyQuestion: question, ...issues };
  }

  if (obj.verdict === "repair") {
    if (typeof obj.repairedFrame !== "object" || obj.repairedFrame === null) return { verdict: "unusable", ...issues };
    let repairedFrameJson: string;
    try {
      repairedFrameJson = JSON.stringify(obj.repairedFrame);
    } catch {
      return { verdict: "unusable", ...issues };
    }
    return { verdict: "repair", repairedFrameJson, ...issues };
  }

  return { verdict: "unusable", ...issues };
}
