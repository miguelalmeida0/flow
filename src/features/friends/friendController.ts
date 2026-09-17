import type { ControllerOptions } from "../../app/lifeCommandController";
import type { PendingLifeChange } from "../../app/environment-types";
import type { TransactionSource } from "../day-planner/model";
import type { FriendIntent } from "./friendIntents";
import type { FriendMessage, Recipient } from "../../domain/friends-model";
import { canonicalPerson, personLabel, resolvePeople } from "./people";
import { deliveryReceipts } from "./messaging";
import { peopleWithDeliveryHistory } from "./deliveryProjection";
import { bookingRequest, proposeCalendarMessage, refineCalendarProposal, calendarProposalMessage } from "./calendarProposal";
import type { CalendarRequest } from "../day-planner/model";
import { bindCalendarParticipants } from "./calendarParticipants";
import { requestStudioRecording } from "../studio/recordingRequest";
import { requestStudioPlayback } from "../studio/studioPlayback";
import { journalRuntimePosition, recordingTranscriptRanges } from "../studio/journalRuntimeClock";
import { runMarkerCommand } from "../studio/markerController";
import { refineDraftTone } from "./draftTone";
import { allCalendarEvents } from "../../domain/life-calendar-world";
import { eventDateLabel } from "../day-planner/scheduling/resolution";
import { formatTime } from "../day-planner/time";
import { composeGroup, openFriendGroup, runGroupCommand } from "./groupController";
import { matchingGroups } from "./groupIntents";
import { messageEnvelope, messagesForRecipient } from "./deliveryProjection";
import { runMemorySocial } from "./memorySocial";
import { runRelationshipQuery } from "./relationshipQueries";
import { runPersonPlan } from "./personPlan";
import { parseClockExpression } from "../day-planner/interpretation/temporal";
import { normalizeTranscript } from "../day-planner/interpretation/normalize";

