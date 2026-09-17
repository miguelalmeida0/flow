import type { VoiceMarker, VoiceMarkerKind } from "../../domain/friends-model";
import type { JournalTranscriptSegment } from "../../domain/studio-model";

/** Small literal extraction, loaded after Stop. No paraphrase, confidence score,
 * inferred availability, calendar transaction, or remote service. */
export function suggestVoiceMarkers(recordingId: string, segments: readonly JournalTranscriptSegment[], existing: readonly VoiceMarker[], durationMs: number, at: string): VoiceMarker[] {
  const result: VoiceMarker[] = [];
  for (const segment of segments) {
    if (result.length >= 4 || segment.alignment !== "segment-estimate" || segment.endMs <= segment.startMs || existing.some(({ segmentIds }) => segmentIds.includes(segment.id))) continue;
    const text = segment.text.trim();
    if (/[“”"]/.test(text) || /\b(?:not|never|no longer|won['’]t|can['’]t|shouldn['’]t|wouldn['’]t)\b/i.test(text)) continue;
    const kind: VoiceMarkerKind | undefined = /^(?:i|we)(?:['’]ll| will| promise to)\s/i.test(text) ? "commitment"
      : /^(?:are|can|could|would|will|do|did|is|have|what|when|where|how)\s+(?:you|we|they|he|she|it|the|is|are|do|can|will)\b/i.test(text) ? "question"
      : /^(?:we (?:should|could|will)|let['’]s|i (?:will|plan to))\b.+\b(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|at \w+)\b/i.test(text) ? "plan"
      : /^(?:bring|send|remember to|please (?:bring|send|book)|pick up|book)\b/i.test(text) ? "task"
      : /^(?:we decided|i decided|the decision is|let['’]s decide)\b/i.test(text) ? "decision"
      : /^(?:i recommend|you should try|try the)\b/i.test(text) ? "recommendation" : undefined;
    if (!kind) continue;
    result.push({ id: `suggested-${recordingId}-${segment.id}`, recordingId, kind, title: text.slice(0, 64), excerpt: text, startMs: Math.max(0, segment.startMs - 350), endMs: Math.min(durationMs, segment.endMs + 250), segmentIds: [segment.id], origin: "suggested", alignment: "segment-estimate", status: "suggested", createdAt: at });
  }
  return result;
}
