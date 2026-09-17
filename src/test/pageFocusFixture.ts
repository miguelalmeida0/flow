import { createFreshLifeSnapshot } from "../domain/life-storage";
import { canonicalPerson } from "../features/friends/people";

export const pageFocusClock = () => new Date("2026-09-12T10:00:00Z");
export function pageFocusFixture() {
  const at = pageFocusClock().toISOString(), snapshot = createFreshLifeSnapshot("2026-09-12");
  snapshot.document.people = ["Sarah", "John"].map((name) => canonicalPerson({ id: name.toLowerCase(), kind: "person", name, createdAt: at, updatedAt: at }));
  snapshot.document.studio.journalEntries = ["Morning", "Evening"].map((title, index) => ({ id: `entry-${index}`, kind: "journal-entry", title, text: `${title} words.`, status: "saved", recordingState: "idle", recordingDurationMs: 20000, audioAssetId: `audio-${index}`, photoAssetIds: [], bookmarks: [], transcriptSegments: [], drawings: [], tags: [], createdAt: at, updatedAt: at }));
  snapshot.document.studio.mediaAssets = [0, 1].map((index) => ({ id: `audio-${index}`, kind: "journal-audio", name: "Original", mimeType: "audio/wav", size: 12, createdAt: at }));
  snapshot.document.studio.memories = ["Morning", "Evening"].map((title, index) => ({ id: `memory-${index}`, kind: "memory", title, journalEntryId: `entry-${index}`, composition: "voice", passage: `${title} words.`, showDate: true, datePlacement: "inline", textScale: 1, textOffset: { x: 0, y: 0 }, audioEnabled: true, audioInMs: 0, audioOutMs: 20000, status: "saved", createdAt: at, updatedAt: at }));
  for (let index = 0; index < 20; index++) {
    snapshot.document.friends!.messages.push({ id: `message-${index}`, recipient: { kind: "person", id: "sarah" }, authorPersonId: "sarah", direction: "incoming", body: `Earlier conversation ${index}`, status: "ready", revision: 1, idempotencyKey: `message-${index}`, createdAt: at, updatedAt: at });
  }
  return snapshot;
}
