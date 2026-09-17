import type { ControllerOptions } from "../../app/lifeCommandController";
import type { MarkerIntent } from "./markerIntents";
import type { TransactionSource } from "../day-planner/model";
import { recordingDocument, recordingUpdate } from "./recordingTarget";
import { journalRuntimePosition } from "./journalRuntimeClock";
import { manualVoiceMarker, resolveVoiceMarkers } from "./voiceMarkers";
import { requestStudioPlayback } from "./studioPlayback";
import { personLabel, resolvePeople } from "../friends/people";
import { convertVoiceMarker } from "./markerConversions";
import { messageEnvelope } from "../friends/deliveryProjection";
import { deliveryReceipts } from "../friends/messaging";

export function runMarkerCommand(intent: MarkerIntent, options: ControllerOptions, transcript: string, source: TransactionSource, commandId: string) {
  const context = options.getContext(), document = options.getSnapshot().document;
  const target = intent.target ?? (context.route === "people" && context.activeMessageId && !context.activeVoiceNoteId ? { kind: "shared-message" as const, id: context.activeMessageId } : context.route === "people" && context.activeVoiceNoteId ? { kind: "voice-note" as const, id: context.activeVoiceNoteId } : { kind: "journal" as const, id: context.activeJournalEntryId ?? "" });
  const recording = recordingDocument(document, target);
  const clarify = (title: string, detail: string) => options.setFeedback({ phase: "clarification", title, detail, transcript });
  if (!recording) return clarify("Which recording?", "Open the original note or Journal entry first.");
  const markers = recording.markers ?? [];
  const position = journalRuntimePosition(target.id) ?? recording.recordingDurationMs;
  if (intent.operation === "mark") {
    if (target.kind === "shared-message") return clarify("This is a delivered recording", "Its original markers stay unchanged. Select a moment to reply or create a plan.");
    const marker = manualVoiceMarker(target.id, recording.transcriptSegments, position, `moment-${commandId}`, options.now().toISOString());
    if (options.commit([recordingUpdate(target, { recordingDurationMs: Math.max(recording.recordingDurationMs, marker.endMs) }), { type: "recording.markers.replace", target, markers: [...markers, marker] }], transcript, source, "Moment marked.")) options.updateContext({ selectedVoiceMarkerId: marker.id });
    return;
  }
  const matches = intent.markerId ? markers.filter(({ id }) => id === intent.markerId) : resolveVoiceMarkers(markers, intent.query, context.selectedVoiceMarkerId);
  if (matches.length !== 1) {
    if (!matches.length) return clarify("Which moment?", markers.length ? "Name a moment or say its number." : "There are no marked moments in this recording yet.");
    const choices = matches.slice(0, 3).map(({ id, title, startMs }) => ({ id, label: `${Math.floor(startMs / 60_000)}:${String(Math.floor(startMs / 1000) % 60).padStart(2, "0")} · ${title}` }));
    options.setPending({ actions: [], baseRevision: options.getSnapshot().revision, transcript, source, summary: "Choose a moment", friend: { kind: "marker", intent: { ...intent, target }, choices, expiresAt: options.now().getTime() + 120_000 } });
    options.updateContext({ friendPending: true, friendPendingKind: "marker", pending: "clarification", pendingChoices: choices });
    return clarify("Which moment do you mean?", choices.map(({ label }) => label).join(" · "));
  }
  const marker = matches[0]!;
  options.updateContext({ selectedVoiceMarkerId: marker.id, ...(target.kind === "shared-message" ? { activeMessageId: target.id, activeVoiceNoteId: undefined } : target.kind === "voice-note" ? { activeVoiceNoteId: target.id, activeMessageId: undefined } : { activeJournalEntryId: target.id }) });
  if (intent.operation === "keep" || intent.operation === "dismiss") {
    if (target.kind === "shared-message") return clarify("This is a delivered moment", "The sender's original remains unchanged. Reply or make a plan from it.");
    options.commit([{ type: "recording.markers.replace", target, markers: markers.map((item) => item.id === marker.id ? { ...item, status: intent.operation === "keep" ? "kept" : "dismissed" } : item) }], transcript, source, intent.operation === "keep" ? "Moment kept." : "Suggestion dismissed.");
    return;
  }
  if (intent.operation === "select") { options.setFeedback({ phase: "completed", title: marker.title, detail: marker.excerpt, transcript }); return; }
  if (intent.operation === "play") {
    const isCurrent = options.isCurrentCommand ?? (() => true);
    if (!recording.audioAssetId) return clarify("No original audio", "This moment has text only; no recording can be played.");
    void requestStudioPlayback({ target: target.kind === "journal" ? "journal-playback" : "voice-note-playback", entryId: target.id, mode: "play", positionMs: marker.startMs }, isCurrent).then(() => { if (isCurrent()) options.setFeedback({ phase: "completed", title: "Playing original moment", detail: marker.excerpt, transcript }); }).catch((error: unknown) => { if (isCurrent()) clarify("Playback needs attention", error instanceof Error ? error.message : "The original audio could not play."); });
    return;
  }
  if (intent.operation === "reply") {
    if (target.kind === "journal") return clarify("This is a private Journal moment", "Choose a friend explicitly before sharing or replying.");
    const message = target.kind === "shared-message" ? messageEnvelope(document, deliveryReceipts(), target.id) : undefined;
    if (!message) return clarify("Open the shared recording to reply", "This is a private draft. Share it first, then reply to its delivered moment.");
    const recipient = message.recipient.kind === "group" ? { resolvedGroupId: message.recipient.id } : { resolvedPersonId: message.authorPersonId ?? message.recipient.id };
    options.setPending({ actions: [], baseRevision: options.getSnapshot().revision, transcript, source, summary: "Reply to this shared moment", friend: { kind: "reply-dictation", intent: { type: "friend-reply", body: "", replyToMessageId: message.id, replyToMarkerId: marker.id, ...recipient }, expiresAt: options.now().getTime() + 120_000 } });
    options.updateContext({ friendPending: true, friendPendingKind: "reply-dictation", pending: "clarification" });
    options.setFeedback({ phase: "clarification", title: "What would you like to reply?", detail: `Replying to “${marker.title}”. Say your words; I will prepare a draft for review.`, transcript });
    return;
  }
  if (intent.operation === "share") {
    const people = intent.recipientId ? document.people.filter(({ id }) => id === intent.recipientId) : resolvePeople(document.people, intent.recipientQuery ?? "");
    const bound = { ...intent, target, markerId: marker.id };
    if (people.length !== 1) {
      return waitMarkerAction(options, bound, "recipient", people.slice(0, 3).map((person) => ({ id: person.id, label: personLabel(person) })), "Who should receive this moment?", people.length ? "Choose the person you mean." : "Name an existing friend. The Journal remains private.", transcript, source);
    }
    if (!intent.payload) return waitMarkerAction(options, { ...bound, recipientId: people[0]!.id }, "payload", [{ id: "voice", label: "The voice clip" }, { id: "text", label: "The text" }], "Send the voice clip or the text?", `Only “${marker.excerpt || marker.title}” will be prepared for ${personLabel(people[0]!)}.`, transcript, source);
    if (intent.payload === "text" && !marker.excerpt.trim()) return waitMarkerAction(options, { ...bound, recipientId: people[0]!.id, payload: undefined }, "payload", [{ id: "voice", label: "The voice clip" }], "This moment has no transcript", "Choose its original voice clip, or compose the words in a new message.", transcript, source);
    options.prepareMarkerShare?.({ ...bound, recipientId: people[0]!.id }, transcript, source);
    return;
  }
  return convertVoiceMarker(intent, target, marker, options, transcript, source, commandId);
}

export function waitMarkerAction(options: ControllerOptions, intent: MarkerIntent, stage: "recipient" | "payload" | "time" | "direction", choices: Array<{ id: string; label: string }>, title: string, detail: string, transcript: string, source: TransactionSource) {
  options.setPending({ actions: [], baseRevision: options.getSnapshot().revision, transcript, source, summary: title, friend: { kind: "marker-action", intent, stage, choices, expiresAt: options.now().getTime() + 120_000 } });
  options.updateContext({ friendPending: true, friendPendingKind: "marker-action", friendPrompt: stage, pending: "clarification", pendingChoices: choices });
  options.setFeedback({ phase: "clarification", title, detail, transcript });
}
