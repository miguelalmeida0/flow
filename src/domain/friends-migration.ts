import { emptyFriendsState, type FriendsState } from "./friends-model";

export function migrateFriends(stored: FriendsState | undefined): FriendsState {
  const empty = emptyFriendsState();
  if (!stored) return empty;
  return {
    ...empty, ...stored,
    messages: Array.isArray(stored.messages) ? stored.messages : [],
    voiceNotes: Array.isArray(stored.voiceNotes) ? stored.voiceNotes.map((note) => ({ ...note, markers: note.markers ?? [], transcriptSegments: note.transcriptSegments ?? [], recordingState: note.recordingState === "recording" || note.recordingState === "paused" ? "interrupted" : note.recordingState })) : [],
    groups: Array.isArray(stored.groups) ? stored.groups : [],
    groupPlans: Array.isArray(stored.groupPlans) ? stored.groupPlans : [],
    links: Array.isArray(stored.links) ? stored.links : [],
    reactions: Array.isArray(stored.reactions) ? stored.reactions : [],
  };
}
