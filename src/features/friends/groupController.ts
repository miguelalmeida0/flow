import type { ControllerOptions } from "../../app/lifeCommandController";
import type { FriendIntent } from "./friendIntents";
import type { FriendMessage, FriendGroup } from "../../domain/friends-model";
import type { TransactionSource, CalendarRequest } from "../day-planner/model";
import { personLabel, resolvePeople } from "./people";
import { matchingGroups } from "./groupIntents";
import { parseDateExpression, parseClockExpression } from "../day-planner/interpretation/temporal";
import { sourceDateKey } from "../day-planner/interpretation/sourceDates";
import { normalizeTranscript } from "../day-planner/interpretation/normalize";
import { previewFriendMessage, reviewCalendarMessage, createFriendVoiceNote, replyBinding } from "./friendController";
import { messagesForRecipient, groupsWithDeliveryHistory } from "./deliveryProjection";
import { deliveryReceipts } from "./messaging";
import { eventDateLabel } from "../day-planner/scheduling/resolution";
import { formatTime } from "../day-planner/time";

export function openFriendGroup(options: ControllerOptions, groupId: string) {
  options.navigate("people", undefined, false, "default"); options.setFocusedEntityId(groupId);
  options.updateContext({ focusedGroupId: groupId, focusedPersonId: undefined, activeVoiceNoteId: undefined, activeMessageId: undefined, selectedVoiceMarkerId: undefined });
}
export function groupMessage(group: FriendGroup, options: ControllerOptions, body: string, commandId: string): FriendMessage {
  const at = options.now().toISOString(), people = options.getSnapshot().document.people;
  return { id: `message-${commandId}`, recipient: { kind: "group", id: group.id }, recipientSnapshot: { name: group.name, people: people.filter(({ id }) => group.memberIds.includes(id)).map((person) => ({ id: person.id, name: personLabel(person) })) }, body, direction: "outgoing", revision: 1, status: "draft", idempotencyKey: `delivery-${commandId}`, createdAt: at, updatedAt: at };
}
export function composeGroup(intent: FriendIntent, group: FriendGroup, options: ControllerOptions, transcript: string, source: TransactionSource, commandId: string) {
  if (intent.type === "friend-voice") return createFriendVoiceNote(options, { kind: "group", id: group.id }, group.name, transcript, source, commandId, intent);
  if (intent.type !== "friend-message" && intent.type !== "friend-reply") return;
  const message = { ...groupMessage(group, options, intent.body, commandId), ...(intent.type === "friend-message" && intent.attachment ? { attachment: intent.attachment } : {}), ...(intent.type === "friend-reply" ? replyBinding(options, intent, true) : {}) };
  if (options.commit([...(intent.type === "friend-message" && intent.asset ? [{ type: "media.register" as const, asset: intent.asset }] : []), { type: "friend.message.create", message }], transcript, source, `Drafted a message to ${group.name}`)) previewFriendMessage(options, message, transcript, source);
}
export function runGroupCommand(intent: Extract<FriendIntent, { type: "friend-group" }>, options: ControllerOptions, transcript: string, source: TransactionSource, commandId: string) {
  const snapshot = options.getSnapshot(), document = snapshot.document, context = options.getContext(), today = snapshot.temporal?.todayDateKey ?? document.calendar.dateKey, at = options.now().toISOString();
  const feedback = (title: string, detail: string, phase: "completed" | "clarification" = "completed") => options.setFeedback({ phase, title, detail, transcript });
  const wait = (next: FriendIntent, slot: "group" | "member" | "time", title: string, detail: string, choices: Array<{ id: string; label: string }> = []) => {
    options.setPending({ actions: [], baseRevision: snapshot.revision, transcript, source, summary: title, friend: { kind: "friend-followup", intent: next, slot, choices, expiresAt: options.now().getTime() + 120_000 } });
    options.updateContext({ friendPending: true, friendPendingKind: "friend-followup", friendPrompt: "friend", pending: "clarification", pendingChoices: choices }); feedback(title, detail, "clarification");
  };
  if (intent.operation === "create") {
    const memberIds = [...(intent.memberIds ?? [])];
    for (const [index, query] of (intent.members ?? []).entries()) {
      const people = index === 0 && intent.resolvedPersonId ? document.people.filter(({ id }) => id === intent.resolvedPersonId) : resolvePeople(document.people, query);
      if (people.length !== 1) return wait({ ...intent, memberIds, members: intent.members!.slice(index), resolvedPersonId: undefined }, "member", `Which ${query}?`, "Name the existing contact you mean. The other group members are retained.", people.slice(0, 3).map((person) => ({ id: person.id, label: personLabel(person) })));
      memberIds.push(people[0]!.id);
    }
    if (!intent.name?.trim() || !memberIds.length) return feedback("Name the group and its members", "For example: Create a group called Family with Sarah and John.", "clarification");
    const group: FriendGroup = { id: `group-${commandId}`, kind: "friend-group", name: intent.name.trim(), memberIds: [...new Set(memberIds)], createdAt: at, updatedAt: at };
    if (options.commit([{ type: "friend.group.create", group }], transcript, source, `Created private group ${group.name}`)) openFriendGroup(options, group.id);
    return;
  }
  const pool = intent.operation === "open" ? groupsWithDeliveryHistory(document, deliveryReceipts()) : document.friends!.groups;
  const groups = intent.groupId ? pool.filter(({ id }) => id === intent.groupId) : intent.query ? matchingGroups(pool, intent.query) : pool.filter(({ id }) => id === context.focusedGroupId);
  if (groups.length !== 1) return wait(intent, "group", "Which private group?", groups.length ? "Choose the group by its members." : "Name an existing private group.", groups.slice(0, 3).map((group) => ({ id: group.id, label: `${group.name} · ${group.memberIds.map((id) => document.people.find((person) => person.id === id)?.name).join(", ")}` })));
  const group = groups[0]!;
  if (intent.operation === "open") { openFriendGroup(options, group.id); return feedback(group.name, "Private messages, voice notes, plans, and shared Memories."); }
  const plans = document.friends!.groupPlans.filter(({ groupId }) => groupId === group.id);
  const plan = plans.find(({ id }) => id === (intent.planId ?? context.activeGroupPlanId)) ?? plans.at(-1);
  if (intent.operation === "replies") return feedback("Recorded replies", plan?.replies.length ? plan.replies.map((reply) => `${document.people.find(({ id }) => id === reply.personId)?.name ?? "Group member"}: ${reply.text}`).join(" · ") : "No replies have been received or recorded. Nobody's availability is assumed.");
  if (intent.operation === "decision") {
    const decisions = messagesForRecipient(document, deliveryReceipts(), { kind: "group", id: group.id }).filter(({ message, receipt }) => (receipt || message.direction === "incoming") && (!intent.value || message.body.toLocaleLowerCase().includes(intent.value.toLocaleLowerCase())));
    return feedback("Messages about that decision", decisions.length ? decisions.slice(-3).map(({ message }) => message.body).join(" · ") : "There is no recorded decision about that yet.");
  }
  if (intent.operation === "record-reply") {
    if (!intent.personId) {
      const members = document.people.filter(({ id }) => group.memberIds.includes(id));
      const people = intent.resolvedPersonId ? members.filter(({ id }) => id === intent.resolvedPersonId) : resolvePeople(members, intent.personQuery ?? "");
      if (people.length !== 1) return wait({ ...intent, groupId: group.id }, "member", "Whose reply did you receive?", "Name the actual group member. Their words are retained.", people.slice(0, 3).map((person) => ({ id: person.id, label: personLabel(person) })));
      intent = { ...intent, personId: people[0]!.id };
    }
    if (!plan || !intent.personId || !group.memberIds.includes(intent.personId) || !intent.value?.trim()) return feedback("Choose a member and their actual reply", "Nothing has been invented or recorded.", "clarification");
    const reply = { personId: intent.personId, optionIds: intent.response === "in" ? plan.options.map(({ id }) => id) : [], response: intent.response ?? "alternative" as const, text: intent.value, provenance: "recorded-by-user" as const, at };
    options.commit([{ type: "friend.group-plan.update", planId: plan.id, patch: { replies: [...plan.replies.filter(({ personId }) => personId !== reply.personId), reply] } }], transcript, source, "Recorded the reply you provided."); return;
  }
  const date = parseDateExpression(normalizeTranscript(intent.value ?? ""), today) ?? (intent.dateKey ? { dateKey: intent.dateKey } : undefined);
  const clock = parseClockExpression(normalizeTranscript(intent.value ?? ""));
  if (!date && !plan) return wait({ ...intent, groupId: group.id }, "time", "What day should I ask about?", "Name a day and time or part of the day.");
  const dateKey = date ? sourceDateKey(date, today) : plan!.options[0]!.dateKey;
  if (intent.operation === "ask") {
    const dayPart = /afternoon/i.test(intent.value ?? "") ? 14 * 60 : /evening/i.test(intent.value ?? "") ? 18 * 60 : /morning/i.test(intent.value ?? "") ? 9 * 60 : undefined;
    if (clock.status !== "found" && dayPart === undefined) return wait({ ...intent, groupId: group.id, dateKey }, "time", "What time should I ask about?", "Name a time or say morning, afternoon, or evening.");
    const minutes = clock.status === "found" ? clock.minutes : dayPart!;
    const groupPlan = { id: `group-plan-${commandId}`, groupId: group.id, title: `Plan with ${group.name}`, options: [{ id: "option-1", dateKey, startMinutes: minutes }], replies: [], status: "proposed" as const, createdAt: at };
    const timeLabel = clock.status === "found" ? `at ${formatTime(minutes)}` : `in the ${minutes === 840 ? "afternoon" : minutes === 1080 ? "evening" : "morning"}`;
    const message = { ...groupMessage(group, options, `Who's free ${eventDateLabel(dateKey)} ${timeLabel}? Reply In, Maybe, Can't, or suggest another time.`, commandId), groupPlanId: groupPlan.id };
    if (options.commit([{ type: "friend.group-plan.create", plan: groupPlan }, { type: "friend.message.create", message }], transcript, source, "Group proposal drafted; no invitations sent yet.")) { previewFriendMessage(options, message, transcript, source); options.updateContext({ activeGroupPlanId: groupPlan.id }); }
    return;
  }
  if (!plan || clock.status !== "found") return wait({ ...intent, groupId: group.id, dateKey }, "time", "What time should I put in Calendar?", "Choose an exact time for this group's plan.");
  // A reply such as 'at five then' inherits the afternoon/evening scope of this proposal.
  const minutes = clock.minutes < 12 * 60 && plan.options[0]!.startMinutes >= 12 * 60 && !/\bam\b/i.test(intent.value ?? "") ? clock.minutes + 12 * 60 : clock.minutes;
  const request: CalendarRequest = { transcript, normalized: normalizeTranscript(transcript), actions: [{ type: "create", literalTitle: true, title: plan.title, participantIds: group.memberIds, durationMinutes: 60, destination: { type: "absolute", minutes, date: { dateKey } } }], constraints: [] };
  reviewCalendarMessage(options, { ...groupMessage(group, options, `Let's meet ${dateKey} at ${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}.`, commandId), groupPlanId: plan.id }, request, transcript, source);
}
