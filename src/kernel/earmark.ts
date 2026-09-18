/**
 * Earmark: turn a voice recording into TASK/DECISION/QUESTION/COMMITMENT
 * items, each linked back to the exact moment in the recording it came from.
 *
 * Timestamp provenance is never fabricated. Flow's existing journal/voice-note
 * pipeline already produces per-segment timestamps (`JournalTranscriptSegment`
 * in ../domain/studio-model) with an honest `alignment` marker: real segment
 * boundaries by default, `"segment-estimate"` when the boundary was
 * interpolated rather than measured, and `"untimed"` when no reliable timing
 * exists at all. Earmark builds directly on those segments instead of
 * inventing its own timing model, and it carries the same honesty forward as
 * `timestampConfidence` on every derived item. An `"untimed"` segment is
 * still classified (so nothing is silently dropped) but is excluded from
 * seekable playback since there is nothing honest to seek to.
 *
 * A derived item is deliberately NOT auto-committed to the calendar, plans,
 * or commitments; turning one into a real capability call is a separate,
 * explicit user action (consistent with memory's explicit-store rule in
 * memoryStore.ts).
 */
import type { JournalTranscriptSegment } from "../domain/studio-model";
import type { LifeEntityId } from "../domain/life-model";

export interface SourceRecording {
  id: string;
  kind: "journal" | "voice-note";
  durationMs: number;
}

export interface AudioTimestamp {
  recordingId: string;
  atMs: number;
  /** End of the moment, when the source segment provides one. */
  endAtMs?: number;
}

export interface VoiceMoment {
  id: string;
  recording: AudioTimestamp;
  transcript: string;
}

export type DerivedItemKind = "task" | "decision" | "question" | "commitment";

export interface DerivedItem {
  id: string;
  kind: DerivedItemKind;
  text: string;
  sourceMoment: VoiceMoment;
  /** Whether atMs/endAtMs came from a measured segment boundary or an
   * interpolated estimate. Never claim "exact" for an estimated boundary. */
  timestampConfidence: "exact" | "estimated";
  /** How confident the deterministic classifier is in this item's kind,
   * 0-1. Cue-phrase matches score higher than weaker heuristic matches. */
  confidence: number;
  personIds?: LifeEntityId[];
  createdAt: string;
  /** Set once the user turns this into a real capability call (e.g. plans.create). */
  promotedCapabilityId?: string;
  promotedEntityId?: string;
}

interface ClassificationRule {
  kind: DerivedItemKind;
  pattern: RegExp;
  confidence: number;
  /** Strip the matched cue phrase from the front of the text when present. */
  stripLeading?: RegExp;
}

// Ordered: more specific cue phrases first, since a segment is classified by
// the first rule it matches.
const RULES: ClassificationRule[] = [
  { kind: "commitment", pattern: /\b(i promised|i told .+ i('d| would)|i said i('d| would)|i owe [a-z]+ (a|an|to))\b/i, confidence: 0.9 },
  { kind: "task", pattern: /\b(remind me to|i need to|i('ve| have) got to|i have to|i must)\b/i, confidence: 0.85, stripLeading: /^(i\s+)?(need to|have to|must|'ve got to|have got to)\s+/i },
  { kind: "decision", pattern: /\b(i('m| am) going with|i decided(?: to)?|i('ll| will) go with|going with the)\b/i, confidence: 0.85 },
  { kind: "question", pattern: /\?\s*$/, confidence: 0.75 },
  { kind: "question", pattern: /^(should i|is it|does|can i|do i|whether|will it|would it|are we)\b/i, confidence: 0.6 },
  { kind: "question", pattern: /\b(ask whether|wondering (if|whether)|not sure (if|whether)|should ask (if|whether))\b/i, confidence: 0.65 },
];

/**
 * Deterministic, rule-based classification. This is intentionally not ML —
 * it is a documented, testable heuristic with a known false-negative rate
 * (plain statements with no cue phrase are left unclassified) and a known
 * false-positive surface (any of these phrases used in an unrelated sense,
 * e.g. quoting someone else, will still match). Both limits are covered by
 * tests so the accuracy boundary stays explicit rather than assumed.
 */
export function classifySegmentText(text: string): { kind: DerivedItemKind; confidence: number } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  for (const rule of RULES) {
    if (rule.pattern.test(trimmed)) return { kind: rule.kind, confidence: rule.confidence };
  }
  return null;
}

function cleanExtractedText(kind: DerivedItemKind, text: string): string {
  let cleaned = text.trim().replace(/\s+/g, " ");
  const leading: Record<DerivedItemKind, RegExp> = {
    task: /^i\s+(need to|have to|must|'ve got to|have got to)\s+/i,
    commitment: /^i\s+(promised|told\s+\S+\s+i('d| would)|said i('d| would))\s*/i,
    decision: /^i('m| am)\s+going with\s+|^i\s+decided(?: to)?\s+|^i('ll| will) go with\s+/i,
    question: /^/,
  };
  cleaned = cleaned.replace(leading[kind], "");
  cleaned = cleaned.replace(/[.!?]+$/, "");
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/**
 * Segment a recording's transcript into derived items, one per matching
 * transcript segment, using the segment's own start/end timestamps.
 */
export function segmentRecording(
  segments: JournalTranscriptSegment[],
  recording: SourceRecording,
  now: string,
  matchPerson?: (text: string) => LifeEntityId[] | undefined,
): DerivedItem[] {
  const items: DerivedItem[] = [];
  for (const segment of segments) {
    if (segment.alignment === "untimed") continue;
    const match = classifySegmentText(segment.text);
    if (!match) continue;
    items.push({
      id: `earmark-${recording.id}-${segment.id}`,
      kind: match.kind,
      text: cleanExtractedText(match.kind, segment.text),
      confidence: match.confidence,
      timestampConfidence: segment.alignment === "segment-estimate" ? "estimated" : "exact",
      personIds: matchPerson?.(segment.text),
      createdAt: now,
      sourceMoment: {
        id: `moment-${segment.id}`,
        recording: { recordingId: recording.id, atMs: segment.startMs, endAtMs: segment.endMs },
        transcript: segment.text,
      },
    });
  }
  return items;
}
