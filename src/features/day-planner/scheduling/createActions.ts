import type { CalendarAction, CalendarEvent, CalendarRequest, DayPlan } from "../model";
import { dayPartStart } from "../interpretation/temporal";
import { withEventDefaults } from "../eventDefaults";
import { DAY_END, DAY_START, formatTime } from "../time";
import type { ChangeSet, EngineFailure } from "./engineTypes";
import { syncEventBuffers } from "./linkedBreathingRooms";
import { placeToday, resolve, uniqueId } from "./schedulePlacement";
import { firstAvailable } from "./slots";

export function createOrFit(plan: DayPlan, action: Extract<CalendarAction, { type: "create" | "fit" }>, changes: ChangeSet, request: CalendarRequest, selectedId?: string): EngineFailure | null {
  let event: CalendarEvent | undefined;
  if (action.type === "fit") {
    const matches = plan.events.filter((item) => item.title.toLowerCase().includes(action.title.toLowerCase()));
    if (matches.length > 1) return { status: "clarification", request, clarification: { type: "event", question: `Which ${action.title} do you mean?`, selector: { type: "title", query: action.title }, choices: matches.slice(0, 3).map((item) => ({ id: item.id, label: `${item.title} — ${formatTime(item.start)}` })) } };
    event = matches[0];
  }
  if (!event) {
    const isBuffer = /\b(?:breathe|reset|buffer)\b/i.test(action.title);
    event = withEventDefaults({ id: uniqueId(plan, action.title), title: action.literalTitle ? action.title : action.title.replace(/^./, (letter) => letter.toUpperCase()), dateKey: plan.dateKey, start: DAY_START, end: DAY_START + action.durationMinutes, kind: isBuffer ? "buffer" : "flexible", priority: isBuffer ? "high" : "medium", ...(action.participantIds?.length ? { participantIds: [...action.participantIds] } : {}) });
  } else if (action.type === "fit") {
    event = { ...event, end: event.start + action.durationMinutes };
  }
  const existing = plan.events.some((item) => item.id === event.id);
  if (!existing) plan.events.push(event);
  const exact = action.destination.type === "absolute";
  const failure = placeToday(plan, event, action.destination, changes, request, selectedId, exact, exact);
  if (!failure && !existing) changes.notes.push(`${event.title} added.`);
  return failure;
}

export function createBreathingRoom(
  plan: DayPlan,
  action: Extract<CalendarAction, { type: "createBreathingRoom" }>,
  changes: ChangeSet,
  request: CalendarRequest,
  selectedId?: string,
): EngineFailure | null {
  const destination = action.destination;
  let start: number | null = null;
  let linkedAnchor: { id: string; relation: "before" | "after" } | undefined;
  if (destination.type === "absolute") start = destination.minutes;
  if (destination.type === "window") start = destination.start;
  if (destination.type === "dayPart") start = dayPartStart(destination.part);
  if (destination.type === "nextFree") {
    const blockers = [
      ...plan.events,
      ...(plan.breathingRooms ?? []).map((room) => ({ ...room, title: room.label ?? "Breathing Room", kind: "fixed" as const, priority: "high" as const })),
    ];
    start = firstAvailable(blockers, action.durationMinutes, DAY_START, plan.endBoundaryMinutes ?? DAY_END);
  }
  if (destination.type === "relative") {
    const anchors = resolve(plan, destination.anchor, selectedId, request);
    if (!Array.isArray(anchors)) return anchors;
    const anchor = anchors[0];
    if (!anchor) return { status: "conflict", title: "Anchor not found", detail: "The Breathing Room needs a nearby event.", options: ["Name the event"] };
    linkedAnchor = { id: anchor.id, relation: destination.relation };
    start = destination.relation === "before" ? anchor.start - action.durationMinutes : anchor.end;
  }
  if (destination.type === "unresolved" || start === null) {
    return { status: "conflict", title: "A time is still needed", detail: "Choose where the Breathing Room belongs.", options: ["Name an event before or after it"] };
  }
  if (start < DAY_START || start + action.durationMinutes > (plan.endBoundaryMinutes ?? DAY_END)) {
    return { status: "conflict", title: "Breathing Room is outside the day", detail: "Choose a gap inside your working window.", options: ["Choose another time"] };
  }
  if (linkedAnchor) {
    const existing = (plan.breathingRooms ?? []).find((room) => room.linkedEventId === linkedAnchor.id && room.relation === linkedAnchor.relation);
    if (existing) {
      plan.breathingRooms = (plan.breathingRooms ?? []).map((room) => room.id !== existing.id ? room : linkedAnchor.relation === "before"
        ? { ...room, start: room.start - action.durationMinutes }
        : { ...room, end: room.end + action.durationMinutes });
      syncEventBuffers(plan);
      changes.changedIds.add(existing.id);
      changes.notes.push(`${action.durationMinutes} more minutes of Breathing Room opened ${linkedAnchor.relation} the event.`);
      return null;
    }
  }
  const id = uniqueId(plan, action.label ?? "breathing-room");
  plan.breathingRooms = [...(plan.breathingRooms ?? []), {
    id, dateKey: plan.dateKey, start, end: start + action.durationMinutes,
    protected: action.protected ?? true, source: "user", label: action.label ?? "Breathing room",
    ...(linkedAnchor ? { linkedEventId: linkedAnchor.id, relation: linkedAnchor.relation } : {}),
  }];
  syncEventBuffers(plan);
  changes.changedIds.add(id);
  changes.notes.push(`${action.durationMinutes} minutes of Breathing Room opened at ${formatTime(start)}.`);
  return null;
}


