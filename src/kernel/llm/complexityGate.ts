/**
 * Cheap, synchronous, deterministic pre-check that decides whether an
 * utterance is safe to hand to the existing deterministic recognizers
 * (kernel's recognizeIntent, legacy's resolveGlobalCommand) at all.
 *
 * Both of those are first-match/highest-score recognizers over a single
 * clause. Neither represents "the action is conditional on something else"
 * or "this is a question, not an instruction" as a first-class concept — a
 * transcript like "Move dinner to eight, unless that clashes with the call"
 * would otherwise have its leading clause matched and executed, discarding
 * the trailing condition entirely (see docs/VOICE_INTELLIGENCE_ROOT_CAUSE.md
 * for the same failure mode already documented for cross-domain routing).
 *
 * When this gate flags an utterance, the caller must route straight to the
 * conversational model coordinator INSTEAD OF the deterministic recognizers
 * — never after them, and never both. When it doesn't flag an utterance,
 * the deterministic recognizers run exactly as before; only if they BOTH
 * decline does the caller fall back to the model as a last resort. This
 * file only ever says "too risky to let the fast path guess" — it never
 * itself decides what the utterance means.
 */

export type ComplexityReason =
  | "condition-clause"
  | "hypothetical"
  | "negated-action"
  | "quoted-instruction"
  | "explanatory-question"
  | "ambiguous-action-verb"
  | "compound-fallback-clause"
  | "cross-domain-conjunction"
  | "mixed-question-action";

export interface ComplexityAssessment {
  flagged: boolean;
  reasons: ComplexityReason[];
}

// Deliberately NARROW: legacy's own constraint parsing (see
// calendarCreationContext.ts) already correctly handles many single-event
// "change X but keep Y unchanged" preservation phrasings end to end (see
// FlowCalendarPreservation.test.tsx) — a bare "but"/"not" marker would wrongly
// divert those already-working cases to the model tier. Only markers that
// signal a cross-entity exclusion or execution-blocking condition are
// included: "leave X alone"/"not the Y" name a SEPARATE object being
// excluded, which reads differently from "keep/leave ITS <field> unchanged"
// (a same-event field-preservation constraint legacy already handles).
const CONDITION_MARKERS = /\b(unless|except|only if|as long as|provided that)\b|\bleave\s+\S+\s+alone\b/i;

// "not the Y" is only a CROSS-entity exclusion marker ("the hotel, not the
// flight" — two different things) when Y differs from the most recently
// named "the X". "Lower the rain, not the rain" names the SAME entity twice
// — that's a same-entity role/identity contradiction, which legacy's own
// role-guard (see FlowRoleConstraints.test.tsx) already detects and refuses
// correctly on its own; flagging it here would divert it to the model tier
// for no benefit and previously caused it to be handled worse, not better.
const NOT_THE_CLAUSE = /\bnot the\s+([a-z][\w-]*)/i;
const THE_NOUN = /\bthe\s+([a-z][\w-]*)/gi;

