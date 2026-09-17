import type { SpaceId } from "./life-state.reference";

export type TranscriptCandidate = {
  transcript: string;
  confidence?: number;
};

export type RoutedIntent =
  | { type: "system"; command: "pause" | "resume" | "undo" | "redo" }
  | { type: "navigate"; destination: SpaceId }
  | { type: "clarification-response"; value: string }
  | { type: "confirmation-response"; accepted: boolean }
  | { type: "contextual-follow-up"; text: string; entityId: string }
  | { type: "domain-command"; domain: "calendar" | "capture" | "outcome" | "commitment"; text: string }
  | { type: "life-statement"; text: string }
  | { type: "explicit-capture"; text: string }
  | { type: "unsupported"; transcript: string };

export function routeTranscript(
  transcript: string,
  context: {
    currentSpace: SpaceId;
    lastReferencedEntityId?: string;
    hasPendingClarification: boolean;
    hasPendingConfirmation: boolean;
  },
): RoutedIntent {
  // Reference shape only. Implement using small pure classifiers.
  throw new Error("Reference only");
}

export function selectBestCandidate(
  candidates: TranscriptCandidate[],
  score: (candidate: string) => number,
): TranscriptCandidate | undefined {
  return candidates
    .map((candidate, index) => ({ candidate, index, score: score(candidate.transcript) }))
    .sort((left, right) =>
      right.score - left.score ||
      (right.candidate.confidence ?? 0) - (left.candidate.confidence ?? 0) ||
      left.index - right.index,
    )[0]?.candidate;
}
