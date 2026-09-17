import type { LifeDocument } from "../../../domain/life-model";
import type { SharedAttachment } from "../../../domain/friends-model";
import type { StudioMediaAsset } from "../../../domain/studio-model";
import { getStudioMedia, putStudioMedia, retainStudioMedia } from "../mediaRepository";
import { exportAudioClip } from "../audioClip";

/** Export the visible composition only. Private source references never enter the envelope. */
export async function prepareMemoryAttachment(document: LifeDocument, memoryId: string, isCurrent: () => boolean): Promise<{ attachment: SharedAttachment; asset?: StudioMediaAsset; release: () => void }> {
  const memory = document.studio.memories.find(({ id }) => id === memoryId), entry = document.studio.journalEntries.find(({ id }) => id === memory?.journalEntryId);
  if (!memory || !entry) throw new Error("The Memory source is no longer available.");
  const attachment: SharedAttachment = { kind: "memory", title: memory.title, text: memory.passage };
  if (memory.composition === "voice" && memory.audioEnabled) {
    if (!entry.audioAssetId || memory.audioOutMs === undefined) throw new Error("Choose an explicit start and end for this Memory's voice excerpt before sharing.");
    const clip = await exportAudioClip(entry.audioAssetId, memory.audioInMs, Math.min(entry.recordingDurationMs, memory.audioOutMs), `shared-memory-${crypto.randomUUID()}`, isCurrent);
    return { ...clip, attachment: { ...attachment, assetId: clip.asset.id, mediaType: "audio", durationMs: clip.durationMs } };
  }
  if (memory.composition === "still" && memory.photoAssetId) {
    if (typeof indexedDB === "undefined") throw new Error("Persistent media is unavailable. The photo was not shared.");
    const releaseSource = retainStudioMedia(memory.photoAssetId);
    try {
      const blob = await getStudioMedia(memory.photoAssetId);
      if (!blob?.size || !isCurrent()) throw new Error("The photo is unavailable or this request changed.");
      const id = `shared-memory-${crypto.randomUUID()}`, release = retainStudioMedia(id);
      try {
        await putStudioMedia(id, blob);
        if (!isCurrent() || !(await getStudioMedia(id))?.size) throw new Error("The prepared photo could not be verified.");
        const asset = { id, kind: "memory-export" as const, name: memory.title, mimeType: blob.type, size: blob.size, createdAt: new Date().toISOString() };
        return { attachment: { ...attachment, assetId: id, mediaType: "image" }, asset, release };
      } catch (error) { release(); throw error; }
    } finally { releaseSource(); }
  }
  if (!memory.passage.trim()) throw new Error("This composition has no visible words or media to share.");
  return { attachment, release: () => undefined };
}
