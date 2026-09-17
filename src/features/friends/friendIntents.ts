import type { LifeContext, Person } from "../../domain/life-model";
import { resolvePeople } from "./people";
import type { CalendarRequest } from "../day-planner/model";
import { parseMarkerIntent, type MarkerIntent } from "../studio/markerIntents";
import type { SharedAttachment, FriendGroup } from "../../domain/friends-model";
import { parseGroupIntent, type GroupIntent } from "./groupIntents";
import { parseMemorySocial, type MemorySocialIntent } from "./memorySocial";
import { parseRelationshipQuery, type RelationshipIntent } from "./relationshipQueries";
import type { StudioMediaAsset } from "../../domain/studio-model";
import { parseJournalPlayback, type JournalPlaybackIntent } from "../studio/interpretation/journalPlayback";

export type FriendIntent = (
  | MarkerIntent
  | GroupIntent
  | MemorySocialIntent
  | RelationshipIntent
  | { type: "friend-plan"; recipientQuery?: string; value?: string; dateKey?: string }
  | { type: "friend-person"; operation: "create" | "open" | "alias" | "archive"; query: string; alias?: string }
  | { type: "friend-message"; recipientQuery?: string; body: string; eventId?: string; allowBooking?: boolean; attachment?: SharedAttachment; asset?: StudioMediaAsset }
  | { type: "friend-marker-answer"; value: string }
  | { type: "friend-plans"; eventId?: string; recipientQuery?: string }
  | { type: "friend-reply"; body: string }
  | { type: "friend-calendar"; request: CalendarRequest; recipientQuery: string }
  | { type: "friend-voice"; operation: "create" | "open" | "start" | "pause" | "resume" | "stop" | "play" | "discard" | "send" | "review" | "append" | "delete-tail" | "delete-tail-review"; recipientQuery?: string; noteId?: string; text?: string }
  | { type: "friend-draft"; operation: "append" | "replace" | "read" | "send" | "retry" | "calendar-refine" | "tone"; value?: string; request?: CalendarRequest }
  | { type: "friend-playback"; playback: JournalPlaybackIntent }
  | { type: "friend-open"; collection?: LifeContext["friendsCollection"] }) & { resolvedPersonId?: string; resolvedGroupId?: string; replyToMessageId?: string; replyToMarkerId?: string };

