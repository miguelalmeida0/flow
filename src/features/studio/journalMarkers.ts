import type { JournalEntry } from "../../domain/studio-model";
import type { VoiceMarker } from "../../domain/friends-model";

/** A projection keeps legacy bookmark IDs intact for linked Memories. Old
 * point bookmarks remain explicitly imprecise, not fabricated segment ranges. */
export function journalVoiceMarkers(entry: JournalEntry): VoiceMarker[] {
  const markers = entry.markers ?? [];
  const projected = entry.bookmarks.filter((bookmark) => !markers.some((marker) => marker.id === `legacy-marker-${bookmark.id}`)).map((bookmark): VoiceMarker => ({ id: `legacy-marker-${bookmark.id}`, recordingId: entry.id, kind: "moment", title: bookmark.transcriptAnchor?.slice(0, 64) || "Bookmarked moment", excerpt: bookmark.transcriptAnchor ?? "", startMs: bookmark.range?.startMs ?? bookmark.timestampMs, endMs: bookmark.range?.endMs ?? bookmark.timestampMs, segmentIds: bookmark.range?.segmentIds ?? [], origin: "manual", alignment: bookmark.range ? "segment-estimate" : "position", status: "kept", createdAt: bookmark.createdAt }));
  return [...markers, ...projected].sort((a, b) => a.startMs - b.startMs);
}
