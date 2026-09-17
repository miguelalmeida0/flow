import type { LifeContext } from "../../domain/life-model";
import type { FriendIntent } from "./friendIntents";
import type { ControllerOptions } from "../../app/lifeCommandController";
import type { TransactionSource } from "../day-planner/model";
import { resolvePeople, personLabel } from "./people";
import { messagesForRecipient } from "./deliveryProjection";
import { deliveryReceipts } from "./messaging";
import { DAY_END, DAY_START, formatTime } from "../day-planner/time";
import { parseDateExpression } from "../day-planner/interpretation/temporal";
import { sourceDateKey } from "../day-planner/interpretation/sourceDates";
import { previewFriendMessage } from "./friendController";
export type RelationshipIntent = { type: "friend-query"; operation: "messages" | "notes" | "memories" | "availability"; recipientQuery?: string; query?: string };
export function parseRelationshipQuery(text: string, context: LifeContext): RelationshipIntent | undefined {
  const said = text.match(/^what did (.+?) say(?: about (.+?))?[.!?]?$/i) ?? text.match(/^what happened with (.+?)[.!?]?$/i);
  if (said) return { type: "friend-query", operation: "messages", recipientQuery: said[1]!, query: said[2] };
  const recommended = text.match(/^what was (?:that |the )?(.+?) (.+?) recommended[.!?]?$/i);
  if (recommended) return { type: "friend-query", operation: "notes", recipientQuery: recommended[2]!, query: recommended[1]! };
  const memories = text.match(/^show (?:my )?memories with (.+?)[.!?]?$/i);
  if (memories) return { type: "friend-query", operation: "memories", recipientQuery: memories[1]! };
  const note = text.match(/^play (.+?)['’]s (?:latest|last) voice note[.!?]?$/i) ?? text.match(/^play (her|his|their) (?:latest|last) voice note[.!?]?$/i);
  if (note) return { type: "friend-query", operation: "notes", recipientQuery: /^(?:her|his|their)$/i.test(note[1]!) ? undefined : note[1]!, query: "latest" };
  const mentioned = text.match(/^(?:which|find the) voice note (?:mentioned|mentions|about) (.+?)[.!?]?$/i);
  if (mentioned) return { type: "friend-query", operation: "notes", query: mentioned[1]! };
  const available = text.match(/^(?:share|send) my availability (?:on )?(.+?) (?:with|to) (.+?)[.!?]?$/i);
  if (available) return { type: "friend-query", operation: "availability", recipientQuery: available[2]!, query: available[1]! };
  if (context.focusedPersonId && /^share my availability(?: (.+?))?[.!?]?$/i.test(text)) return { type: "friend-query", operation: "availability", query: text.replace(/^share my availability\s*/i, "") };
  return undefined;
}
export function runRelationshipQuery(intent: Extract<FriendIntent, { type: "friend-query" }>, options: ControllerOptions, transcript: string, source: TransactionSource, commandId: string) {
  const snapshot = options.getSnapshot(), document = snapshot.document, context = options.getContext(), today = snapshot.temporal?.todayDateKey ?? document.calendar.dateKey;
  const feedback = (title: string, detail: string) => options.setFeedback({ phase: "completed", title, detail, transcript });
  const people = intent.resolvedPersonId ? document.people.filter(({ id }) => id === intent.resolvedPersonId) : intent.recipientQuery ? resolvePeople(document.people, intent.recipientQuery) : document.people.filter(({ id }) => id === context.focusedPersonId);
  if (people.length !== 1 && !(intent.operation === "notes" && !intent.recipientQuery && intent.query !== "latest")) {
    const choices = people.slice(0, 3).map((person) => ({ id: person.id, label: personLabel(person) }));
    options.setPending({ actions: [], baseRevision: snapshot.revision, transcript, source, summary: "Choose a person", friend: { kind: "recipient", intent, choices, expiresAt: options.now().getTime() + 120_000 } }); options.updateContext({ pending: "clarification", friendPending: true, friendPendingKind: "recipient", pendingChoices: choices }); return options.setFeedback({ phase: "clarification", title: "Which person?", detail: choices.map(({ label }) => label).join(" · ") || "Name an existing friend.", transcript });
  }
  const person = people[0];
  if (person) options.updateContext({ focusedPersonId: person.id });
  if (intent.operation === "availability") {
    const target = parseDateExpression((intent.query ?? "").toLocaleLowerCase(), today), dateKey = /^today[.!]?$/i.test(intent.query ?? "") ? today : target ? sourceDateKey(target, today) : undefined;
    if (!dateKey) { options.setPending({ actions: [], baseRevision: snapshot.revision, transcript, source, summary: "What day should I share?", friend: { kind: "friend-followup", intent: { ...intent, resolvedPersonId: person!.id }, slot: "time", choices: [], expiresAt: options.now().getTime() + 120_000 } }); options.updateContext({ pending: "clarification", friendPending: true, friendPrompt: "friend" }); return feedback("What day should I share?", "Only free windows will be included, never event details."); }
    const plan = document.calendar.dateKey === dateKey ? document.calendar : document.calendars[dateKey];
    const blocks = [...(plan?.events ?? []).map(({ start, end }) => ({ start, end })), ...(plan?.breathingRooms?.filter(({ protected: fixed }) => fixed) ?? [])].sort((a, b) => a.start - b.start);
    let cursor = DAY_START; const windows: string[] = [];
    for (const block of [...blocks, { start: plan?.endBoundaryMinutes ?? DAY_END, end: DAY_END }]) { if (block.start - cursor >= 30) windows.push(`${formatTime(cursor)}–${formatTime(block.start)}`); cursor = Math.max(cursor, block.end); }
    const at = options.now().toISOString(), message = { id: `message-${commandId}`, recipient: { kind: "person" as const, id: person!.id }, recipientSnapshot: { name: personLabel(person!), people: [{ id: person!.id, name: personLabel(person!) }] }, body: windows.length ? `My Calendar has free windows on ${dateKey}: ${windows.slice(0, 3).join(", ")}.` : `I don't have a free 30-minute window on ${dateKey}.`, direction: "outgoing" as const, revision: 1, status: "draft" as const, idempotencyKey: `delivery-${commandId}`, createdAt: at, updatedAt: at };
    if (options.commit([{ type: "friend.message.create", message }], transcript, source, "Availability draft prepared privately.")) previewFriendMessage(options, message, transcript, source); return;
  }
  if (intent.operation === "memories") {
    const memories = document.studio.memories.filter((memory) => memory.personIds?.includes(person!.id));
    if (memories.length) { options.navigate("memories"); options.setFocusedEntityId(memories[0]!.id); options.updateContext({ activeMemoryId: memories[0]!.id }); }
    return feedback(`Memories with ${personLabel(person!)}`, memories.map(({ title }) => title).join(" · ") || "No Memories are linked to this person yet.");
  }
  const messages = person ? messagesForRecipient(document, deliveryReceipts(), { kind: "person", id: person.id }).filter(({ receipt, message }) => receipt || message.direction === "incoming") : [];
  if (intent.operation === "messages") {
    const matches = messages.filter(({ message }) => message.direction === "incoming" && (!intent.query || message.body.toLocaleLowerCase().includes(intent.query.toLocaleLowerCase())));
    options.updateContext({ activeMessageId: matches.length === 1 ? matches[0]!.message.id : undefined, activeVoiceNoteId: undefined, selectedVoiceMarkerId: undefined });
    return feedback(`Messages from ${personLabel(person!)}`, matches.slice(-3).map(({ message }) => message.body).join(" · ") || "There are no received messages matching that. Outgoing drafts are not evidence of what they said.");
  }
  const notes = document.friends!.voiceNotes.filter((note) => (!person || note.authorPersonId === person.id) && (intent.query === "latest" || `${note.title} ${note.text}`.toLocaleLowerCase().includes((intent.query ?? "").toLocaleLowerCase())));
  const shared = messages.filter(({ message }) => (!person || message.direction === "incoming" && message.authorPersonId === person.id) && message.attachment?.kind === "voice" && (intent.query === "latest" || `${message.attachment.title} ${message.attachment.text}`.toLocaleLowerCase().includes((intent.query ?? "").toLocaleLowerCase())));
  const newest = [...notes.map((note) => ({ at: note.createdAt, note, message: undefined })), ...shared.map(({ message }) => ({ at: message.createdAt, note: undefined, message }))].sort((a, b) => b.at.localeCompare(a.at))[0];
  const note = newest?.note, message = newest?.message;
  if (!note && !message) return feedback("No matching voice note", "There is no available recording containing that information.");
  options.navigate("people", undefined, false, "default"); options.updateContext({ focusedPersonId: person?.id ?? (note?.recipient.kind === "person" ? note.recipient.id : undefined), activeVoiceNoteId: note?.id, activeMessageId: note ? undefined : message?.id });
  if (intent.query === "latest") void import("../studio/studioPlayback").then(({ requestStudioPlayback }) => requestStudioPlayback({ target: "voice-note-playback", entryId: note?.id ?? message!.id, mode: "play" }, options.isCurrentCommand ?? (() => true))).catch(() => feedback("Playback needs attention", "Use the recording's Play control."));
  return feedback(note?.title ?? message!.attachment!.title, note?.text ?? message!.attachment!.text);
}
