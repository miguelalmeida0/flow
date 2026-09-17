import type { LifeContext } from "../../domain/life-model";
import type { RecordingTarget } from "../../domain/friends-actions";
import type { CalendarRequest } from "../day-planner/model";

export type MarkerIntent = { type: "recording-marker"; operation: "mark" | "play" | "select" | "keep" | "dismiss" | "reply" | "calendar" | "commitment" | "share"; query?: string; target?: RecordingTarget; markerId?: string; recipientQuery?: string; recipientId?: string; payload?: "text" | "voice"; timeAnswer?: string; resolvedDateKey?: string; resolvedMinutes?: number; clockExplicit?: boolean; direction?: "owed-by-me" | "waiting-on"; request?: CalendarRequest };
export function parseMarkerIntent(text: string, context: LifeContext): MarkerIntent | undefined {
  if (!context.activeJournalEntryId && !context.activeVoiceNoteId && !context.activeMessageId) return undefined;
  if (/^(?:mark that|bookmark that|keep that part|remember that bit|mark this moment|mark here)[.!]?$/i.test(text)) return context.activeJournalEntryId && context.route !== "people" ? undefined : { type: "recording-marker", operation: "mark" };
  const select = text.match(/^(play|select|open|go back to|reply to|keep|dismiss)\s+(?:the\s+)?(.+?)\s+(?:marker|moment|part)[.!]?$/i) ?? text.match(/^(play|select|open|go back to|reply to|keep|dismiss)\s+(?:the\s+)?(?:marker|moment)\s+(.+?)[.!]?$/i)
    ?? text.match(/^(play|select|go back to|reply to|keep|dismiss)\s+(?:the\s+)?(first|second|third|fourth|fifth)(?:\s+one)?[.!]?$/i)
    ?? text.match(/^(play|select|go back to|reply to|keep|dismiss)\s+(?:the\s+)?(question|plan|task|commitment|decision|recommendation)[.!]?$/i);
  if (select) { const operation = select[1]!.toLowerCase(); return { type: "recording-marker", operation: /^(play|go back)/.test(operation) ? "play" : operation === "keep" ? "keep" : operation === "dismiss" ? "dismiss" : operation === "reply to" ? "reply" : "select", query: select[2] }; }
  if (/^(?:make a plan from that|put that in my calendar|schedule that|add that to (?:my )?calendar)[.!]?$/i.test(text)) return { type: "recording-marker", operation: "calendar" };
  if (/^(?:keep that commitment|make (?:that|this) a commitment)[.!]?$/i.test(text)) return { type: "recording-marker", operation: "commitment" };
  const share = text.match(/^(?:share|send)\s+(?:the\s+)?(.+?)(?:\s+(?:with|to)\s+(.+?))?[.!]?$/i);
  if (share && /\b(?:marker|moment|part|that|this)\b/i.test(share[1]!)) return { type: "recording-marker", operation: "share", query: share[1]!.replace(/\s+(?:marker|moment|part)$/i, ""), recipientQuery: share[2] };
  return undefined;
}
