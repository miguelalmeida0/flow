import type { FriendIntent } from "./friendIntents";
import type { FriendMessage } from "../../domain/friends-model";
import type { CalendarMessageProposal } from "./calendarProposal";
import type { MarkerIntent } from "../studio/markerIntents";

/** This is a member of PendingLifeChange, never a separate confirmation store. */
export type FriendPending =
  | { kind: "reply-dictation"; intent: Extract<FriendIntent, { type: "friend-reply" }>; expiresAt: number }
  | { kind: "friend-followup"; intent: FriendIntent; slot: "group" | "member" | "time" | "event" | "moment" | "message"; choices: Array<{ id: string; label: string }>; expiresAt: number }
  | { kind: "marker"; intent: MarkerIntent; choices: Array<{ id: string; label: string }>; expiresAt: number }
  | { kind: "marker-action"; intent: MarkerIntent; stage: "recipient" | "payload" | "time" | "direction"; choices: Array<{ id: string; label: string }>; expiresAt: number }
  | { kind: "marker-calendar"; intent: MarkerIntent; proposal: CalendarMessageProposal; expiresAt: number }
  | { kind: "voice-edit"; noteId: string; assetId: string; cutAtMs: number; expiresAt: number }
  | { kind: "recipient"; intent: FriendIntent; choices: Array<{ id: string; label: string }>; expiresAt: number }
  | { kind: "unknown-person"; intent: FriendIntent; query: string; expiresAt: number }
  | { kind: "message"; messageId: string; messageRevision: number; expiresAt: number }
  | { kind: "calendar-message"; message: FriendMessage; proposal: CalendarMessageProposal; deliver?: boolean; expiresAt: number }
  | { kind: "person-archive"; personId: string; expiresAt: number };
