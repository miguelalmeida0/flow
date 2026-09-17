import type { ControllerOptions } from "../../app/lifeCommandController";
import type { VoiceMarker, VoiceNote } from "../../domain/friends-model";
import type { RecordingTarget } from "../../domain/friends-actions";
import type { MarkerIntent } from "./markerIntents";
import type { TransactionSource, CalendarRequest } from "../day-planner/model";
import { normalizeTranscript } from "../day-planner/interpretation/normalize";
import { parseDateExpression, parseClockExpression } from "../day-planner/interpretation/temporal";
import { sourceDateKey } from "../day-planner/interpretation/sourceDates";
import { proposeCalendarMessage } from "../friends/calendarProposal";
import { waitMarkerAction } from "./markerController";
import { personLabel, resolvePeople } from "../friends/people";
import { formatTime } from "../day-planner/time";
import { messageEnvelope } from "../friends/deliveryProjection";
import { deliveryReceipts } from "../friends/messaging";
import { recordingDocument } from "./recordingTarget";

export function convertVoiceMarker(intent: MarkerIntent, target: RecordingTarget, marker: VoiceMarker, options: ControllerOptions, transcript: string, source: TransactionSource, commandId: string) {
  const snapshot = options.getSnapshot(), document = snapshot.document, today = snapshot.temporal?.todayDateKey ?? document.calendar.dateKey;
  const bound = { ...intent, target, markerId: marker.id };
  const note: VoiceNote | undefined = target.kind === "voice-note" ? document.friends?.voiceNotes.find(({ id }) => id === target.id) : undefined;
  const message = target.kind === "shared-message" ? messageEnvelope(document, deliveryReceipts(), target.id) : undefined;
  const authorId = note?.authorPersonId ?? message?.authorPersonId;
  const inferredPerson = authorId ?? (note?.recipient.kind === "person" ? note.recipient.id : message?.recipient.kind === "person" ? message.recipient.id : undefined);
  const people = intent.recipientId ? document.people.filter(({ id }) => id === intent.recipientId) : intent.recipientQuery ? resolvePeople(document.people, intent.recipientQuery) : document.people.filter(({ id }) => id === inferredPerson);
  if ((intent.operation === "commitment" || intent.recipientQuery || intent.recipientId) && people.length !== 1) return waitMarkerAction(options, bound, "recipient", people.slice(0, 3).map((person) => ({ id: person.id, label: personLabel(person) })), "Who is this with?", "Name the person. The original moment remains unchanged.", transcript, source);
  const personIds = people.map(({ id }) => id);
  const text = normalizeTranscript(marker.excerpt), answer = normalizeTranscript(intent.timeAnswer ?? "");
  const sourceDay = recordingDocument(document, target)?.createdAt.slice(0, 10) ?? today;
  const sourceDate = parseDateExpression(text, sourceDay);
  const explicitDate = parseDateExpression(answer, today) ?? (intent.resolvedDateKey ? { dateKey: intent.resolvedDateKey } : undefined);
  const historicalPlan = intent.operation === "calendar" && !explicitDate && sourceDate && sourceDateKey(sourceDate, sourceDay) < today;
  const date = explicitDate ?? (!historicalPlan && sourceDate ? { dateKey: sourceDateKey(sourceDate, sourceDay) } : undefined);
  const at = options.now().toISOString();
  if (intent.operation === "commitment") {
    const direction = intent.direction ?? (/^(?:i['’]ll|i will|i promise to)\b/i.test(marker.excerpt) && !(message?.direction === "incoming" && !authorId) ? authorId ? "waiting-on" : "owed-by-me" : undefined);
    if (!direction) return waitMarkerAction(options, { ...bound, recipientId: personIds[0] }, "direction", [{ id: "owed-by-me", label: "I owe this" }, { id: "waiting-on", label: "They owe this" }], "Whose commitment is this?", "Choose your promise or the other person's promise.", transcript, source);
    const id = `commitment-${commandId}`;
    options.commit([{ type: "commitment.create", commitment: { id, kind: "commitment", personId: personIds[0]!, title: marker.excerpt.replace(/^(?:i['’]ll|i will|i promise to)\s+/i, ""), direction: direction === "owed-by-me" ? "i-owe" : "waiting-on", status: "open", ...(date ? { dueAt: sourceDateKey(date, today) } : {}), createdAt: at, updatedAt: at } }, { type: "friend.link.create", link: { id: `moment-link-${commandId}`, personIds, source: { kind: "marker", id: marker.id }, destination: { kind: "commitment", id } } }], transcript, source, "Commitment kept with its original moment.");
    return;
  }
  const answerClock = parseClockExpression(answer);
  const parsedClock = answerClock.status === "found" ? answerClock : intent.resolvedMinutes !== undefined ? { status: "found" as const, minutes: intent.resolvedMinutes } : parseClockExpression(text);
  const clockExplicit = answerClock.status === "found" ? /\b(?:am|pm|morning|afternoon|evening)\b/.test(answer) : intent.clockExplicit ?? /\b(?:am|pm|morning|afternoon|evening)\b/.test(text);
  const clockText = answerClock.status === "found" ? answer : text;
  const clock = parsedClock.status === "found" && !clockExplicit && !/\b(?:1[3-9]|2[0-3])(?::\d{2})?\b/.test(clockText) ? { ...parsedClock, minutes: parsedClock.minutes % 720 || 720 } : parsedClock;
  const clockAmbiguous = clock.status === "found" && clock.minutes < 12 * 60 && !clockExplicit && !/\b(?:dinner|restaurant|supper)\b/.test(text);
  if (!intent.request && (!date || clock.status !== "found" || clockAmbiguous)) {
    const choices = clockAmbiguous && clock.status === "found" ? [clock.minutes, clock.minutes + 12 * 60].map((minutes) => ({ id: formatTime(minutes), label: formatTime(minutes) })) : [];
    return waitMarkerAction(options, { ...bound, ...(date ? { resolvedDateKey: sourceDateKey(date, today) } : {}), ...(clock.status === "found" ? { resolvedMinutes: clock.minutes, clockExplicit } : {}) }, "time", choices, !date ? "What day and time?" : clock.status !== "found" ? "What time should I plan it?" : "Morning or evening?", `${historicalPlan ? "That recording refers to a past date. Choose the date for this new plan. " : ""}From “${marker.excerpt}”. Nothing is scheduled yet.`, transcript, source);
  }
  const minutes = clock.status === "found" ? clock.minutes + (clock.minutes < 12 * 60 && /\b(?:dinner|restaurant|supper)\b/.test(text) && !clockExplicit ? 12 * 60 : 0) : 0;
  const request: CalendarRequest = intent.request ?? { transcript, normalized: normalizeTranscript(transcript), actions: [{ type: "create", title: marker.title, literalTitle: true, durationMinutes: 60, participantIds: personIds, destination: { type: "absolute", minutes, date: { dateKey: sourceDateKey(date!, today) } } }], constraints: [] };
  const proposal = proposeCalendarMessage(document, request, today, options.now);
  options.setPending({ actions: proposal.question || !proposal.event ? [] : [...(proposal.existingEventId ? [] : [{ type: "calendar.request" as const, request, confirmed: true }]), { type: "friend.link.create", link: { id: `moment-link-${commandId}`, personIds, source: { kind: "marker", id: marker.id }, destination: { kind: "calendar-event", id: proposal.event.id } } }], baseRevision: snapshot.revision, transcript, source, summary: proposal.detail, confirmLabel: "Add plan", friend: { kind: "marker-calendar", intent: { ...bound, request }, proposal, expiresAt: options.now().getTime() + 120_000 } });
  options.updateContext({ friendPending: true, friendPendingKind: "marker-calendar", friendPrompt: undefined, pending: proposal.question ? "clarification" : "confirmation", pendingChoices: proposal.choices });
  options.setFeedback({ phase: proposal.question ? "clarification" : "confirmation", title: proposal.question ?? "Add this plan to Calendar?", detail: `${proposal.detail} The source moment stays private; no message will be sent.`, transcript });
}
