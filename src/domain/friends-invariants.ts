import type { LifeDocument } from "./life-model";
import type { VoiceMarker } from "./friends-model";

export function validateVoiceMarkers(markers: readonly VoiceMarker[], durationMs: number, recordingId: string) {
  if (new Set(markers.map(({ id }) => id)).size !== markers.length) return "A recording contains duplicate moment identities.";
  for (const marker of markers) {
    if (marker.recordingId !== recordingId || !Number.isFinite(marker.startMs) || !Number.isFinite(marker.endMs) || marker.startMs < 0 || marker.endMs < marker.startMs || marker.endMs > durationMs + 250) return "A moment lies outside its recording.";
    if (!marker.title.trim() || !["suggested", "kept", "dismissed"].includes(marker.status)) return "A moment has invalid metadata.";
  }
  return null;
}
export function validateFriends(document: LifeDocument): string | null {
  const friends = document.friends;
  if (!friends) return document.schemaVersion === 6 ? "Friends data is missing." : null;
  const hasPerson = (id: string) => document.people.some((person) => person.id === id);
  const hasRecipient = (recipient: { kind: string; id: string }) => recipient.kind === "person" ? hasPerson(recipient.id) : friends.groups.some((group) => group.id === recipient.id);
  for (const person of document.people) if (!person.name.trim() || person.aliases?.some((alias) => !alias.trim())) return "A person has an empty name or alias.";
  for (const group of friends.groups) if (!group.name.trim() || !group.memberIds.length || new Set(group.memberIds).size !== group.memberIds.length || group.memberIds.some((id) => !hasPerson(id))) return "A private group has invalid members.";
  for (const message of friends.messages) {
    if (!hasRecipient(message.recipient) || message.authorPersonId && !hasPerson(message.authorPersonId)) return "A message has a missing person or group.";
    if (!Number.isSafeInteger(message.revision) || message.revision < 1 || !message.idempotencyKey) return "A message has invalid draft authority.";
    if (message.attachment?.assetId && !document.studio.mediaAssets.some(({ id }) => id === message.attachment?.assetId)) return "A message points to missing audio.";
  }
  for (const note of friends.voiceNotes) {
    if (!hasRecipient(note.recipient) || note.authorPersonId && !hasPerson(note.authorPersonId)) return "A voice note has a missing person or group.";
    if (note.recordingDurationMs < 0 || !Number.isFinite(note.recordingDurationMs)) return "A voice note has an invalid recording duration.";
    if (note.audioAssetId && !document.studio.mediaAssets.some(({ id, kind }) => id === note.audioAssetId && kind === "voice-note-audio")) return "A voice note points to missing original audio.";
    if (note.originalAudioAssetId && !document.studio.mediaAssets.some(({ id }) => id === note.originalAudioAssetId)) return "A voice note points to a missing unedited original.";
    const markerError = validateVoiceMarkers(note.markers, note.recordingDurationMs, note.id);
    if (markerError) return markerError;
    if (note.transcriptSegments.some(({ startMs, endMs }) => !Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs < 0 || endMs < startMs)) return "A voice note has an invalid transcript range.";
  }
  for (const plan of friends.groupPlans) {
    const group = friends.groups.find(({ id }) => id === plan.groupId);
    if (!group || plan.replies.some(({ personId, optionIds }) => !group.memberIds.includes(personId) || optionIds.some((optionId) => !plan.options.some(({ id }) => id === optionId)))) return "A group plan has invalid replies.";
  }
  return null;
}
