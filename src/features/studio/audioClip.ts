import { getStudioMedia, putStudioMedia, retainStudioMedia } from "./mediaRepository";
import type { StudioMediaAsset } from "../../domain/studio-model";

/** Samples are copied into a standalone PCM WAV. A compressed Blob slice or
 * playback offset would still expose the private full recording. */
export function encodeAudioRange(channels: readonly Float32Array[], sampleRate: number, startMs: number, endMs: number) {
  if (!channels.length || channels.length > 2 || !Number.isFinite(sampleRate) || sampleRate < 1 || channels.some((channel) => channel.length !== channels[0]!.length)) throw new Error("The audio format cannot be exported safely.");
  const first = Math.floor(startMs * sampleRate / 1000), last = Math.ceil(endMs * sampleRate / 1000);
  if (!Number.isFinite(first) || !Number.isFinite(last) || first < 0 || last <= first || last > channels[0]!.length) throw new Error("Choose a nonempty range inside the original recording.");
  const frames = last - first, bytes = frames * channels.length * 2;
  const buffer = new ArrayBuffer(44 + bytes), view = new DataView(buffer);
  const text = (offset: number, value: string) => [...value].forEach((letter, index) => view.setUint8(offset + index, letter.charCodeAt(0)));
  text(0, "RIFF"); view.setUint32(4, 36 + bytes, true); text(8, "WAVE"); text(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels.length, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * channels.length * 2, true); view.setUint16(32, channels.length * 2, true); view.setUint16(34, 16, true); text(36, "data"); view.setUint32(40, bytes, true);
  let offset = 44;
  for (let frame = first; frame < last; frame++) for (const channel of channels) { const value = Math.max(-1, Math.min(1, channel[frame]!)); view.setInt16(offset, Math.round(value * (value < 0 ? 32768 : 32767)), true); offset += 2; }
  return { buffer, durationMs: frames / sampleRate * 1000 };
}

export async function exportAudioClip(sourceId: string, startMs: number, endMs: number, assetId: string, isCurrent: () => boolean, kind: "shared-clip" | "voice-note-audio" = "shared-clip") {
  const releaseSource = retainStudioMedia(sourceId), releaseClip = retainStudioMedia(assetId);
  const ensureCurrent = () => { if (!isCurrent()) throw new Error("The clip request changed. No message was prepared."); };
  let audio: AudioContext | undefined;
  try {
    if (typeof indexedDB === "undefined") throw new Error("Persistent audio storage is unavailable. No clip was shared.");
    const original = await getStudioMedia(sourceId); ensureCurrent();
    if (!original?.size) throw new Error("The original recording is unavailable. No clip was shared.");
    if (typeof AudioContext === "undefined") throw new Error("This browser cannot export a bounded voice clip. The original remains private.");
    audio = new AudioContext();
    const decoded = await audio.decodeAudioData(await original.arrayBuffer()); ensureCurrent();
    if (decoded.numberOfChannels > 2) throw new Error("This multichannel recording cannot be clipped without losing channels. The original remains private.");
    const encoded = encodeAudioRange(Array.from({ length: decoded.numberOfChannels }, (_, index) => decoded.getChannelData(index)), decoded.sampleRate, startMs, endMs);
    const blob = new Blob([encoded.buffer], { type: "audio/wav" });
    ensureCurrent(); await putStudioMedia(assetId, blob); ensureCurrent();
    const asset: StudioMediaAsset = { id: assetId, kind, name: "Selected voice clip.wav", mimeType: "audio/wav", size: blob.size, createdAt: new Date().toISOString() };
    return { asset, durationMs: encoded.durationMs, release: releaseClip };
  } catch (error) { releaseClip(); throw error; }
  finally { releaseSource(); if (audio) await audio.close().catch(() => undefined); }
}
