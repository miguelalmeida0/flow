import type { ControllerOptions } from "../../app/lifeCommandController";
import type { FriendIntent } from "./friendIntents";
import type { TransactionSource, CalendarRequest } from "../day-planner/model";
import { parseDateExpression, parseClockExpression } from "../day-planner/interpretation/temporal";
import { sourceDateKey } from "../day-planner/interpretation/sourceDates";
import { normalizeTranscript } from "../day-planner/interpretation/normalize";
import { resolvePeople, personLabel } from "./people";
import { reviewCalendarMessage } from "./friendController";
export function runPersonPlan(intent: Extract<FriendIntent, { type: "friend-plan" }>, options: ControllerOptions, transcript: string, source: TransactionSource, commandId: string) {
  const snapshot = options.getSnapshot(), today = snapshot.temporal?.todayDateKey ?? snapshot.document.calendar.dateKey, context = options.getContext();
  const people = intent.resolvedPersonId ? snapshot.document.people.filter(({ id }) => id === intent.resolvedPersonId) : intent.recipientQuery ? resolvePeople(snapshot.document.people, intent.recipientQuery) : snapshot.document.people.filter(({ id }) => id === context.focusedPersonId);
  const expiresAt = options.now().getTime() + 120_000;
  if (people.length !== 1) { const choices = people.slice(0, 3).map((person) => ({ id: person.id, label: personLabel(person) })); options.setPending({ actions: [], transcript, source, baseRevision: snapshot.revision, summary: "Choose a person", friend: { kind: "recipient", intent, choices, expiresAt } }); options.setFeedback({ phase: "clarification", title: "Who is this plan with?", detail: choices.map(({ label }) => label).join(" · ") || "Name an existing friend.", transcript }); return; }
  const person = people[0]!, text = normalizeTranscript(intent.value ?? ""), parsedDate = parseDateExpression(text, today), dateKey = parsedDate ? sourceDateKey(parsedDate, today) : /\btoday\b/.test(text) ? today : intent.dateKey, clock = parseClockExpression(text);
  if (!dateKey || clock.status !== "found") { options.setPending({ actions: [], transcript, source, baseRevision: snapshot.revision, summary: "What day and time?", friend: { kind: "friend-followup", intent: { ...intent, resolvedPersonId: person.id, dateKey }, slot: "time", choices: [], expiresAt } }); options.updateContext({ friendPrompt: "friend", friendPending: true, pending: "clarification" }); options.setFeedback({ phase: "clarification", title: dateKey ? "What time should I plan it?" : "What day and time?", detail: `A one-hour plan with ${personLabel(person)}. Review the exact time before adding it.`, transcript }); return; }
  const request: CalendarRequest = { transcript, normalized: text, actions: [{ type: "create", title: `Meeting with ${personLabel(person)}`, literalTitle: true, participantIds: [person.id], durationMinutes: 60, destination: { type: "absolute", minutes: clock.minutes, date: { dateKey } } }], constraints: [] };
  const at = options.now().toISOString();
  reviewCalendarMessage(options, { id: `plan-${commandId}`, recipient: { kind: "person", id: person.id }, body: "", direction: "outgoing", revision: 1, status: "draft", idempotencyKey: `plan-${commandId}`, createdAt: at, updatedAt: at }, request, transcript, source, false);
}