export function runFriendCommand(intent: FriendIntent, options: ControllerOptions, transcript: string, source: TransactionSource, commandId: string, runCalendar?: (request: CalendarRequest) => void): void {
  if (intent.replyToMessageId === "") {
    const snapshot = options.getSnapshot(), context = options.getContext();
    const recipient: Recipient | undefined = context.focusedGroupId ? { kind: "group", id: context.focusedGroupId } : context.focusedPersonId ? { kind: "person", id: context.focusedPersonId } : undefined;
    const candidates = recipient ? messagesForRecipient(snapshot.document, deliveryReceipts(), recipient).filter(({ receipt, message }) => receipt || message.direction === "incoming") : [];
    const choices = candidates.slice(-3).map(({ message }) => ({ id: message.id, label: `${message.attachment?.title || message.body.slice(0, 60)} · ${message.createdAt.slice(0, 10)}` }));
    if (choices.length) {
      options.setPending({ actions: [], baseRevision: snapshot.revision, transcript, source, summary: "Choose the shared message to reply to", friend: { kind: "friend-followup", slot: "message", intent, choices, expiresAt: options.now().getTime() + 120_000 } });
      options.updateContext({ friendPending: true, friendPendingKind: "friend-followup", friendPrompt: "friend", pending: "clarification", pendingChoices: choices });
    }
    options.setFeedback({ phase: "clarification", title: choices.length ? "Which shared message are you replying to?" : "No shared reply target is selected", detail: choices.length ? choices.map(({ label }, index) => `${index + 1}. ${label}`).join(" · ") : "Open a friend's shared message before replying. No draft or recording was created.", transcript }); return;
  }
  if (intent.replyToMessageId !== undefined) {
    const envelope = messageEnvelope(options.getSnapshot().document, deliveryReceipts(), intent.replyToMessageId);
    const recipient = envelope?.recipient.kind === "group" ? { resolvedGroupId: envelope.recipient.id } : envelope ? { resolvedPersonId: envelope.authorPersonId ?? envelope.recipient.id } : undefined;
    if (!envelope || !recipient || intent.replyToMarkerId && !envelope.attachment?.markers?.some(({ id }) => id === intent.replyToMarkerId)
      || intent.resolvedPersonId && intent.resolvedPersonId !== recipient.resolvedPersonId || intent.resolvedGroupId && intent.resolvedGroupId !== recipient.resolvedGroupId) {
      options.setFeedback({ phase: "clarification", title: "That reply target changed", detail: "Open the shared message again before replying. No draft or recording was created.", transcript }); return;
    }
    intent = { ...intent, ...recipient };
  }
  if (intent.type === "friend-playback") {
    const context = options.getContext(), entryId = context.activeVoiceNoteId ?? context.activeMessageId;
    if (!entryId) return;
    const playback = intent.playback;
    if (playback.mode === "configure" && (playback.settings.volume !== undefined && (playback.settings.volume < 0 || playback.settings.volume > 1) || playback.settings.playbackRate !== undefined && (playback.settings.playbackRate < 0.25 || playback.settings.playbackRate > 4))) { options.setFeedback({ phase: "clarification", title: "Choose supported playback settings", detail: "Volume is 0–100 percent and speed is 0.25–4 times.", transcript }); return; }
    const isCurrent = options.isCurrentCommand ?? (() => true);
    const command = playback.mode === "configure" ? { target: "voice-note-playback" as const, entryId, mode: "configure" as const, settings: playback.settings } : { target: "voice-note-playback" as const, entryId, mode: playback.mode, positionMs: playback.positionMs };
    void requestStudioPlayback(command, isCurrent).then(() => { if (isCurrent()) options.setFeedback({ phase: "completed", title: "Playback updated", detail: "The original audio is unchanged.", transcript }); }).catch((error: unknown) => { if (isCurrent()) options.setFeedback({ phase: "clarification", title: "Playback needs attention", detail: error instanceof Error ? error.message : "The original audio is unavailable.", transcript }); });
    return;
  }
  if (intent.type === "friend-group") return runGroupCommand(intent, options, transcript, source, commandId);
  if (intent.type === "friend-memory") return runMemorySocial(intent, options, transcript, source, commandId);
  if (intent.type === "friend-query") return runRelationshipQuery(intent, options, transcript, source, commandId);
  if (intent.type === "friend-plan") return runPersonPlan(intent, options, transcript, source, commandId);
  if (intent.type === "friend-marker-answer") {
    const pending = options.getPending();
    if (pending?.friend?.kind === "reply-dictation") {
      if (pending.baseRevision !== options.getSnapshot().revision || pending.friend.expiresAt < options.now().getTime()) { options.setPending(undefined); options.setFeedback({ phase: "clarification", title: "That reply question expired", detail: "Select the shared moment again before replying.", transcript }); return; }
      return runFriendCommand({ ...pending.friend.intent, body: intent.value }, options, transcript, source, commandId, runCalendar);
    }
    if (pending?.friend?.kind === "recipient" && pending.baseRevision === options.getSnapshot().revision && pending.friend.expiresAt >= options.now().getTime()) { const original = pending.friend.intent; return runFriendCommand({ ...original, ...(original.type === "friend-person" ? { query: intent.value } : { recipientQuery: intent.value }), resolvedPersonId: undefined }, options, transcript, source, commandId, runCalendar); }
    if (pending?.friend?.kind === "friend-followup" && pending.baseRevision === options.getSnapshot().revision && pending.friend.expiresAt >= options.now().getTime()) {
      const authority = pending.friend;
      if (authority.slot === "message") {
        const query = normalizeTranscript(intent.value), matches = authority.choices.filter(({ label }) => normalizeTranscript(label) === query || normalizeTranscript(label.split(" · ")[0]!) === query);
        if (matches.length === 1) return runFriendCommand({ ...authority.intent, replyToMessageId: matches[0]!.id }, options, transcript, source, commandId, runCalendar);
        options.setFeedback({ phase: "clarification", title: "Which shared message are you replying to?", detail: authority.choices.map(({ label }, index) => `${index + 1}. ${label}`).join(" · "), transcript }); return;
      }
      if (authority.intent.type === "friend-query") return runRelationshipQuery({ ...authority.intent, query: intent.value }, options, transcript, source, commandId);
      if (authority.intent.type === "friend-memory") return runMemorySocial({ ...authority.intent, ...(authority.slot === "event" ? { eventQuery: intent.value } : { momentQuery: intent.value }) }, options, transcript, source, commandId);
      if (authority.intent.type === "friend-plan") return runPersonPlan({ ...authority.intent, value: intent.value }, options, transcript, source, commandId);
      if (authority.intent.type === "friend-group") {
        const patch = authority.slot === "group" ? { query: intent.value, groupId: undefined } : authority.slot === "member" ? authority.intent.operation === "record-reply" ? { personQuery: intent.value } : { members: [intent.value, ...(authority.intent.members?.slice(1) ?? [])] } : { value: intent.value };
        return runGroupCommand({ ...authority.intent, ...patch }, options, transcript, source, commandId);
      }
    }
    if (pending?.friend?.kind !== "marker-action" || pending.friend.expiresAt < options.now().getTime() || pending.baseRevision !== options.getSnapshot().revision) return;
    const authority = pending.friend;
    const patch = authority.stage === "recipient" ? { recipientQuery: intent.value, recipientId: undefined } : authority.stage === "payload" ? { payload: /^(?:the )?(?:voice|audio)(?: clip)?[.!]?$/i.test(intent.value) ? "voice" as const : /^(?:the )?text[.!]?$/i.test(intent.value) ? "text" as const : undefined } : authority.stage === "time" ? { timeAnswer: intent.value } : { direction: /^(?:i|me|i owe(?: this)?|my promise)[.!]?$/i.test(intent.value) ? "owed-by-me" as const : /^(?:them|they(?: owe this)?|their promise|waiting)[.!]?$/i.test(intent.value) ? "waiting-on" as const : undefined };
    return runMarkerCommand({ ...authority.intent, ...patch }, options, transcript, source, commandId);
  }
  if (intent.type === "recording-marker") return runMarkerCommand(intent, options, transcript, source, commandId);
  const document = options.getSnapshot().document;
  const now = options.now();
  const at = now.toISOString();
  const expiresAt = now.getTime() + 120_000;
  const context = options.getContext();
  const pending = options.getPending();
  const feedback = (title: string, detail: string, phase: "completed" | "clarification" | "confirmation" = "completed") => options.setFeedback({ phase, title, detail, transcript });
  const wait = (value: PendingLifeChange, title: string, detail: string) => {
    options.setPending({ ...value, baseRevision: options.getSnapshot().revision });
    options.updateContext({ friendPending: true, friendPendingKind: value.friend?.kind, pending: value.friend?.kind === "recipient" ? "clarification" : "confirmation", pendingChoices: value.friend?.kind === "recipient" ? value.friend.choices : value.friend?.kind === "calendar-message" ? value.friend.proposal.choices : undefined });
    feedback(title, detail, value.friend?.kind === "recipient" || value.friend?.kind === "unknown-person" ? "clarification" : "confirmation");
  };
  const base = { actions: [], transcript, source, summary: "Review this Friends request" };
  const openPerson = (id: string) => { options.navigate("people", undefined, false, "default"); options.setFocusedEntityId(id); options.updateContext({ focusedPersonId: id, focusedGroupId: undefined, topic: "person", ...(options.getContext().focusedPersonId !== id ? { activeVoiceNoteId: undefined, activeMessageId: undefined, selectedVoiceMarkerId: undefined } : {}) }); };
  const previewMessage = (message: FriendMessage) => {
    if (message.recipient.kind === "person") openPerson(message.recipient.id);
    options.updateContext({ activeMessageId: message.id, selectedVoiceMarkerId: undefined });
    const recipient = document.people.find(({ id }) => id === message.recipient.id);
    wait({ ...base, friend: { kind: "message", messageId: message.id, messageRevision: message.revision, expiresAt }, confirmLabel: "Send locally", summary: `Send to ${recipient ? personLabel(recipient) : "this group"}` }, `Message to ${recipient ? personLabel(recipient) : "this group"}`, `${message.body || "What should the message say?"} · Flow-local delivery. Review or send this draft.`);
  };
  if (intent.type === "friend-plans") {
    const people = intent.resolvedPersonId ? document.people.filter(({ id }) => id === intent.resolvedPersonId) : intent.recipientQuery ? resolvePeople(document.people, intent.recipientQuery) : document.people.filter(({ id }) => id === context.focusedPersonId);
    if (people.length !== 1) return wait({ ...base, friend: { kind: "recipient", intent, choices: people.slice(0, 3).map((person) => ({ id: person.id, label: personLabel(person) })), expiresAt } }, "Which person?", "Name the person whose plans you want to see.");
    const personId = people[0]!.id;
    const events = allCalendarEvents(document).filter((event) => event.participantIds?.includes(personId) && event.dateKey >= (options.getSnapshot().temporal?.todayDateKey ?? document.calendar.dateKey) && (!intent.eventId || event.id === intent.eventId)).sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.start - b.start);
    if (events.length !== 1) { options.setSelectedCalendarEventId(undefined); const choices = events.slice(0, 3).map((event) => ({ id: event.id, label: `${event.title} · ${eventDateLabel(event.dateKey)} at ${formatTime(event.start)}` })); if (choices.length) { options.setPending({ ...base, baseRevision: options.getSnapshot().revision, friend: { kind: "friend-followup", slot: "event", intent: { ...intent, resolvedPersonId: personId }, choices, expiresAt } }); options.updateContext({ pending: "clarification", friendPending: true, friendPendingKind: "friend-followup", pendingChoices: choices }); } return feedback(events.length ? "Which shared plan?" : "No upcoming shared plans", choices.map(({ label }) => label).join(" · ") || "There are no matching Calendar events linked to this person.", "clarification"); }
    const event = events[0]!;
    options.navigate("today"); options.setTemporalScope({ kind: "day", dateKey: event.dateKey }); options.setSelectedCalendarEventId(event.id);
    options.updateContext({ focusedPersonId: personId });
    return feedback(event.title, `${eventDateLabel(event.dateKey)} at ${formatTime(event.start)}. This event is selected.`);
  }
  if (intent.type === "friend-voice" && intent.operation !== "create") {
    const note = intent.text === "latest" ? document.friends?.voiceNotes.filter(({ recipient }) => recipient.id === (context.focusedGroupId ?? context.focusedPersonId)).at(-1) : document.friends?.voiceNotes.find(({ id }) => id === (intent.noteId ?? context.activeVoiceNoteId));
    if (intent.text === "latest" && !note) {
      const recipient: Recipient | undefined = context.focusedGroupId ? { kind: "group", id: context.focusedGroupId } : context.focusedPersonId ? { kind: "person", id: context.focusedPersonId } : undefined;
      const message = recipient ? messagesForRecipient(document, deliveryReceipts(), recipient).filter(({ message }) => message.attachment?.kind === "voice").at(-1)?.message : undefined;
      if (message) { options.updateContext({ activeMessageId: message.id, activeVoiceNoteId: undefined }); void requestStudioPlayback({ target: "voice-note-playback", entryId: message.id, mode: "play" }, options.isCurrentCommand ?? (() => true)).catch(() => feedback("Playback needs attention", "Use the shared recording's Play control.", "clarification")); return; }
    }
    if (!note) return feedback("Which voice note?", "Open a note or name the person it is for.", "clarification");
    if (intent.operation === "open") { if (note.recipient.kind === "group") openFriendGroup(options, note.recipient.id); else openPerson(note.recipient.id); options.updateContext({ activeVoiceNoteId: note.id }); if (intent.text === "latest") void requestStudioPlayback({ target: "voice-note-playback", entryId: note.id, mode: "play" }, options.isCurrentCommand ?? (() => true)).catch(() => feedback("Playback needs attention", "Use the recording's Play control.", "clarification")); return; }
    if (intent.operation === "append") {
      const position = journalRuntimePosition(note.id) ?? note.recordingDurationMs;
      const ranges = recordingTranscriptRanges(note.id, intent.text ?? "", position, source === "voice" ? "voice" : "typed");
      options.commit(ranges.map((range, index) => ({ type: "recording.segment.add", target: { kind: "voice-note", id: note.id }, segment: { ...range, id: `note-passage-${commandId}-${index}`, source: source === "voice" ? "voice" : "typed" } })), transcript, source, "Voice note updated.");
      return;
    }
    if (intent.operation === "send") { options.prepareVoiceNote?.(note.id, transcript, source); return; }
    if (intent.operation === "delete-tail") { options.prepareVoiceNote?.(note.id, transcript, source, "delete-tail-review"); return; }
    if (intent.operation === "delete-tail-review") {
      const last = note.transcriptSegments.at(-1);
      if (!note.audioAssetId || !last || last.startMs <= 0 || last.alignment !== "segment-estimate") return feedback("I can't isolate a safe last part", "There is no separate timed final passage. Keep the original, or discard this note and record it again.", "clarification");
      return wait({ ...base, friend: { kind: "voice-edit", noteId: note.id, assetId: note.audioAssetId, cutAtMs: last.startMs, expiresAt }, summary: "Last part removed from voice note", confirmLabel: "Remove last part" }, "Remove the last part from the audio?", `“${last.text}” and the recording after it will be removed from this draft. The unedited original stays private.`);
    }
    if (intent.operation === "review") {
      if (note.recordingState !== "idle" || !note.audioAssetId) return feedback("Finish this recording first", "No message has been prepared.", "clarification");
      const person = document.people.find(({ id }) => id === note.recipient.id);
      const message: FriendMessage = { id: `message-${commandId}`, recipient: note.recipient, recipientSnapshot: { name: person ? personLabel(person) : "Group", people: person ? [{ id: person.id, name: personLabel(person) }] : [] }, direction: "outgoing", body: note.text, ...replyBinding(options, note), revision: 1, status: "draft", idempotencyKey: `delivery-${commandId}`, attachment: { kind: "voice", assetId: note.audioAssetId, title: note.title, text: note.text, durationMs: note.recordingDurationMs, markers: note.markers.filter(({ status }) => status === "kept").map((marker, index) => ({ id: `shared-moment-${commandId}-${index}`, kind: marker.kind, title: marker.title, excerpt: marker.excerpt, startMs: marker.startMs, endMs: marker.endMs })) }, createdAt: at, updatedAt: at };
      if (options.commit([{ type: "friend.message.create", message }], transcript, source, "Voice note ready to review")) previewFriendMessage(options, message, transcript, source);
      return;
    }
    if (intent.operation === "discard") return wait({ ...base, actions: [{ type: "voice-note.delete", noteId: note.id }], summary: "Voice note removed", confirmLabel: "Discard note" }, "Discard this voice note?", "The original remains available through Undo. No message will be sent.");
    const isCurrent = options.isCurrentCommand ?? (() => true);
    const completion = intent.operation === "play" ? requestStudioPlayback({ target: "voice-note-playback", entryId: note.id, mode: "play" }, isCurrent)
      : requestStudioRecording({ kind: "voice-note", id: note.id }, intent.operation, isCurrent);
    void completion.catch((error: unknown) => { if (isCurrent()) feedback("Recording needs attention", error instanceof Error ? error.message : "The recording could not continue.", "clarification"); });
    return;
  }
  if (intent.type === "friend-open") { options.updateContext({ friendsCollection: intent.collection ?? "Recent" }); options.navigate("people", undefined, false, "default"); options.setFocusedEntityId(undefined); options.updateContext({ focusedPersonId: undefined, focusedGroupId: undefined, activeVoiceNoteId: undefined, activeMessageId: undefined, selectedVoiceMarkerId: undefined }); return feedback("Friends", "Your real people, messages, plans, and moments."); }
  if (intent.type === "friend-draft") {
    if (pending?.friend?.kind === "marker-calendar") {
      const authority = pending.friend;
      if (intent.operation === "send") return options.confirm();
      const request = intent.request ?? refineCalendarProposal(authority.proposal, intent.value ?? "", options.getSnapshot().temporal?.todayDateKey ?? document.calendar.dateKey);
      if (request) return runMarkerCommand({ ...authority.intent, request }, options, transcript, source, commandId);
      return feedback(authority.proposal.question ?? "Review this plan", authority.proposal.detail, "clarification");
    }
    if (pending?.friend?.kind === "calendar-message") {
      const authority = pending.friend;
      if (authority.expiresAt < now.getTime()) { options.setPending(undefined); return feedback("That preview expired", "Repeat the request to review the current calendar.", "clarification"); }
      if (intent.operation === "send" || intent.operation === "retry") return options.confirm();
      if (intent.operation === "read") return options.setFeedback({ phase: "confirmation", title: "Message draft", detail: authority.message.body, transcript, speechKey: commandId });
      if (intent.operation === "calendar-refine") {
        const request = intent.request ?? refineCalendarProposal(authority.proposal, intent.value ?? "", options.getSnapshot().temporal?.todayDateKey ?? document.calendar.dateKey);
        if (!request) {
          const choices = /^(?:leave|keep)\b/i.test(intent.value ?? "") ? authority.proposal.choices.filter(({ id }) => !id.startsWith("move-")) : authority.proposal.choices;
          return wait({ ...pending, friend: { ...authority, proposal: { ...authority.proposal, choices } } }, "Which alternative should I use?", choices.map(({ label }) => label).join(" · ") || "Name a clear day and time. Nothing changed.");
        }
        return reviewCalendarMessage(options, { ...authority.message, body: calendarProposalMessage(authority.message.body, authority.proposal.request, request, options.getSnapshot().temporal?.todayDateKey ?? document.calendar.dateKey), revision: authority.message.revision + 1 }, request, transcript, source, authority.deliver);
      }
      const body = intent.operation === "tone" ? refineDraftTone(authority.message.body, intent.value ?? "", document.people.find(({ id }) => id === authority.message.recipient.id)?.name ?? "there") : intent.operation === "append" ? `${authority.message.body} ${intent.value ?? ""}` : intent.value ?? authority.message.body;
      return reviewCalendarMessage(options, { ...authority.message, body, revision: authority.message.revision + 1 }, authority.proposal.request, transcript, source, authority.deliver);
    }
    if (pending?.friend?.kind !== "message" || pending.friend.expiresAt < now.getTime()) return feedback("No current message draft", "Open or create a draft first.", "clarification");
    const authority = pending.friend;
    const draft = document.friends?.messages.find(({ id }) => id === authority.messageId);
    if (!draft || draft.revision !== authority.messageRevision) { options.setPending(undefined); return feedback("That draft changed", "Review the current draft before sending.", "clarification"); }
    if (intent.operation === "send" || intent.operation === "retry") return options.confirm();
    if (intent.operation === "read") return options.setFeedback({ phase: "confirmation", title: "Message draft", detail: draft.body, transcript, speechKey: commandId });
    if (deliveryReceipts().some(({ idempotencyKey }) => idempotencyKey === draft.idempotencyKey)) return feedback("That message was already delivered locally", "Create a new message to add anything else.", "clarification");
    const body = intent.operation === "tone" ? refineDraftTone(draft.body, intent.value ?? "", document.people.find(({ id }) => id === draft.recipient.id)?.name ?? "there") : intent.operation === "append" ? `${draft.body}${draft.body ? " " : ""}${intent.value ?? ""}` : intent.value ?? "";
    if (body === draft.body && intent.operation === "tone") return feedback("What wording would you prefer?", "Say “Change it to” followed by your words. The current draft is unchanged.", "confirmation");
    if (options.commit([{ type: "friend.message.update", messageId: draft.id, expectedRevision: draft.revision, patch: { body } }], transcript, source, "Message draft updated")) previewMessage({ ...draft, body, revision: draft.revision + 1 });
    return;
  }
  if (intent.type === "friend-person" && intent.operation === "create") {
    if (!intent.query.trim()) return feedback("What is their name?", "Add the name you use for this person.", "clarification");
    const person = canonicalPerson({ id: `person-${commandId}`, kind: "person", name: intent.query, createdAt: at, updatedAt: at });
    if (options.commit([{ type: "person.create", person }], transcript, source, `Added ${personLabel(person)} to Friends`)) openPerson(person.id);
    return;
  }
  const query = intent.type === "friend-person" ? intent.query : intent.type === "friend-message" || intent.type === "friend-calendar" || intent.type === "friend-voice" ? intent.recipientQuery : undefined;
  const groups = intent.resolvedGroupId ? document.friends!.groups.filter(({ id }) => id === intent.resolvedGroupId) : query ? matchingGroups(document.friends?.groups ?? [], query) : intent.type === "friend-reply" || intent.type === "friend-message" ? document.friends!.groups.filter(({ id }) => id === context.focusedGroupId) : [];
  const namePeople = query ? resolvePeople(document.people, query) : [];
  if (groups.length && (!intent.resolvedPersonId || intent.resolvedGroupId)) {
    if (groups.length !== 1 || namePeople.length && !intent.resolvedGroupId) return feedback("Person or private group?", "That name identifies more than one recipient. Open the exact conversation first.", "clarification");
    return composeGroup(intent, groups[0]!, options, transcript, source, commandId);
  }
  const replyEnvelope = intent.replyToMessageId ? messageEnvelope(document, deliveryReceipts(), intent.replyToMessageId) : undefined;
  const resolvedId = intent.resolvedPersonId ?? (replyEnvelope?.recipient.kind === "person" ? replyEnvelope.authorPersonId ?? replyEnvelope.recipient.id : undefined);
  if (intent.type === "friend-person" && intent.operation === "open" && resolvedId && !document.people.some(({ id }) => id === resolvedId)) {
    const archived = peopleWithDeliveryHistory(document, deliveryReceipts()).find(({ id }) => id === resolvedId);
    if (archived) { openPerson(archived.id); return feedback(personLabel(archived), "Archived delivery history. Add the contact again before composing anything new."); }
  }
  const repliedMessage = intent.type === "friend-reply" && (intent.replyToMessageId ?? context.activeMessageId) ? messageEnvelope(document, deliveryReceipts(), (intent.replyToMessageId ?? context.activeMessageId)!) : undefined;
  const people = resolvedId ? document.people.filter(({ id }) => id === resolvedId) : query ? resolvePeople(document.people, query) : document.people.filter(({ id }) => id === (repliedMessage?.authorPersonId ?? context.focusedPersonId));
  if (people.length !== 1) {
    if (!people.length) return wait({ ...base, friend: { kind: "unknown-person", intent, query: query ?? "", expiresAt }, confirmLabel: "Add contact" }, query ? `I don't have ${query} in Friends.` : "Who is this for?", query ? `Add ${query} as a local contact, or name an existing person.` : "Name a person in Friends.");
    const choices = people.slice(0, 3).map((person) => ({ id: person.id, label: personLabel(person) }));
    return wait({ ...base, friend: { kind: "recipient", intent, choices, expiresAt } }, "Which person do you mean?", choices.map(({ label }, index) => `${index + 1}. ${label}`).join(" · "));
  }
  const person = people[0]!;
  if (intent.type === "friend-voice") {
    return createFriendVoiceNote(options, { kind: "person", id: person.id }, personLabel(person), transcript, source, commandId, intent);
  }
  if (intent.type === "friend-calendar") {
    const bound = bindCalendarParticipants(intent.request, [person]);
    if ("request" in bound) return runCalendar?.(bound.request);
    return feedback(bound.question, bound.detail, "clarification");
  }
  if (intent.type === "friend-person") {
    if (intent.operation === "open") { openPerson(person.id); return feedback(personLabel(person), "Messages, shared plans, and commitments."); }
    if (intent.operation === "alias") {
      if (options.commit([{ type: "person.update", personId: person.id, patch: { aliases: [...(person.aliases ?? []), intent.alias ?? ""] } }], transcript, source, `Added ${intent.alias} as a name for ${personLabel(person)}`)) openPerson(person.id);
      return;
    }
    return wait({ ...base, actions: [{ type: "person.update", personId: person.id, patch: { archived: true } }], friend: { kind: "person-archive", personId: person.id, expiresAt }, confirmLabel: "Archive contact", summary: `Archived ${personLabel(person)}` }, `Archive ${personLabel(person)}?`, "Their existing commitments, calendar links, and delivered messages remain available.");
  }
  if (intent.type === "friend-message" || intent.type === "friend-reply") {
    const message: FriendMessage = { id: `message-${commandId}`, recipient: { kind: "person", id: person.id }, recipientSnapshot: { name: personLabel(person), people: [{ id: person.id, name: personLabel(person) }] }, direction: "outgoing", body: intent.body, ...(intent.type === "friend-message" && intent.attachment ? { attachment: intent.attachment } : {}), revision: 1, status: "draft", idempotencyKey: `delivery-${commandId}`, createdAt: at, updatedAt: at, ...(intent.type === "friend-reply" ? replyBinding(options, intent, true) : {}) };
    const request = intent.type === "friend-message" && intent.allowBooking ? bookingRequest(message.body, person, options.getSnapshot().temporal?.todayDateKey ?? document.calendar.dateKey) : undefined;
    if (request) return reviewCalendarMessage(options, message, request, transcript, source);
    const moved = intent.type === "friend-message" && intent.allowBooking ? message.body.match(/^(?:the|our) meeting (?:has )?moved to (.+)$/i) : undefined;
    if (moved || intent.type === "friend-message" && intent.allowBooking && !message.body && options.selectedCalendarEventId) {
      const events = allCalendarEvents(document).filter((event) => event.participantIds?.includes(person.id) && (!(intent.type === "friend-message" && intent.eventId || options.selectedCalendarEventId) || event.id === (intent.type === "friend-message" && intent.eventId || options.selectedCalendarEventId)));
      if (events.length !== 1) { const choices = events.slice(0, 3).map((event) => ({ id: event.id, label: `${event.title} · ${eventDateLabel(event.dateKey)} at ${formatTime(event.start)}` })); options.setPending({ ...base, baseRevision: options.getSnapshot().revision, friend: { kind: "friend-followup", intent, slot: "event", choices, expiresAt } }); options.updateContext({ pending: "clarification", friendPending: true, pendingChoices: choices }); return feedback("Which meeting with this person?", choices.map(({ label }) => label).join(" · ") || "Select the linked Calendar event first.", "clarification"); }
      const event = events[0]!, clock = parseClockExpression(normalizeTranscript(moved?.[1] ?? ""));
      if (moved && clock.status !== "found") return feedback("What time did the meeting move to?", "Name an exact time. No message was prepared.", "clarification");
      if (moved && clock.status === "found") return reviewCalendarMessage(options, message, { transcript, normalized: normalizeTranscript(transcript), actions: [{ type: "move", selector: { type: "id", id: event.id, date: { dateKey: event.dateKey } }, destination: { type: "absolute", minutes: clock.minutes, date: { dateKey: event.dateKey } } }], constraints: [] }, transcript, source);
      message.body = `${event.title} is on ${eventDateLabel(event.dateKey)} at ${formatTime(event.start)}.`; message.calendarEventId = event.id;
    }
    if (options.commit([...(intent.type === "friend-message" && intent.asset ? [{ type: "media.register" as const, asset: intent.asset }] : []), { type: "friend.message.create", message }], transcript, source, `Drafted a message to ${personLabel(person)}`)) previewMessage(message);
  }
}

