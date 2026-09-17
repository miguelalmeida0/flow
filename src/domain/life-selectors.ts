import { eventStatus } from "../features/day-planner/eventDefaults";
import { DAY_END, duration, formatTime, localDateKey } from "../features/day-planner/time";
import { emptyDay } from "./life-calendar-world";
import type { LifeDocument } from "./life-model";

export function selectUnresolvedCaptures(document: LifeDocument) {
  return document.captures.filter(({ status }) => status === "unresolved").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function selectActivePlans(document: LifeDocument) {
  return document.plans.filter(({ status }) => status === "active");
}

export function selectOpenCommitments(document: LifeDocument) {
  return document.commitments.filter(({ status }) => status !== "completed");
}

export interface NowRecommendation {
  id: string;
  title: string;
  minutes: number;
  source: "plan-step" | "capture" | "commitment";
  reason: string;
}

export interface NowQuery { excluded: string[]; maxMinutes?: number }

/** Now is an actual-time projection, independent of the browsed Calendar day. */
export function selectNowWindow(document: LifeDocument, now: Date) {
  const dateKey = localDateKey(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const calendar = document.calendar.dateKey === dateKey ? document.calendar : document.calendars[dateKey] ?? emptyDay(dateKey);
  const liveEvents = calendar.events
    .filter((event) => event.dateKey === dateKey && !["done", "cancelled"].includes(eventStatus(event)));
  const currentEvent = liveEvents
    .filter((event) => event.start <= nowMinutes && nowMinutes < event.end)
    .sort((left, right) => left.start - right.start)[0];
  if (currentEvent) return { dateKey, start: nowMinutes, end: currentEvent.end, minutes: 0, nextTitle: currentEvent.title, currentEventId: currentEvent.id };

  const protectedRooms = (calendar.breathingRooms ?? [])
    .filter((room) => room.dateKey === dateKey && room.protected);
  const currentRoom = protectedRooms
    .filter((room) => room.start <= nowMinutes && nowMinutes < room.end)
    .sort((left, right) => left.start - right.start)[0];
  if (currentRoom) return { dateKey, start: nowMinutes, end: currentRoom.end, minutes: 0, nextTitle: currentRoom.label ?? "protected Breathing Room" };

  const boundary = calendar.endBoundaryMinutes ?? DAY_END;
  const blockers = [
    ...liveEvents.filter(({ start }) => start >= nowMinutes).map((event) => ({ start: event.start, title: event.title })),
    ...protectedRooms.filter(({ start }) => start >= nowMinutes).map((room) => ({ start: room.start, title: room.label ?? "protected Breathing Room" })),
    { start: boundary, title: undefined },
  ].sort((left, right) => left.start - right.start);
  const next = blockers[0] ?? { start: boundary, title: undefined };
  const end = Math.max(nowMinutes, next.start);
  return { dateKey, start: nowMinutes, end, minutes: end - nowMinutes, nextTitle: next.title };
}

function isReadyPlanStep(document: LifeDocument, stepId: string) {
  const step = document.steps.find(({ id }) => id === stepId);
  if (!step || step.status !== "planned") return false;
  const plan = document.plans.find(({ id }) => id === step.planId);
  if (!plan || plan.status !== "active") return false;
  const index = plan.stepIds.indexOf(step.id);
  if (index < 0) return false;
  return plan.stepIds.slice(0, index).every((priorId) => document.steps.find(({ id }) => id === priorId)?.status === "completed");
}

export function selectNowCandidates(document: LifeDocument, now: Date, query?: NowQuery | null): NowRecommendation[] {
  if (query === null) return []; // Explicitly keep time free until another query.
  const window = selectNowWindow(document, now);
  if (window.minutes <= 0) return [];
  const available = Math.min(window.minutes, query?.maxMinutes ?? window.minutes);
  const blocked = (query?.excluded ?? []).map((value) => value.toLowerCase());
  const reference = new Date(`${window.dateKey}T00:00:00`).getTime();
  const steps = document.steps
    .filter((step) => isReadyPlanStep(document, step.id) && step.estimatedMinutes && step.estimatedMinutes <= available)
    .filter((step) => !blocked.some((word) => step.title.toLowerCase().includes(word)))
    .map((step) => {
      const plan = document.plans.find(({ id }) => id === step.planId);
      const dueBoost = plan?.dueAt ? Math.max(0, 20 - Math.floor((new Date(plan.dueAt).getTime() - reference) / 86_400_000)) : 0;
      return { id: step.id, title: step.title, minutes: step.estimatedMinutes!, source: "plan-step" as const, score: dueBoost + (window.minutes - step.estimatedMinutes!), reason: `${step.estimatedMinutes}m fits before ${window.nextTitle ?? formatTime(window.end)}${plan?.dueAt ? " · plan has a due date" : ""}` };
    });
  const captures = selectUnresolvedCaptures(document)
    .filter(() => available >= 10)
    .filter(({ title }) => !blocked.some((word) => title.toLowerCase().includes(word)))
    .map((capture) => ({ id: capture.id, title: capture.title, minutes: 10, source: "capture" as const, score: window.minutes - 10 - 100, reason: `10m triage fits before ${window.nextTitle ?? formatTime(window.end)}` }));
  const commitments = document.commitments
    .filter(({ status, deferredUntil }) => status === "open" && (!deferredUntil || deferredUntil <= window.dateKey))
    .filter(({ title }) => !blocked.some((word) => title.toLowerCase().includes(word)))
    .map((commitment) => {
      const person = document.people.find(({ id }) => id === commitment.personId)?.name ?? "someone";
      const waiting = ["waiting-on", "theirs"].includes(commitment.direction);
      const title = waiting ? `Follow up with ${person}: ${commitment.title}` : `Prepare for ${person}: ${commitment.title}`;
      const dueBoost = commitment.dueAt ? Math.max(0, 40 - Math.floor((new Date(commitment.dueAt).getTime() - reference) / 86_400_000)) : 0;
      return { id: commitment.id, title, minutes: 15, source: "commitment" as const, score: dueBoost + window.minutes - 15 - 20, reason: `${waiting ? "Waiting follow-up" : "Commitment preparation"} fits in 15m` };
    })
    .filter(({ minutes }) => minutes <= available);
  return [...steps, ...commitments, ...captures]
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, 3)
    .map((candidate) => ({ id: candidate.id, title: candidate.title, minutes: candidate.minutes, source: candidate.source, reason: candidate.reason }));
}

export function calendarMinutes(document: LifeDocument) {
  return document.calendar.events.reduce((total, event) => total + duration(event), 0);
}
