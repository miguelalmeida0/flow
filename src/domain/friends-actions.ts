import type { Person } from "./life-model";
import type { FriendGroup, FriendLink, FriendMessage, FriendsState, GroupPlan, VoiceMarker, VoiceNote } from "./friends-model";
import type { JournalTranscriptSegment } from "./studio-model";

export type RecordingTarget = { kind: "journal" | "voice-note" | "shared-message"; id: string };
export type FriendsAction =
  | { type: "person.create"; person: Person }
  | { type: "person.update"; personId: string; patch: Partial<Pick<Person, "name" | "displayName" | "aliases" | "avatar" | "preferredChannel" | "archived">> }
  | { type: "friend.message.create"; message: FriendMessage }
  | { type: "friend.message.update"; messageId: string; expectedRevision: number; patch: Partial<Pick<FriendMessage, "body" | "attachment" | "status" | "calendarEventId">> }
  | { type: "friend.message.delete"; messageId: string }
  | { type: "voice-note.create"; note: VoiceNote }
  | { type: "voice-note.update"; noteId: string; patch: Partial<Pick<VoiceNote, "title" | "text" | "status" | "recordingState" | "recordingDurationMs" | "audioAssetId" | "originalAudioAssetId" | "transcriptSegments" | "markers">> }
  | { type: "voice-note.delete"; noteId: string }
  | { type: "recording.segment.add"; target: RecordingTarget; segment: JournalTranscriptSegment }
  | { type: "recording.markers.replace"; target: RecordingTarget; markers: VoiceMarker[] }
  | { type: "friend.group.create"; group: FriendGroup }
  | { type: "friend.group.update"; groupId: string; patch: Pick<FriendGroup, "memberIds" | "name"> }
  | { type: "friend.group-plan.create"; plan: GroupPlan }
  | { type: "friend.group-plan.update"; planId: string; patch: Partial<Pick<GroupPlan, "options" | "replies" | "selectedOptionId" | "calendarEventId" | "status">> }
  | { type: "friend.link.create"; link: FriendLink }
  | { type: "friend.reaction.add"; reaction: FriendsState["reactions"][number] };
