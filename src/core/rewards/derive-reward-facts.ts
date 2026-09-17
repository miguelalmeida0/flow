import { allCalendarEvents, allCalendarPlans } from "../../domain/life-calendar-world";
import type { LifeAction } from "../../domain/life-actions";
import type { LifeDocument } from "../../domain/life-model";
import type { BreathingRoom, CalendarEvent, CalendarRequest } from "../../features/day-planner/model";
import type { RewardFact } from "./reward-types";

const duration = (event: CalendarEvent | BreathingRoom) => event.end - event.start;

function uniqueByTypeAndIdentity(facts: RewardFact[]) {
  const seen = new Set<string>();
  return facts.filter((fact) => {
    const identity = "eventId" in fact ? fact.eventId
      : "entityId" in fact ? fact.entityId
        : "roomId" in fact ? fact.roomId
          : "captureId" in fact ? fact.captureId
            : "outcomeId" in fact ? `${fact.outcomeId}:${"stepId" in fact ? fact.stepId : ""}`
              : "commitmentId" in fact ? fact.commitmentId
                : "focusId" in fact ? fact.focusId
                  : "instinctId" in fact ? fact.instinctId
                    : "global";
    const key = `${fact.type}:${identity}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function calendarRequests(actions: LifeAction[]) {
  return actions.filter((action): action is Extract<LifeAction, { type: "calendar.request" }> => action.type === "calendar.request").map(({ request }) => request);
}

function requestIsReset(actions: LifeAction[]) {
  return actions.some((action) => action.type === "calendar.replace")
    || calendarRequests(actions).some(({ actions: calendarActions }) => calendarActions.some(({ type }) => type === "reset"));
}

function recoveryMinutes(requests: CalendarRequest[]) {
  return requests.flatMap(({ actions }) => actions).reduce((total, action) => {
    if (action.type === "recover") return total + Math.max(0, action.delayMinutes);
    if (action.type === "complete") return total + Math.max(0, action.earlyByMinutes ?? 0);
    return total;
  }, 0);
}

function deriveCalendarFacts(before: LifeDocument, after: LifeDocument, actions: LifeAction[]) {
  if (requestIsReset(actions)) return [];
  const facts: RewardFact[] = [];
  const prior = new Map(allCalendarEvents(before).map((event) => [event.id, event]));
  const next = new Map(allCalendarEvents(after).map((event) => [event.id, event]));
  for (const event of next.values()) {
    const previous = prior.get(event.id);
    if (!previous) {
      facts.push({ type: "event-created", eventId: event.id });
      continue;
    }
    if (previous.dateKey !== event.dateKey) {
      facts.push({ type: "event-deferred", eventId: event.id, destinationDateKey: event.dateKey });
    } else if (previous.start !== event.start) {
      facts.push({ type: "event-moved", eventId: event.id, from: { dateKey: previous.dateKey, start: previous.start, end: previous.end }, to: { dateKey: event.dateKey, start: event.start, end: event.end } });
    }
    if (duration(previous) !== duration(event)) facts.push({ type: "event-resized", eventId: event.id, previousMinutes: duration(previous), nextMinutes: duration(event) });
    const changed: Extract<RewardFact, { type: "event-styled" }>["changed"] = [];
    if (previous.color !== event.color) changed.push("color");
    if (JSON.stringify(previous.labels ?? []) !== JSON.stringify(event.labels ?? [])) changed.push("label");
    if (previous.importance !== event.importance) changed.push("importance");
    if (previous.mobility !== event.mobility) changed.push("mobility");
    if (changed.length) facts.push({ type: "event-styled", eventId: event.id, changed });
    const wasProtected = previous.protected || previous.kind === "protected" || previous.kind === "fixed";
    const isProtected = event.protected || event.kind === "protected" || event.kind === "fixed";
    if (!wasProtected && isProtected) facts.push({ type: "time-protected", entityId: event.id, minutes: duration(event) });
    if (wasProtected && !isProtected) facts.push({ type: "time-released", entityId: event.id, minutes: duration(event) });
  }
  for (const event of prior.values()) if (!next.has(event.id)) facts.push({ type: "event-removed", eventId: event.id });

  const priorRooms = new Map(allCalendarPlans(before).flatMap((day) => day.breathingRooms ?? []).map((room) => [room.id, room]));
  for (const room of allCalendarPlans(after).flatMap((day) => day.breathingRooms ?? [])) {
    if (!priorRooms.has(room.id)) facts.push({ type: "breathing-room-created", roomId: room.id, minutes: duration(room) });
  }

  const requests = calendarRequests(actions);
  const requestedRecovery = requests.some(({ actions: calendarActions }) => calendarActions.some(({ type }) => type === "recover" || type === "reflow" || type === "complete"));
  if (requestedRecovery) {
    const movedCount = facts.filter(({ type }) => type === "event-moved").length;
    const deferredCount = facts.filter(({ type }) => type === "event-deferred").length;
    const reclaimedMinutes = recoveryMinutes(requests);
    if (movedCount || deferredCount || reclaimedMinutes) {
      facts.push({ type: "day-recovered", movedCount, deferredCount, reclaimedMinutes });
      if (reclaimedMinutes) facts.push({ type: "time-reclaimed", minutes: reclaimedMinutes });
    }
  }
  return facts;
}

function deriveLifeFacts(before: LifeDocument, after: LifeDocument) {
  const facts: RewardFact[] = [];
  const priorCaptures = new Map(before.captures.map((capture) => [capture.id, capture]));
  for (const capture of after.captures) if (!priorCaptures.has(capture.id)) facts.push({ type: "capture-created", captureId: capture.id });
  for (const capture of after.captures) {
    const previous = priorCaptures.get(capture.id);
    if (!previous || previous.status === "resolved" || capture.status !== "resolved") continue;
    const link = after.links.find(({ fromId, type }) => fromId === capture.id && type.startsWith("capture-origin"));
    if (!link) continue;
    const destination = link.type === "capture-origin-of-plan" ? "outcome" : link.type === "capture-origin-of-commitment" ? "commitment" : "today";
    facts.push({ type: "capture-routed", captureId: capture.id, destination, destinationId: link.toId });
  }

  const priorPlans = new Map(before.plans.map((plan) => [plan.id, plan]));
  for (const plan of after.plans) {
    const previous = priorPlans.get(plan.id);
    if (!previous) facts.push({ type: "outcome-created", outcomeId: plan.id });
    const steps = after.steps.filter(({ planId }) => planId === plan.id);
    if (previous?.status !== "completed" && plan.status === "completed" && steps.length > 0 && steps.every(({ status }) => status === "completed")) facts.push({ type: "outcome-completed", outcomeId: plan.id });
  }
  const priorSteps = new Map(before.steps.map((step) => [step.id, step]));
  for (const step of after.steps) {
    const previous = priorSteps.get(step.id);
    if (!previous) continue;
    const scheduleLink = after.links.find(({ type, fromId }) => type === "step-scheduled-as-event" && fromId === step.id);
    if (previous.status !== "scheduled" && step.status === "scheduled" && scheduleLink) facts.push({ type: "outcome-step-scheduled", outcomeId: step.planId, stepId: step.id, eventId: scheduleLink.toId });
    if (previous.status !== "completed" && step.status === "completed") {
      const plan = after.plans.find(({ id }) => id === step.planId);
      const nextStepId = plan?.stepIds.map((id) => after.steps.find((candidate) => candidate.id === id)).find((candidate) => candidate && candidate.status !== "completed")?.id;
      facts.push({ type: "outcome-advanced", outcomeId: step.planId, completedStepId: step.id, ...(nextStepId ? { nextStepId } : {}) });
    }
  }

  const priorCommitments = new Map(before.commitments.map((commitment) => [commitment.id, commitment]));
  for (const commitment of after.commitments) {
    const previous = priorCommitments.get(commitment.id);
    if (!previous) facts.push({ type: "commitment-created", commitmentId: commitment.id, personId: commitment.personId });
    if (previous && previous.status !== "completed" && commitment.status === "completed") facts.push({ type: "commitment-kept", commitmentId: commitment.id, personId: commitment.personId });
    const link = after.links.find(({ type, fromId }) => type === "commitment-reserved-by-event" && fromId === commitment.id);
    const wasLinked = before.links.some(({ type, fromId }) => type === "commitment-reserved-by-event" && fromId === commitment.id);
    if (link && !wasLinked) {
      const event = allCalendarEvents(after).find(({ id }) => id === link.toId);
      if (event && (event.protected || event.kind === "protected" || event.kind === "fixed")) facts.push({ type: "commitment-protected", commitmentId: commitment.id, eventId: event.id });
    }
  }

  if (!before.focus.active && after.focus.active) facts.push({ type: "focus-started", focusId: after.focus.active.id, minutes: after.focus.active.durationMinutes });
  const completed = after.focus.lastCompleted;
  if (completed && completed.id !== before.focus.lastCompleted?.id && completed.completedAt) {
    const elapsedMinutes = Math.max(0, (new Date(completed.completedAt).getTime() - new Date(completed.startedAt).getTime()) / 60_000);
    const meaningfulThreshold = Math.max(0, Math.min(completed.durationMinutes * 0.8, completed.durationMinutes - 1));
    facts.push({ type: "focus-completed", focusId: completed.id, minutes: completed.durationMinutes, elapsedMinutes, meaningful: elapsedMinutes >= meaningfulThreshold });
  }

  const actedOn = after.instinctState.actedOnAt ?? {};
  const previousActedOn = before.instinctState.actedOnAt ?? {};
  for (const instinctId of Object.keys(actedOn)) if (!previousActedOn[instinctId]) facts.push({ type: "instinct-acted-on", instinctId });
  return facts;
}

export function deriveRewardFacts(before: LifeDocument, after: LifeDocument, actions: LifeAction[]): RewardFact[] {
  return uniqueByTypeAndIdentity([...deriveCalendarFacts(before, after, actions), ...deriveLifeFacts(before, after)]);
}

export function rewardEntityIds(facts: RewardFact[]): string[] {
  const ids: string[] = [];
  for (const fact of facts) {
    if ("eventId" in fact) ids.push(fact.eventId);
    else if ("entityId" in fact) ids.push(fact.entityId);
    else if ("roomId" in fact) ids.push(fact.roomId);
    else if ("captureId" in fact) { ids.push(fact.captureId); if (fact.type === "capture-routed") ids.push(fact.destinationId); }
    else if ("outcomeId" in fact) { ids.push(fact.outcomeId); if ("stepId" in fact && typeof fact.stepId === "string") ids.push(fact.stepId); }
    else if ("commitmentId" in fact) { ids.push(fact.commitmentId); if ("personId" in fact && typeof fact.personId === "string") ids.push(fact.personId); }
    else if ("focusId" in fact) ids.push(fact.focusId);
    else if ("instinctId" in fact) ids.push(fact.instinctId);
  }
  return [...new Set(ids)];
}