const literal = (value: string) => {
  const text = value.trim();
  return /^(?:"[\s\S]*"|“[\s\S]*”|'[\s\S]*')$/.test(text) ? text.slice(1, -1) : text;
};
const cleanFrame = (text: string) => text.trim().replace(/^(?:(?:hey\s+flow[,!]?)\s+)?(?:(?:please|actually)[, ]+)?(?:(?:can|could|would) you\s+)?/i, "");
export function parseFriendIntent(transcript: string, context: LifeContext, people: readonly Person[] = [], groups: readonly FriendGroup[] = []): FriendIntent | null {
  if (context.friendPendingKind === "reply-dictation" && !/^(?:(?:cancel|never mind|nevermind|undo|redo|yes|confirm|send(?: it)?)[.!]?|(?:open|go to|take me to|text|message|tell|schedule|move|delete|remove)\s)/i.test(transcript.trim())) return { type: "friend-marker-answer", value: literal(transcript.replace(/^reply\s+(?:saying\s+)?/i, "")) };
  const text = cleanFrame(transcript);
  const collection = text.match(/^(?:show|open) (?:my |friends )?(recent activity|recent|shared plans|friends plans|voice notes|groups)[.!]?$/i);
  if (collection && context.route === "people") return { type: "friend-open", collection: /recent/i.test(collection[1]!) ? "Recent" : /plans/i.test(collection[1]!) ? "Plans" : /voice/i.test(collection[1]!) ? "Voice notes" : "Groups" };
  if (context.route === "people" && /^(?:reply with (?:a )?voice note|send (?:a )?voice reply|voice reply)[.!]?$/i.test(text)) return { type: "friend-voice", operation: "create", replyToMessageId: context.activeMessageId ?? "" };
  if (context.route === "people" && (context.activeVoiceNoteId || context.activeMessageId)) {
    const playback = parseJournalPlayback(text.toLowerCase().replace(/[.!?]$/, "").replace(/(?:shared memory|shared recording|voice note|voice recording)/g, "journal recording").replace(/(?<!journal )\brecording\b/g, "journal recording"), context);
    if (playback) return { type: "friend-playback", playback };
  }
  if (context.pendingChoices?.length && /^(?:(?:the )?(?:first|second|third)(?: one)?|[1-3])[.!]?$/i.test(text)) return null;
  const memorySocial = parseMemorySocial(text, context);
  if (memorySocial) return memorySocial;
  const relationship = parseRelationshipQuery(text, context);
  if (relationship) return relationship;
  const seeing = text.match(/^when (?:am i seeing|will i see|do i see) (.+?)(?: next)?[.!?]?$/i);
  if (seeing) return { type: "friend-plans", recipientQuery: seeing[1]! };
  const plan = text.match(/^(?:make|create) (?:a )?plan with (.+?)(?: (today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(.*))?[.!]?$/i);
  if (plan) return { type: "friend-plan", recipientQuery: plan[1]!, value: plan[2] ? `${plan[2]}${plan[3] ?? ""}` : undefined };
  const group = parseGroupIntent(text, context, groups);
  if (group) return group;
  const marker = parseMarkerIntent(text, context);
  if (marker) return marker;
  const namedOpen = text.match(/^open\s+(.+?)[.!]?$/i);
  if (namedOpen && resolvePeople(people, namedOpen[1]!).length) return { type: "friend-person", operation: "open", query: namedOpen[1]! };
  if (context.focusedPersonId && /^(?:when are we meeting|when do we meet|show our plans|what are our plans|when is our (?:meeting|dinner))[.!?]?$/i.test(text)) return { type: "friend-plans" };
  if (context.friendPrompt && /^(?!(?:cancel|never mind|undo|redo|delete|remove|open|go|text|message|tell|add|schedule|move|change|stop|pause|send|yes|confirm)\b)[\p{L}\p{N} :.'’?-]{1,90}$/iu.test(text)) return { type: "friend-marker-answer", value: text.replace(/^(?:with|to)\s+/i, "") };
  const voiceNote = text.match(/^(?:send|record|make)\s+(.+?)\s+(?:a\s+)?voice note[.!]?$/i) ?? text.match(/^(?:record|make)\s+(?:a\s+)?voice note\s+(?:to|for)\s+(.+?)[.!]?$/i);
  if (voiceNote) return { type: "friend-voice", operation: "create", recipientQuery: literal(voiceNote[1]!) };
  if ((context.focusedPersonId || context.focusedGroupId) && /^play the latest voice note[.!]?$/i.test(text)) return { type: "friend-voice", operation: "open", text: "latest" };
  if (context.activeVoiceNoteId && context.route === "people") {
    if (/^(?:delete|remove|cut) the last (?:part|bit|sentence)[.!]?$/i.test(text)) return { type: "friend-voice", operation: "delete-tail", noteId: context.activeVoiceNoteId };
    const operation = /^(?:start|record|start recording)[.!]?$/i.test(text) ? "start" : /^(?:pause|pause recording)[.!]?$/i.test(text) ? "pause"
      : /^(?:continue|resume|continue recording|resume recording)[.!]?$/i.test(text) ? "resume" : /^(?:stop|stop recording|finish recording)[.!]?$/i.test(text) ? "stop"
      : /^(?:play it|play the note|play this note|listen back)[.!]?$/i.test(text) ? "play" : /^(?:delete|discard|cancel)(?: (?:it|this note|the note|recording))?[.!]?$/i.test(text) && !context.friendPending ? "discard"
      : /^(?:send it|send the note|send this note)[.!]?$/i.test(text) && !context.friendPending ? "send" : undefined;
    if (operation) return { type: "friend-voice", operation, noteId: context.activeVoiceNoteId };
  }
  const add = text.match(/^(?:add|create|save)\s+(?:(?:a|new)\s+)?(?:friend|contact|person)\s+(?:named\s+)?(.+?)[.!]?$/i) ?? text.match(/^add\s+(.+?)\s+(?:as|to)\s+(?:a\s+)?(?:friend|contact|friends)[.!]?$/i);
  if (add) return { type: "friend-person", operation: "create", query: literal(add[1]!) };
  const alias = !/^remember to\b/i.test(text) && text.match(/^(?:call|remember)\s+(.+?)\s+(?:as|also as)\s+(.+?)[.!]?$/i);
  if (alias) return { type: "friend-person", operation: "alias", query: literal(alias[1]!), alias: literal(alias[2]!) };
  const open = text.match(/^(?:open|show(?: me)?)\s+(?:my\s+)?(?:friend|contact|person)\s+(.+?)[.!]?$/i);
  if (open && !/^please[.!]?$/i.test(open[1]!)) return { type: "friend-person", operation: "open", query: literal(open[1]!).replace(/\s+please[.!]?$/i, "") };
  const remove = text.match(/^(?:remove|archive|delete)\s+(?:the\s+)?(?:friend|contact|person)\s+(.+?)[.!]?$/i);
  if (remove) return { type: "friend-person", operation: "archive", query: literal(remove[1]!) };
  if (context.friendPending) {
    if (/^(?:make it warmer|make it friendlier|less dramatic|make it less dramatic)[.!]?$/i.test(text)) return { type: "friend-draft", operation: "tone", value: /warmer|friendlier/i.test(text) ? "warmer" : "calmer" };
    if ((context.friendPendingKind === "calendar-message" || context.friendPendingKind === "marker-calendar") && /^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|at\s|\d{1,2}(?::\d{2})?(?:\s*[ap]\.?m\.?)?[.!]?\s*$|(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?:\s|[.!]?$)|move\s+(?:the\s+)?other|leave\s+|keep\s+)/i.test(text)) return { type: "friend-draft", operation: "calendar-refine", value: text };
    if (/^(?:send(?: it| that| the message)?|yes[, ]+send(?: it)?|send now)[.!]?$/i.test(text)) return { type: "friend-draft", operation: "send" };
    if (/^retry(?: (?:it|sending|the message))?[.!]?$/i.test(text)) return { type: "friend-draft", operation: "retry" };
    if (/^(?:read(?: it| that| the message)(?: back)?|read back)[.!]?$/i.test(text)) return { type: "friend-draft", operation: "read" };
    const edit = text.match(/^(add|append|say|change it to|replace it with)\s+([\s\S]+)$/i);
    if (edit) return { type: "friend-draft", operation: /^(?:add|append)$/i.test(edit[1]!) ? "append" : "replace", value: literal(edit[2]!) };
  }
  const reply = text.match(/^reply(?:\s+(?:to\s+(?:that|this)))?\s+(?:saying\s+)?([\s\S]+)$/i);
  if (reply && (context.focusedPersonId || context.focusedGroupId || context.activeMessageId)) return { type: "friend-reply", body: literal(reply[1]!) };
  const emptyMessage = text.match(/^send (.+?) (?:a )?message[.!]?$/i);
  if (emptyMessage) return { type: "friend-message", recipientQuery: emptyMessage[1]!, body: "" };
  const message = text.match(/^(?:text|message|tell|send\s+(?:a\s+)?message\s+to)\s+([\s\S]+)$/i);
  if (!message) return null;
  if (/^tell me\b/i.test(text)) return null;
  const payload = message[1]!;
  const explicit = payload.match(/^(.+?)(?:\s*[:,]\s*|\s+(?:that|saying)\s+)([\s\S]+)$/i);
  const quoted = payload.match(/^(.+?)\s+((?:"[\s\S]*"|“[\s\S]*”|'[\s\S]*'))$/);
  const clause = payload.match(/^(.+?)\s+((?:I(?:['’]m|['’]ll|['’]ve|['’]d)?|we(?:['’]re|['’]ll|['’]ve|['’]d)?|you(?:['’]re|['’]ll)?|(?:the|our) meeting|let['’]s|hello|hi|thanks|thank you|see you|are you|can you|could you|please)\b[\s\S]*)$/i);
  // The earliest outer body boundary wins. Punctuation or 'that' inside an
  // already-started body cannot turn its preceding words into a recipient.
  const boundary = [explicit, quoted, clause].filter((match): match is RegExpMatchArray => Boolean(match)).sort((a, b) => a[1]!.length - b[1]!.length)[0];
  if (boundary) return { type: "friend-message", recipientQuery: /^(?:him|her|them)$/i.test(boundary[1]!) && context.focusedPersonId ? undefined : literal(boundary[1]!), body: literal(boundary[2]!), allowBooking: /^tell\b/i.test(text) && literal(boundary[2]!) === boundary[2]!.trim() };
  return { type: "friend-message", recipientQuery: /^(?:him|her|them)[.!]?$/i.test(payload) && context.focusedPersonId ? undefined : literal(payload), body: "", allowBooking: /^tell\b/i.test(text) };
}
