import type { LifeDocument, Person } from "../../domain/life-model";
import type { CalendarEvent, CalendarRequest } from "../day-planner/model";
import { interpretTranscript } from "../day-planner/parser";
import { normalizeTranscript } from "../day-planner/interpretation/normalize";
import { allCalendarEvents } from "../../domain/life-calendar-world";
import { applyLifeTransaction } from "../../domain/life-transaction";
import { bindRequestDestinations, sourceDateKey, weekdayNames } from "../day-planner/interpretation/sourceDates";
import { parseClockExpression } from "../day-planner/interpretation/temporal";
import { eventDateLabel } from "../day-planner/scheduling/resolution";
import { firstAvailable, overlaps } from "../day-planner/scheduling/slots";
import { DAY_END, DAY_START, formatTime } from "../day-planner/time";
import { personLabel } from "./people";

export interface CalendarMessageChoice { id: string; label: string; request: CalendarRequest }
export interface CalendarMessageProposal {
  request: CalendarRequest;
  event?: CalendarEvent;
  existingEventId?: string;
  blockers: CalendarEvent[];
  choices: CalendarMessageChoice[];
  question?: string;
  detail: string;
}
/** A narrow, affirmative booking frame can propose a calendar link. Other message bodies remain literal data. */
export function bookingRequest(body: string, person: Person, today: string): CalendarRequest | undefined {
  const match = body.match(/^(?:i|we)(?:['’]ve| have)?\s+(?:booked|scheduled|reserved)\s+(.+)$/i);
  if (!match) return undefined;
  let content = match[1]!.trim();
  if (/^(?:(?:for|on)\s+)?(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|at\s+)/i.test(content)) content = `a meeting with ${personLabel(person)} ${content}`;
  const parsed = interpretTranscript(`Schedule ${content}`, today);
  if (parsed.status !== "ready" || parsed.request.actions.length !== 1 || parsed.request.actions[0]?.type !== "create") return undefined;
  return bindRequestDestinations({ ...parsed.request, actions: [{ ...parsed.request.actions[0], participantIds: [person.id] }] }, today);
}

function exactCreation(request: CalendarRequest, today: string) {
  const action = request.actions.find((item) => item.type === "create");
  if (!action || action.destination.type !== "absolute") return undefined;
  return { action, dateKey: action.destination.date ? sourceDateKey(action.destination.date, today) : today, start: action.destination.minutes };
}
export function proposeCalendarMessage(document: LifeDocument, request: CalendarRequest, today: string, now: () => Date): CalendarMessageProposal {
  const primaryMove = request.actions.length === 1 && request.actions[0]?.type === "move" ? request.actions[0] : undefined;
  if (primaryMove?.selector.type === "id" && primaryMove.destination.type === "absolute") {
    const selector = primaryMove.selector, destination = primaryMove.destination;
    const original = allCalendarEvents(document).find(({ id }) => id === selector.id);
    if (!original) return { request, blockers: [], choices: [], question: "Which meeting should move?", detail: "The referenced event is no longer available." };
    const dateKey = destination.date ? sourceDateKey(destination.date, today) : original.dateKey, start = destination.minutes, duration = original.end - original.start;
    if (dateKey === original.dateKey && start === original.start) return { request, blockers: [], choices: [], event: original, existingEventId: original.id, detail: `${original.title} is already at ${formatTime(start)}. Only the message is proposed.` };
    const events = allCalendarEvents(document).filter((event) => event.dateKey === dateKey && event.id !== original.id), blockers = events.filter((event) => overlaps(start, start + duration, event));
    if (blockers.length) {
      const available = firstAvailable(events, duration, start + 15, document.calendars[dateKey]?.endBoundaryMinutes ?? DAY_END);
      const choices = available === null ? [] : [{ id: `time-${dateKey}-${available}`, label: `${eventDateLabel(dateKey)} at ${formatTime(available)}`, request: { ...request, actions: [{ ...primaryMove, destination: { ...destination, date: { dateKey }, minutes: available } }] } }];
      return { request, blockers, choices, question: "That exact time is occupied.", detail: "Choose a free alternative or name another time. No event moved and no message was sent." };
    }
    const result = applyLifeTransaction(document, [{ type: "calendar.request", request, confirmed: true }], now);
    if (result.status !== "success") return { request, blockers: [], choices: [], question: result.title, detail: result.detail };
    return { request, blockers: [], choices: [], event: allCalendarEvents(result.document).find(({ id }) => id === original.id), detail: `Move ${original.title} from ${eventDateLabel(original.dateKey)} at ${formatTime(original.start)} to ${eventDateLabel(dateKey)} at ${formatTime(start)}.${original.kind === "fixed" || original.protected ? " This explicitly moves a protected event." : ""}` };
  }
  const creation = exactCreation(request, today);
  if (!creation) return { request, blockers: [], choices: [], question: "What exact day and time should I book?", detail: "The message is still a draft. Nothing has been scheduled or sent." };
  const { action, dateKey, start } = creation;
  const events = allCalendarEvents(document).filter((event) => event.dateKey === dateKey);
  const same = events.filter((event) => event.start === start && event.end - event.start === action.durationMinutes && action.participantIds?.every((id) => event.participantIds?.includes(id)) && normalizeTranscript(event.title) === normalizeTranscript(action.title));
  if (same.length === 1) return { request, event: same[0], existingEventId: same[0]!.id, blockers: [], choices: [], detail: `${same[0]!.title} already exists on ${eventDateLabel(dateKey)} at ${formatTime(start)}. This message will link to it.` };
  const blockers = events.filter((event) => overlaps(start, start + action.durationMinutes, event));
  const movedIds = request.actions.filter((item) => item.type === "move" && item.selector.type === "id").map((item) => item.type === "move" && item.selector.type === "id" ? item.selector.id : "");
  const remaining = blockers.filter(({ id }) => !movedIds.includes(id));
  if (remaining.length) {
    const choices: CalendarMessageChoice[] = [];
    let from = Math.max(DAY_START, start + 15);
    for (let index = 0; index < 2; index += 1) {
      const available = firstAvailable(events, action.durationMinutes, from, document.calendars[dateKey]?.endBoundaryMinutes ?? DAY_END);
      if (available === null) break;
      choices.push({ id: `time-${dateKey}-${available}`, label: `${eventDateLabel(dateKey)} at ${formatTime(available)}`, request: { ...request, actions: request.actions.map((item) => item === action ? { ...action, destination: { type: "absolute", date: { dateKey }, minutes: available } } : item) } });
      from = available + action.durationMinutes;
    }
    if (remaining.length === 1) {
      const other = remaining[0]!;
      const target = { ...other, id: "proposal-window", start, end: start + action.durationMinutes };
      const movedStart = firstAvailable([...events.filter(({ id }) => id !== other.id), target], other.end - other.start, DAY_START, document.calendars[dateKey]?.endBoundaryMinutes ?? DAY_END);
      if (movedStart !== null) choices.push({ id: `move-${other.id}`, label: `Move ${other.title} to ${formatTime(movedStart)}`, request: { ...request, actions: [{ type: "move", selector: { type: "id", id: other.id, date: { dateKey } }, destination: { type: "absolute", date: { dateKey }, minutes: movedStart } }, ...request.actions] } });
    }
    return { request, blockers: remaining, choices: choices.slice(0, 3), question: `${remaining.map(({ title }) => title).join(" and ")} already occupies that time.`, detail: "Choose an offered time, name another day, or explicitly move the other event. Nothing changed." };
  }
  const result = applyLifeTransaction(document, [{ type: "calendar.request", request, confirmed: true }], now);
  if (result.status !== "success") return { request, blockers: [], choices: [], question: result.title, detail: result.detail };
  const before = new Set(allCalendarEvents(document).map(({ id }) => id));
  const event = allCalendarEvents(result.document).find(({ id }) => !before.has(id));
  return { request, event, blockers: [], choices: [], detail: `${event?.title ?? action.title} on ${eventDateLabel(dateKey)}, ${formatTime(start)} for ${action.durationMinutes} minutes.${movedIds.length ? " The other event will move only with this confirmation." : ""}` };
}

export function refineCalendarProposal(proposal: CalendarMessageProposal, value: string, today: string): CalendarRequest | undefined {
  const text = normalizeTranscript(value);
  if (/move (?:the )?other/.test(text)) return proposal.choices.find(({ id }) => id.startsWith("move-"))?.request;
  if (/^(?:leave|keep)\b/.test(text)) return undefined;
  const weekday = weekdayNames.findIndex((name) => new RegExp(`\\b${name}\\b`).test(text));
  const dateKey = weekday >= 0 ? sourceDateKey({ weekday, relation: "named" }, today) : /\btomorrow\b/.test(text) ? sourceDateKey("tomorrow", today) : /\btoday\b/.test(text) ? today : undefined;
  const clock = parseClockExpression(text);
  if (!dateKey && clock.status !== "found") return undefined;
  if (proposal.request.actions.length === 1 && proposal.request.actions[0]?.type === "move") return { ...proposal.request, actions: proposal.request.actions.map((action) => action.type === "move" && action.destination.type === "absolute" ? { ...action, destination: { ...action.destination, ...(dateKey ? { date: { dateKey } } : {}), ...(clock.status === "found" ? { minutes: clock.minutes } : {}) } } : action) };
  return { ...proposal.request, actions: proposal.request.actions.filter((action) => action.type !== "move").map((action) => action.type === "create" && action.destination.type === "absolute" ? { ...action, destination: { ...action.destination, ...(dateKey ? { date: { dateKey } } : {}), ...(clock.status === "found" ? { minutes: clock.minutes } : {}) } } : action) };
}

export function calendarProposalMessage(body: string, before: CalendarRequest, after: CalendarRequest, today: string) {
  const previous = exactCreation(before, today), next = exactCreation(after, today);
  if (!previous || !next || previous.dateKey === next.dateKey && previous.start === next.start) return body;
  return `I've booked ${next.action.title} for ${eventDateLabel(next.dateKey)} at ${formatTime(next.start)}.`;
}
