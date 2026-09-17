import type { JournalTranscriptSegment } from "./studio-model";

export type Recipient = { kind: "person" | "group"; id: string };
export type VoiceMarkerKind = "moment" | "plan" | "question" | "task" | "commitment" | "decision" | "recommendation";
export interface VoiceMarker {
  id: string;
  recordingId: string;
  kind: VoiceMarkerKind;
  title: string;
  excerpt: string;
  startMs: number;
  endMs: number;
  segmentIds: string[];
  origin: "manual" | "suggested";
  alignment: "segment-estimate" | "position";
  status: "suggested" | "kept" | "dismissed";
  createdAt: string;
}
export interface VoiceNote {
  id: string;
  kind: "voice-note";
  recipient: Recipient;
  authorPersonId?: string;
  title: string;
  text: string;
  status: "draft" | "ready";
  recordingState: "idle" | "recording" | "paused" | "interrupted";
  recordingDurationMs: number;
  audioAssetId?: string;
  originalAudioAssetId?: string;
  transcriptSegments: JournalTranscriptSegment[];
  markers: VoiceMarker[];
  replyToMarkerId?: string;
  replyToMessageId?: string;
  createdAt: string;
  updatedAt: string;
}
/** Delivery envelopes never contain private Journal entry, source asset, or source marker IDs. */
export interface SharedAttachment {
  kind: "voice" | "memory";
  assetId?: string;
  title: string;
  text: string;
  durationMs?: number;
  mediaType?: "image" | "audio";
  markers?: Array<Pick<VoiceMarker, "id" | "kind" | "title" | "excerpt" | "startMs" | "endMs">>;
}
export interface FriendMessage {
  id: string;
  recipient: Recipient;
  recipientSnapshot?: { name: string; people: Array<{ id: string; name: string }> };
  direction: "outgoing" | "incoming";
  authorPersonId?: string;
  body: string;
  revision: number;
  status: "draft" | "ready" | "failed";
  attachment?: SharedAttachment;
  replyToMarkerId?: string;
  replyToMessageId?: string;
  calendarEventId?: string;
  groupPlanId?: string;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}
export interface FriendGroup {
  id: string;
  kind: "friend-group";
  name: string;
  memberIds: string[];
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
}
export interface GroupPlan {
  id: string;
  groupId: string;
  title: string;
  options: Array<{ id: string; dateKey: string; startMinutes: number }>;
  replies: Array<{ personId: string; optionIds: string[]; text: string; at: string; response?: "in" | "maybe" | "cant" | "alternative"; provenance?: "recorded-by-user" | "provider" }>;
  selectedOptionId?: string;
  calendarEventId?: string;
  status: "proposed" | "confirmed";
  createdAt: string;
}
export interface FriendLink {
  id: string;
  personIds: string[];
  groupId?: string;
  source: { kind: "voice-note" | "journal" | "marker" | "memory" | "message"; id: string };
  destination: { kind: "calendar-event" | "commitment" | "plan" | "memory"; id: string };
}
export interface FriendsState {
  messages: FriendMessage[];
  voiceNotes: VoiceNote[];
  groups: FriendGroup[];
  groupPlans: GroupPlan[];
  links: FriendLink[];
  reactions: Array<{ id: string; messageId: string; personId?: string; reaction: string; at: string }>;
}
export function emptyFriendsState(): FriendsState {
  return { messages: [], voiceNotes: [], groups: [], groupPlans: [], links: [], reactions: [] };
}
