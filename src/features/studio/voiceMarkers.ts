import type { JournalTranscriptSegment } from "../../domain/studio-model";
import type { VoiceMarker } from "../../domain/friends-model";

export function manualVoiceMarker(recordingId: string, segments: readonly JournalTranscriptSegment[], positionMs: number, id: string, at: string): VoiceMarker {
  const segment = segments.filter((item) => item.startMs <= positionMs).at(-1);
  return { id, recordingId, kind: "moment", title: segment?.text.slice(0, 64) || "Marked moment", excerpt: segment?.text ?? "", startMs: Math.max(0, (segment?.startMs ?? positionMs) - 350), endMs: Math.max(segment?.endMs ?? positionMs, positionMs), segmentIds: segment ? [segment.id] : [], origin: "manual", alignment: segment?.alignment === "segment-estimate" ? "segment-estimate" : "position", status: "kept", createdAt: at };
}
export function resolveVoiceMarkers(markers: readonly VoiceMarker[], query?: string, selectedId?: string) {
  const active = markers.filter(({ status }) => status !== "dismissed").sort((a, b) => a.startMs - b.startMs);
  const text = query?.trim().toLowerCase().replace(/^(?:the|a)\s+/, "");
  if (!text || /^(?:that|this|it|selected)$/.test(text)) return active.filter(({ id }) => id === selectedId);
  const index = ["first", "second", "third", "fourth", "fifth"].indexOf(text);
  if (index >= 0 || /^\d+$/.test(text)) return active[index >= 0 ? index : Number(text) - 1] ? [active[index >= 0 ? index : Number(text) - 1]!] : [];
  const exact = active.filter(({ title }) => title.toLowerCase() === text);
  const kind = active.filter((marker) => marker.kind === text);
  return exact.length ? exact : kind.length ? kind : active.filter(({ title, excerpt }) => `${title} ${excerpt}`.toLowerCase().includes(text));
}
