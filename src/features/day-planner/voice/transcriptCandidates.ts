import type {
  CalendarAction,
  CalendarRequest,
  DayPlan,
  EventSelector,
} from "../model";
import { parseIntent } from "../interpretation/intent";
import { interpretTranscript } from "../interpretation/interpreter";
import { normalizeTranscript } from "../interpretation/normalize";
import { parseSourceEventReference } from "../interpretation/references";
import {
  parseClockExpression,
  parseDateExpression,
  parseDurationExpression,
  parseStandaloneClockExpression,
} from "../interpretation/temporal";
import { resolveEventReference } from "../scheduling/resolution";
import { parsePlannerPresentation } from "../../../shared/command/presentationCapability";

export interface TranscriptCandidate {
  transcript: string;
  confidence?: number;
  browserIndex?: number;
  finalSegments?: string[];
  alternativeIndices?: number[];
}

export interface TranscriptSelectionContext {
  plan: DayPlan;
  selectedId?: string;
  pendingDestination?: boolean;
}

export interface CandidateAnalysis {
  candidate: TranscriptCandidate;
  semanticTier: 0 | 1 | 2 | 3;
  routeToPlanner: boolean;
  reason: string;
  interpretation: ReturnType<typeof interpretTranscript>;
}

interface AlternativeLike { transcript: string; confidence?: number }
export interface ResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: AlternativeLike;
}

interface Beam {
  parts: string[];
  confidenceTotal: number;
  confidenceCount: number;
  path: number[];
}

// A non-continuous calendar command almost always produces one final segment.
// This still exhaustively covers up to six five-alternative segments while
// putting a firm memory bound on malformed or nonstandard browser events.
export const MAX_TRANSCRIPT_COMBINATIONS = 15_625;

function averageConfidence(beam: Beam) {
  return beam.confidenceCount ? beam.confidenceTotal / beam.confidenceCount : undefined;
}

/** Enumerates full-transcript combinations before any semantic ranking occurs. */
export function collectTranscriptCandidates(results: ArrayLike<ResultLike>, maxAlternatives = 5): TranscriptCandidate[] {
  const segments: AlternativeLike[][] = [];
  for (let resultIndex = 0; resultIndex < results.length; resultIndex += 1) {
    const result = results[resultIndex];
    if (!result?.isFinal) continue;
    const alternatives: AlternativeLike[] = [];
    for (let index = 0; index < Math.min(result.length, maxAlternatives); index += 1) {
      const alternative = result[index];
      const transcript = alternative?.transcript.trim();
      if (transcript) alternatives.push({ transcript, confidence: alternative?.confidence });
    }
    if (alternatives.length) segments.push(alternatives);
  }
  if (!segments.length) return [];

  let beams: Beam[] = [{ parts: [], confidenceTotal: 0, confidenceCount: 0, path: [] }];
  for (const segment of segments) {
    const combinations: Beam[] = [];
    for (const beam of beams) {
      for (let alternativeIndex = 0; alternativeIndex < segment.length; alternativeIndex += 1) {
        const alternative = segment[alternativeIndex]!;
        combinations.push({
          parts: [...beam.parts, alternative.transcript],
          confidenceTotal: beam.confidenceTotal + (alternative.confidence ?? 0),
          confidenceCount: beam.confidenceCount + (alternative.confidence === undefined ? 0 : 1),
          path: [...beam.path, alternativeIndex],
        });
        if (combinations.length >= MAX_TRANSCRIPT_COMBINATIONS) break;
      }
      if (combinations.length >= MAX_TRANSCRIPT_COMBINATIONS) break;
    }
    beams = combinations;
  }

  const deduped = new Map<string, TranscriptCandidate>();
  for (const beam of beams) {
    const transcript = beam.parts.join(" ").replace(/\s+/g, " ").trim();
    const key = normalizeTranscript(transcript);
    if (!key) continue;
    const confidence = averageConfidence(beam);
    const candidate: TranscriptCandidate = {
      transcript,
      ...(confidence === undefined ? {} : { confidence }),
      browserIndex: beam.path.reduce((value, part) => value * maxAlternatives + part, 0),
      finalSegments: [...beam.parts], alternativeIndices: [...beam.path],
    };
    const existing = deduped.get(key);
    const candidateConfidence = candidate.confidence ?? -1;
    const existingConfidence = existing?.confidence ?? -1;
    if (!existing
      || candidateConfidence > existingConfidence
      || (candidateConfidence === existingConfidence
        && (candidate.browserIndex ?? 0) < (existing.browserIndex ?? 0))) {
      deduped.set(key, candidate);
    }
  }
  return [...deduped.values()].sort((left, right) => (left.browserIndex ?? 0) - (right.browserIndex ?? 0));
}

function selectorsInRequest(request: CalendarRequest) {
  const selectors: EventSelector[] = request.constraints.map((constraint) => constraint.selector);
  for (const action of request.actions) {
    if ("selector" in action) selectors.push(action.selector);
    if ((action.type === "move" || action.type === "create" || action.type === "fit" || action.type === "createBreathingRoom")
      && action.destination.type === "relative") selectors.push(action.destination.anchor);
  }
  return selectors;
}

function referencesAreMeaningful(request: CalendarRequest, context: TranscriptSelectionContext) {
  return selectorsInRequest(request).every((selector) =>
    resolveEventReference(context.plan, selector, context.selectedId).status !== "missing");
}

