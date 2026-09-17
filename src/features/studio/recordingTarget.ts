import type { LifeAction } from "../../domain/life-actions";
import type { LifeDocument } from "../../domain/life-model";
import type { RecordingTarget } from "../../domain/friends-actions";
import { journalVoiceMarkers } from "./journalMarkers";
import { messageEnvelope } from "../friends/deliveryProjection";
import { deliveryReceipts } from "../friends/messaging";

export function recordingDocument(document: LifeDocument, target: RecordingTarget) {
  if (target.kind === "shared-message") {
    const message = messageEnvelope(document, deliveryReceipts(), target.id);
    const attachment = message?.attachment;
    if (!message || attachment?.kind !== "voice") return undefined;
    return { id: message.id, createdAt: message.createdAt, text: attachment.text, title: attachment.title, audioAssetId: attachment.assetId, recordingState: "idle" as const, recordingDurationMs: attachment.durationMs ?? 0, transcriptSegments: [], markers: attachment.markers?.map((marker) => ({ ...marker, recordingId: message.id, segmentIds: [], origin: "manual" as const, alignment: "segment-estimate" as const, status: "kept" as const, createdAt: message.createdAt })) ?? [] };
  }
  if (target.kind === "journal") { const entry = document.studio.journalEntries.find(({ id }) => id === target.id); return entry ? { ...entry, markers: journalVoiceMarkers(entry) } : undefined; }
  return document.friends?.voiceNotes.find(({ id }) => id === target.id);
}
export function recordingUpdate(target: RecordingTarget, patch: { recordingState?: "idle" | "recording" | "paused" | "interrupted"; recordingDurationMs?: number; audioAssetId?: string }): LifeAction {
  if (target.kind === "shared-message") throw new Error("Delivered recordings cannot be changed.");
  return target.kind === "journal" ? { type: "journal.update", entryId: target.id, patch }
    : { type: "voice-note.update", noteId: target.id, patch };
}