export function reviewCalendarMessage(options: ControllerOptions, message: FriendMessage, request: CalendarRequest, transcript: string, source: TransactionSource, deliver = true) {
  const snapshot = options.getSnapshot();
  const proposal = proposeCalendarMessage(snapshot.document, request, snapshot.temporal?.todayDateKey ?? snapshot.document.calendar.dateKey, options.now);
  const linkedMessage = { ...message, ...(proposal.event ? { calendarEventId: proposal.event.id } : {}) };
  const title = proposal.question ?? (deliver ? "Book this and deliver the message locally?" : "Add this plan to Calendar?");
  options.setPending({ friend: { kind: "calendar-message", message: linkedMessage, proposal, deliver, expiresAt: options.now().getTime() + 120_000 }, actions: proposal.question ? [] : [...(proposal.existingEventId ? [] : [{ type: "calendar.request" as const, request, confirmed: true }]), ...(message.groupPlanId && proposal.event ? [{ type: "friend.group-plan.update" as const, planId: message.groupPlanId, patch: { status: "confirmed" as const, calendarEventId: proposal.event.id, selectedOptionId: "selected", options: [...(snapshot.document.friends?.groupPlans.find(({ id }) => id === message.groupPlanId)?.options.filter(({ id }) => id !== "selected") ?? []), { id: "selected", dateKey: proposal.event.dateKey, startMinutes: proposal.event.start }] } }] : []), ...(deliver ? [{ type: "friend.message.create" as const, message: linkedMessage }] : [])], baseRevision: snapshot.revision, transcript, source, summary: proposal.detail, confirmLabel: deliver ? "Book and send locally" : "Add plan" });
  options.updateContext({ friendPending: true, friendPendingKind: "calendar-message", pending: proposal.question ? "clarification" : "confirmation", pendingChoices: proposal.choices, focusedPersonId: message.recipient.kind === "person" ? message.recipient.id : undefined });
  options.setFeedback({ phase: proposal.question ? "clarification" : "confirmation", title, detail: deliver ? `${proposal.detail} Message: ${linkedMessage.body} · Flow-local delivery only.` : `${proposal.detail} No message will be sent.`, transcript });
}