function incompleteSelector(text: string, action: ReturnType<typeof parseIntent>) {
  if (!["move", "shift", "resize", "protect", "unprotect", "defer", "delete"].includes(action)) return null;
  const withoutVerb = text.replace(/^(?:move|shift|push|reschedule|put|change|make|shorten|extend|reduce|protect|lock|fix|unlock|unprotect|release|defer|delete|cancel|remove)\s+/, "");
  const subject = withoutVerb
    .split(/\b(?:to|at|before|after|by|later|earlier|tomorrow|on (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/)[0]
    ?.replace(/\s+(?:flexible|fixed)$/, "")
    .trim();
  return subject ? parseSourceEventReference(subject) : null;
}

function hasTemporalMeaning(text: string, action: ReturnType<typeof parseIntent>, today: string) {
  if (action === "move") {
    const explicitDestination = /^change\b/.test(text)
      ? text.match(/\bto\s+(.+)$/)?.[1]
      : text.match(/\b(?:to|at)\s+(.+)$/)?.[1];
    return (explicitDestination ? parseClockExpression(explicitDestination).status === "found" : false)
      || Boolean(parseDateExpression(text, today))
      || /\b(?:before|after|next free|another time|different time|another slot|different slot|somewhere else)\b/.test(text);
  }
  if (action === "shift" || action === "resize" || action === "recover") {
    return parseDurationExpression(text) !== null;
  }
  if (action === "defer") return Boolean(parseDateExpression(text, today)) || /^defer\b/.test(text);
  return ["protect", "unprotect", "delete", "global"].includes(action);
}

function analyzeCandidate(candidate: TranscriptCandidate, context: TranscriptSelectionContext): CandidateAnalysis {
  const interpretation = interpretTranscript(candidate.transcript, context.plan.dateKey);
  const normalized = normalizeTranscript(candidate.transcript);
  if (parsePlannerPresentation(candidate.transcript)) return { candidate, semanticTier: 3, routeToPlanner: true, reason: "registered standalone presentation control", interpretation };
  if (context.pendingDestination && parseStandaloneClockExpression(normalized).status === "found") {
    return { candidate, semanticTier: 3, routeToPlanner: true, reason: "valid pending destination time", interpretation };
  }
  if (interpretation.status === "ready") {
    if (referencesAreMeaningful(interpretation.request, context)) {
      return { candidate, semanticTier: 3, routeToPlanner: true, reason: "complete calendar request", interpretation };
    }
    return { candidate, semanticTier: 2, routeToPlanner: true, reason: "well-formed request with a missing event", interpretation };
  }

  const intent = parseIntent(normalized);
  const selector = incompleteSelector(normalized, intent);
  const reference = selector ? resolveEventReference(context.plan, selector, context.selectedId) : null;
  const needsReference = ["move", "shift", "resize", "protect", "unprotect", "defer", "delete"].includes(intent);
  const validReference = needsReference ? Boolean(reference && reference.status !== "missing") : intent !== "unknown";
  if (!validReference) {
    return { candidate, semanticTier: 0, routeToPlanner: false, reason: "no usable event reference", interpretation };
  }
  if (hasTemporalMeaning(normalized, intent, context.plan.dateKey)) {
    return { candidate, semanticTier: 2, routeToPlanner: false, reason: "calendar intent, event, and time detected", interpretation };
  }
  return { candidate, semanticTier: 1, routeToPlanner: false, reason: "calendar intent and event detected", interpretation };
}

function confidence(candidate: TranscriptCandidate) {
  return Number.isFinite(candidate.confidence) ? candidate.confidence! : -1;
}

function semanticSpecificity(analysis: CandidateAnalysis) {
  if (analysis.interpretation.status !== "ready") return analysis.semanticTier;
  const unresolved = analysis.interpretation.request.actions.some((action) =>
    action.type === "move" && action.destination.type === "unresolved");
  if (!unresolved) {
    // A named day without a clock is valid, but supplies less destination
    // evidence than an explicit time when native alternatives compete.
    const dateOnly = analysis.interpretation.request.actions.every((action) =>
      action.type === "defer" && action.atMinutes === undefined && action.part === undefined);
    return dateOnly ? 2 : 3;
  }
  return /\b(?:another|different|new)\s+(?:time|slot)\b|\bsomewhere else\b/.test(
    normalizeTranscript(analysis.candidate.transcript),
  ) ? 2 : 1;
}

export function selectBestTranscriptCandidate(
  candidates: TranscriptCandidate[],
  context: TranscriptSelectionContext,
): CandidateAnalysis | undefined {
  return candidates.map((candidate, index) => analyzeCandidate(
    { ...candidate, browserIndex: candidate.browserIndex ?? index },
    context,
  )).sort((left, right) =>
    right.semanticTier - left.semanticTier
    || semanticSpecificity(right) - semanticSpecificity(left)
    || confidence(right.candidate) - confidence(left.candidate)
    || (left.candidate.browserIndex ?? 0) - (right.candidate.browserIndex ?? 0))[0];
}

const commonEnglish = new Set([
  "a", "add", "after", "and", "at", "before", "calendar", "cancel", "day", "dinner", "email",
  "event", "fixed", "for", "hour", "i", "interview", "less", "make", "meeting", "minutes", "move",
  "my", "protect", "redo", "schedule", "shift", "stressful", "the", "to", "tomorrow", "undo", "workout",
  "important", "critical", "red", "blue", "green", "label", "rename", "buffer", "breathing", "room",
  "split", "merge", "combine", "complete", "finished", "reopen", "preview", "tide", "rebalance",
]);

export function looksLikeIntelligibleEnglish(transcript: string) {
  const words = normalizeTranscript(transcript).split(/\s+/).filter(Boolean);
  return words.length >= 2 && words.some((word) => commonEnglish.has(word));
}

export function actionTypes(analysis: CandidateAnalysis) {
  if (analysis.interpretation.status !== "ready") return [];
  return analysis.interpretation.request.actions.map((action: CalendarAction) => action.type);
}