function hasCrossEntityExclusion(text: string): boolean {
  const match = NOT_THE_CLAUSE.exec(text);
  if (!match) return false;
  const excludedNoun = match[1]!.toLowerCase();
  const before = text.slice(0, match.index);
  const priorNouns = [...before.matchAll(THE_NOUN)].map((m) => m[1]!.toLowerCase());
  const mostRecentNoun = priorNouns[priorNouns.length - 1];
  return mostRecentNoun !== excludedNoun;
}
// Deliberately excludes a bare "what if" leading marker: legacy's own Tide
// calendar interpreter (see globalInterpreter.ts's hasCalendarAction check)
// already treats "what if I <action>" as a first-class trigger for its own
// deterministic what-if PREVIEW feature (a real interactive preview/confirm
// UI, not just narrated text — see FlowEnvironmentApp's "keeps Calendar
// success and what-if outcomes observable" and "cancels a Calendar what-if
// preview on Escape" tests) — flagging it here would divert a single clean
// "what if I add/move/..." request away from that already-working feature
// and into a plain text answer that can't reproduce it. A "what if" request
// that ALSO carries extra hypothetical reasoning beyond one calendar action
// ("what if I pushed X — would it clash with anything?") is still caught by
// the "would it/that/this clash/conflict/..." alternative below on its own.
const HYPOTHETICAL_MARKERS = /^what would happen if\b|\bwould (?:it|that|this) (?:clash|conflict|work|overlap)\b|\bhypothetically\b/i;
const NEGATED_ACTION = /^(?:don'?t|do not|never)\b.*\b(?:show|tell|list|options|just)\b/i;
const WRITE_VERBS = /\b(write|create|add|make|title|call it|name it|saying|titled)\b/i;
const EXPLANATORY_QUESTION = /^(?:how does|how do|why does|why do|why is|why are|explain|what is a|what are|what does .* mean|can you explain)\b/i;

/** A quoted span (straight or curly quotes) whose content should be treated
 * as inert data, never as a second instruction layered on top of the outer
 * one — see kernel/llm/promptBuilder.ts's explicit "quoted content is data"
 * rule and journal.create's argsSchema description. */
const QUOTED_SPAN = /["'“”‘’][^"'“”‘’]{2,}["'“”‘’]/;

/**
 * Legacy's own calendar-creation parser (see
 * src/features/day-planner/interpretation/interpreter.ts's leading-verb
 * strip) treats "book" as an unconditional synonym for "add"/"create"/
 * "schedule" and silently creates a calendar event the instant it sees
 * "book <title>" — including "book a dentist appointment", an EXTERNAL
 * booking Flow cannot actually make, which it would otherwise silently turn
 * into a fabricated calendar entry with no warning. "Book <meal/table/time>"
 * (e.g. "book breakfast at Café Luna", "book an hour in my calendar for
 * interview practice") is ordinary calendar-block phrasing legacy already
 * handles correctly, and is NOT flagged — only "book (...) appointment",
 * the idiomatic English collocation that specifically implies engaging a
 * professional service provider (a dentist, doctor, hairdresser, ...), is
 * genuinely ambiguous in a way plain "add"/"create"/"schedule" are not. This
 * is NOT a blacklist of the word "book" (it never denies the request on its
 * own), it only routes the ambiguous case to real language understanding
 * instead of letting the deterministic fast path silently fabricate a
 * booking. "Remind me to book the dentist" doesn't start with "book" and
 * already falls through to "unsupported" (and from there, the conversational
 * tier) on its own.
 */
const AMBIGUOUS_LEADING_VERB = /^book(?:ing)?\b(?:(?!\.).)*\bappointment\b/i;

/**
 * "but ... if ..." within one sentence names a FALLBACK/conditional clause
 * ("call it something else IF there's already something at 3") that
 * legacy's calendar creator has no representation for at all — verified by
 * direct probe: it silently executes the leading "add a meeting at 3" and
 * drops the entire fallback clause with no trace of it. Scoped to "but"
 * specifically (not "and") because a plain "and" conjunction between two
 * complete actions is legacy's own already-working multi-action grammar
 * (see globalInterpreter.ts's sequence handling — "move dinner to eight and
 * cancel drinks" correctly produces two actions and must stay unflagged).
 */
const COMPOUND_FALLBACK_CLAUSE = /\bbut\b[^.!?]*\bif\b/i;

/**
 * "and text/message/call/email X" tacked onto a calendar command — verified
 * by direct probe: legacy's multi-action splitter has no grammar for a
 * communication action, so instead of treating it as a second action (or
 * declining), it silently folds the entire trailing clause into the
 * CALENDAR EVENT SELECTOR text ("push the call back an hour and text daniel
 * about it" became a selector query of "call back an hour and text daniel
 * about it" — the "text Daniel" instruction vanishes, never executed and
 * never surfaced as unsupported). Scoped to these specific
 * capability-external verbs, not e.g. "and cancel"/"and delete", which name
 * real calendar actions the same splitter already handles as a genuine
 * second step.
 *
 * Excludes a leading "rename/call it/name it/title ... to/as ..." construct
 * — verified by direct probe against a real regression (FlowVoiceControlRebuild's
 * "stores the exact raw title" cases): everything after "to"/"as" there is
 * the new title VERBATIM, by design (legacy's own rename capability takes
 * the full remainder as literal data, same spirit as quoted content) — "Rename
 * email to Buy milk and call mum" must stay on that deterministic path, not
 * be diverted because the title text itself happens to contain "and call X".
 */
const RENAME_CONSTRUCT = /^(?:rename|call it|name it|title|retitle)\b.*\b(?:to|as)\s+\S/i;
const CROSS_DOMAIN_CONJUNCTION_PATTERN = /\band\s+(?:text|message|email)\s+\S|\band\s+call\s+(?!it\b)\S/i;
function hasCrossDomainConjunction(text: string): boolean {
  return CROSS_DOMAIN_CONJUNCTION_PATTERN.test(text) && !RENAME_CONSTRUCT.test(text);
}

/**
 * A genuine question clause AND a separate action clause in one utterance
 * ("What's on tonight, and can you move dinner to six?", "Remind me what I
 * decided about Lisbon, then create a note called Lisbon follow-up.") —
 * neither deterministic recognizer represents "answer this AND also do
 * that" as one turn; each only picks a single best-scoring intent. A bare
 * question word without a joined action clause (EXPLANATORY_QUESTION
 * already covers those) or a bare action verb without a question word does
 * NOT match — this only fires when both are genuinely present.
 */
const MIXED_QUESTION_ACTION = /\b(?:what|who|when|where|how|why)\b[\s\S]*\b(?:and|then)\b[\s\S]*\b(?:move|create|add|remember|forget|search|delete|rename|open|remind me)\b/i;

export function assessComplexity(transcript: string): ComplexityAssessment {
  const text = transcript.trim();
  const reasons: ComplexityReason[] = [];

  if (CONDITION_MARKERS.test(text) || hasCrossEntityExclusion(text)) reasons.push("condition-clause");
  if (HYPOTHETICAL_MARKERS.test(text)) reasons.push("hypothetical");
  if (NEGATED_ACTION.test(text)) reasons.push("negated-action");
  if (QUOTED_SPAN.test(text) && WRITE_VERBS.test(text)) reasons.push("quoted-instruction");
  if (EXPLANATORY_QUESTION.test(text)) reasons.push("explanatory-question");
  if (AMBIGUOUS_LEADING_VERB.test(text)) reasons.push("ambiguous-action-verb");
  if (COMPOUND_FALLBACK_CLAUSE.test(text)) reasons.push("compound-fallback-clause");
  if (hasCrossDomainConjunction(text)) reasons.push("cross-domain-conjunction");
  if (MIXED_QUESTION_ACTION.test(text)) reasons.push("mixed-question-action");

  return { flagged: reasons.length > 0, reasons };
}