export function previewFriendMessage(options: ControllerOptions, message: FriendMessage, transcript: string, source: TransactionSource) {
  if (message.recipient.kind === "group") openFriendGroup(options, message.recipient.id);
  else { options.navigate("people", undefined, false, "default"); options.setFocusedEntityId(message.recipient.id); options.updateContext({ focusedPersonId: message.recipient.id, focusedGroupId: undefined }); }
  const label = message.recipientSnapshot?.name ?? "this recipient";
  options.setPending({ actions: [], baseRevision: options.getSnapshot().revision, transcript, source, summary: `Send to ${label}`, confirmLabel: "Send locally", friend: { kind: "message", messageId: message.id, messageRevision: message.revision, expiresAt: options.now().getTime() + 120_000 } });
  options.updateContext({ activeMessageId: message.id, friendPending: true, friendPendingKind: "message", pending: "confirmation" });
  options.setFeedback({ phase: "confirmation", title: `Message to ${label}`, detail: `${message.body || message.attachment?.title || "What should the message say?"} · Flow-local delivery. Review or send this draft.`, transcript });
}
export function createFriendVoiceNote(options: ControllerOptions, recipient: Recipient, label: string, transcript: string, source: TransactionSource, commandId: string, reply?: { replyToMessageId?: string; replyToMarkerId?: string }) {
  const at = options.now().toISOString();
  const note = { id: `voice-note-${commandId}`, kind: "voice-note" as const, recipient, title: `Voice note to ${label}`, text: "", status: "draft" as const, recordingState: "idle" as const, recordingDurationMs: 0, transcriptSegments: [], markers: [], ...replyBinding(options, reply), createdAt: at, updatedAt: at };
  if (!options.commit([{ type: "voice-note.create", note }], transcript, source, "Voice note created")) return;
  if (recipient.kind === "group") openFriendGroup(options, recipient.id); else { options.navigate("people", undefined, false, "default"); options.updateContext({ focusedPersonId: recipient.id, focusedGroupId: undefined }); }
  options.updateContext({ activeVoiceNoteId: note.id });
  const isCurrent = options.isCurrentCommand ?? (() => true);
  void requestStudioRecording({ kind: "voice-note", id: note.id }, "start", isCurrent).catch((error: unknown) => { if (isCurrent()) options.setFeedback({ phase: "clarification", title: "Recording needs attention", detail: error instanceof Error ? error.message : "Start recording when ready.", transcript }); });
}

/** Public envelope identity is explicit; a marker must belong to that envelope. */
export function replyBinding(options: ControllerOptions, reply?: { replyToMessageId?: string; replyToMarkerId?: string }, useContext = false): Pick<FriendMessage, "replyToMessageId" | "replyToMarkerId"> {
  const context = options.getContext();
  const messageId = reply?.replyToMessageId ?? (useContext ? context.activeMessageId : undefined);
  const message = messageId ? messageEnvelope(options.getSnapshot().document, deliveryReceipts(), messageId) : undefined;
  if (!message) return {};
  const markerId = reply?.replyToMarkerId ?? (!reply?.replyToMessageId && useContext ? context.selectedVoiceMarkerId : undefined);
  return { replyToMessageId: message.id, ...(markerId && message.attachment?.markers?.some(({ id }) => id === markerId) ? { replyToMarkerId: markerId } : {}) };
}
