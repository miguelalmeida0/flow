import type { ControllerOptions } from "../../app/lifeCommandController";
import type { FriendIntent } from "./friendIntents";
import type { LifeContext } from "../../domain/life-model";
import type { TransactionSource } from "../day-planner/model";
import { resolvePeople, personLabel } from "./people";
import { matchingGroups } from "./groupIntents";
import { messageEnvelope } from "./deliveryProjection";
import { deliveryReceipts } from "./messaging";
import { allCalendarEvents } from "../../domain/life-calendar-world";
import { parseEventReference } from "../day-planner/interpretation/references";
import { normalizeTranscript } from "../day-planner/interpretation/normalize";
import { resolveEventReference } from "../day-planner/scheduling/resolution";
import { journalVoiceMarkers } from "../studio/journalMarkers";
import { resolveVoiceMarkers } from "../studio/voiceMarkers";

export type MemorySocialIntent = { type: "friend-memory"; operation: "link" | "share" | "react"; memoryId?: string; recipientQuery?: string; personIds?: string[]; groupId?: string; eventQuery?: string; momentQuery?: string; momentKind?: "journal" | "voice-note"; calendarEventId?: string; recordingMoment?: { kind: "journal" | "voice-note"; recordingId: string; markerId: string }; messageId?: string; reaction?: "heart" | "laugh" };
export function parseMemorySocial(text: string, context: LifeContext): MemorySocialIntent | undefined {
  if (context.activeMessageId && /^(?:heart|love) (?:this|that)[.!]?$/i.test(text)) return { type: "friend-memory", operation: "react", messageId: context.activeMessageId, reaction: "heart" };
  if (context.activeMessageId && /^laugh (?:at )?(?:this|that)[.!]?$/i.test(text)) return { type: "friend-memory", operation: "react", messageId: context.activeMessageId, reaction: "laugh" };
  if (context.route !== "memories") return undefined;
  const event = text.match(/^(?:link|connect) (?:this|that)(?: memory)? to (?:the )?calendar event (.+?)[.!]?$/i);
  if (event) return { type: "friend-memory", operation: "link", memoryId: context.activeMemoryId, eventQuery: event[1]! };
  const moment = text.match(/^(?:link|connect) (?:this|that)(?: memory)? to (?:the )?(.+?) (journal|voice note) (?:marker|moment)[.!]?$/i);
  if (moment) return { type: "friend-memory", operation: "link", memoryId: context.activeMemoryId, momentQuery: moment[1]!, momentKind: moment[2]!.toLowerCase() === "journal" ? "journal" : "voice-note" };
  const share = text.match(/^(?:send|share) (?:this|that|the)(?: memory)? (?:with|to) (.+?)[.!]?$/i);
  if (share) return { type: "friend-memory", operation: "share", memoryId: context.activeMemoryId, recipientQuery: share[1]! };
  const link = text.match(/^(?:link|connect) (?:this|that|the)(?: memory)? (?:with|to) (.+?)[.!]?$/i);
  if (link) return { type: "friend-memory", operation: "link", memoryId: context.activeMemoryId, recipientQuery: link[1]! };
  return undefined;
}
export function runMemorySocial(intent: Extract<FriendIntent, { type: "friend-memory" }>, options: ControllerOptions, transcript: string, source: TransactionSource, commandId: string) {
  const snapshot = options.getSnapshot(), document = snapshot.document, context = options.getContext();
  const clarify = (title: string, detail: string) => options.setFeedback({ phase: "clarification", title, detail, transcript });
  if (intent.operation === "react") {
    const message = messageEnvelope(document, deliveryReceipts(), intent.messageId ?? context.activeMessageId ?? "");
    if (!message || !intent.reaction) return clarify("Which shared Memory?", "Open the received Memory before reacting.");
    if (document.friends!.reactions.some(({ messageId, reaction, personId }) => messageId === message.id && reaction === intent.reaction && !personId)) return;
    options.commit([{ type: "friend.reaction.add", reaction: { id: `reaction-${commandId}`, messageId: message.id, reaction: intent.reaction, at: options.now().toISOString() } }], transcript, source, "Reaction saved locally. No external provider is connected."); return;
  }
  const memory = document.studio.memories.find(({ id }) => id === (intent.memoryId ?? context.activeMemoryId ?? context.focusedEntityId)) ?? (!intent.memoryId && !context.activeMemoryId ? [...document.studio.memories].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] : undefined);
  if (!memory) return clarify("Which Memory?", "Open the Memory to share or link.");
  const wait = (slot: "event" | "moment", choices: Array<{ id: string; label: string }>, title: string) => {
    options.setPending({ actions: [], baseRevision: snapshot.revision, transcript, source, summary: title, friend: { kind: "friend-followup", intent: { ...intent, memoryId: memory.id }, slot, choices, expiresAt: options.now().getTime() + 120_000 } });
    options.updateContext({ friendPending: true, friendPendingKind: "friend-followup", pending: "clarification", pendingChoices: choices }); return clarify(title, choices.map(({ label }) => label).join(" · ") || "Name the existing source; nothing is linked yet.");
  };
  if (intent.eventQuery && !intent.calendarEventId) {
    const selector = parseEventReference(normalizeTranscript(intent.eventQuery));
    const result = selector && resolveEventReference({ ...document.calendar, dateKey: snapshot.temporal?.todayDateKey ?? document.calendar.dateKey, events: allCalendarEvents(document), deferred: [] }, selector, options.selectedCalendarEventId);
    if (!result || result.status !== "resolved" || result.events.length !== 1) return wait("event", result && result.status === "clarification" ? result.choices : [], "Which Calendar event should this Memory link to?");
    intent = { ...intent, calendarEventId: result.events[0]!.id };
  }
  if (intent.momentQuery && !intent.recordingMoment) {
    const kind = intent.momentKind ?? "journal";
    const sources = kind === "journal" ? document.studio.journalEntries.filter(({ id }) => id === memory.journalEntryId).map((entry) => ({ id: entry.id, title: entry.title, markers: journalVoiceMarkers(entry) })) : document.friends!.voiceNotes.filter(({ id }) => !context.activeVoiceNoteId || id === context.activeVoiceNoteId);
    const matches = sources.flatMap((recording) => resolveVoiceMarkers(recording.markers, intent.momentQuery).map((marker) => ({ source: { kind, recordingId: recording.id, markerId: marker.id }, label: `${recording.title} · ${marker.title}` })));
    if (matches.length !== 1) return wait("moment", matches.slice(0, 3).map(({ source, label }) => ({ id: JSON.stringify(source), label })), "Which recorded moment should this Memory link to?");
    intent = { ...intent, recordingMoment: matches[0]!.source };
  }
  const groups = intent.resolvedGroupId || intent.groupId ? document.friends!.groups.filter(({ id }) => id === (intent.resolvedGroupId ?? intent.groupId)) : intent.recipientQuery ? matchingGroups(document.friends!.groups, intent.recipientQuery) : [];
  const people = intent.resolvedPersonId ? document.people.filter(({ id }) => id === intent.resolvedPersonId) : intent.recipientQuery ? resolvePeople(document.people, intent.recipientQuery) : document.people.filter(({ id }) => intent.personIds?.includes(id));
  if (intent.operation === "link" && (intent.personIds || intent.calendarEventId || intent.recordingMoment || groups.length === 1 || people.length === 1)) {
    if (people.length && groups.length && !intent.resolvedGroupId && !intent.resolvedPersonId) return clarify("Person or group?", "Choose the exact person or group in this Memory's links.");
    options.commit([{ type: "memory.update", memoryId: memory.id, patch: { ...(people.length ? { personIds: [...new Set([...(memory.personIds ?? []), ...people.map(({ id }) => id)])] } : {}), ...(groups.length === 1 ? { groupId: groups[0]!.id } : {}), ...(intent.calendarEventId ? { calendarEventId: intent.calendarEventId } : {}), ...(intent.recordingMoment ? { recordingMoment: intent.recordingMoment } : {}) } }], transcript, source, "Memory links saved privately. Nothing was shared."); return;
  }
  if (groups.length !== 1 && people.length !== 1 || groups.length && people.length) {
    const choices = people.slice(0, 3).map((person) => ({ id: person.id, label: personLabel(person) }));
    options.setPending({ actions: [], transcript, source, summary: "Choose a Memory recipient", baseRevision: snapshot.revision, friend: { kind: "recipient", intent: { ...intent, memoryId: memory.id }, choices, expiresAt: options.now().getTime() + 120_000 } });
    options.updateContext({ friendPending: true, friendPendingKind: "recipient", pending: "clarification", pendingChoices: choices }); return clarify("Who should receive this Memory?", choices.length ? choices.map(({ label }) => label).join(" · ") : "Name an existing friend or private group.");
  }
  options.prepareMemoryShare?.({ ...intent, memoryId: memory.id, ...(groups.length === 1 ? { resolvedGroupId: groups[0]!.id } : { resolvedPersonId: people[0]!.id }) }, transcript, source);
}
