import type { CalendarAction, CalendarEvent, DayPlan } from "../model";
import { withEventDefaults } from "../eventDefaults";
import { DAY_END, DAY_START, duration } from "../time";
import type { ChangeSet, EngineFailure } from "./engineTypes";
import { roomsLinkedTo, setLinkedRoomOwner, syncEventBuffers } from "./linkedBreathingRooms";
import { uniqueId } from "./schedulePlacement";
import { byStart, firstAvailable } from "./slots";

export function updateEvents(plan: DayPlan, targets: CalendarEvent[], action: Extract<CalendarAction, { type: "update" }>, changes: ChangeSet) {
  const ids = new Set(targets.map((event) => event.id));
  let updatedAny = false;
  const apply = (event: CalendarEvent) => {
    if (!ids.has(event.id)) return event;
    const labels = new Set(event.labels ?? []);
    action.patch.addLabels?.forEach((label) => labels.add(label));
    action.patch.removeLabels?.forEach((label) => {
      const match = [...labels].find((candidate) => candidate.toLowerCase() === label.toLowerCase());
      if (match) labels.delete(match);
    });
    const properties = { ...action.patch };
    delete properties.addLabels;
    delete properties.removeLabels;
    // A requested title is user data, not presentation copy. Preserve its
    // casing and punctuation exactly through the atomic scheduler boundary.
    const updated = withEventDefaults({ ...event, ...properties, labels: [...labels] });
    if (JSON.stringify(updated) !== JSON.stringify(event)) {
      changes.changedIds.add(event.id);
      updatedAny = true;
    }
    return updated;
  };
  plan.events = plan.events.map(apply);
  plan.deferred = plan.deferred.map(apply);
  const properties = Object.keys(action.patch).map((key) => key === "addLabels" || key === "removeLabels" ? "labels" : key);
  changes.notes.push(updatedAny
    ? `${targets.map((event) => event.title).join(", ")} updated: ${[...new Set(properties)].join(", ")}.`
    : `${targets.map((event) => event.title).join(", ")} already matched those settings.`);
}

export function splitEvent(plan: DayPlan, target: CalendarEvent, action: Extract<CalendarAction, { type: "split" }>, changes: ChangeSet): EngineFailure | null {
  const total = duration(target);
  const zeroCount = action.durations.filter((minutes) => minutes === 0).length;
  const explicitTotal = action.durations.reduce((sum, minutes) => sum + minutes, 0);
  const remainder = total - explicitTotal;
  let remainderCursor = Math.max(0, remainder);
  let zeroIndex = 0;
  const durations = action.durations.map((minutes) => {
    if (minutes) return minutes;
    const slotsLeft = zeroCount - zeroIndex;
    const allocated = Math.ceil(remainderCursor / Math.max(1, slotsLeft));
    zeroIndex += 1;
    remainderCursor -= allocated;
    return allocated;
  });
  if (durations.length < 2 || durations.some((minutes) => minutes < 15)) {
    return { status: "conflict", title: "Sessions are too short", detail: "Each split session must be at least 15 minutes.", options: ["Choose longer sessions"] };
  }
  const groupId = target.linkedGroupId ?? `group-${target.id}`;
  const occupied = plan.events.filter((event) => event.id !== target.id);
  const parts: CalendarEvent[] = [];
  for (let index = 0; index < durations.length; index += 1) {
    const length = durations[index]!;
    const preferred = index === 0 ? target.start : (parts.at(-1)?.end ?? target.end);
    const start = firstAvailable([...occupied, ...parts], length, preferred, plan.endBoundaryMinutes ?? DAY_END)
      ?? firstAvailable([...occupied, ...parts], length, DAY_START, plan.endBoundaryMinutes ?? DAY_END);
    if (start === null) return { status: "conflict", title: "The sessions do not fit", detail: `${durations.length} sessions need more schedulable time.`, options: ["Shorten the sessions", "Defer other flexible work"] };
    const id = index === 0 ? target.id : uniqueId({ ...plan, events: [...plan.events, ...parts] }, `${target.id}-part-${index + 1}`);
    parts.push(withEventDefaults({
      ...target, id, start, end: start + length, linkedGroupId: groupId,
      bufferBeforeMinutes: 0, bufferAfterMinutes: 0,
      title: `${target.title.replace(/ · \d+\/\d+$/, "")} · ${index + 1}/${durations.length}`,
    }));
    changes.changedIds.add(id);
  }
  plan.events = byStart([...occupied, ...parts]);
  const first = parts[0]!;
  const last = parts.at(-1)!;
  if (roomsLinkedTo(plan, target.id).some((room) => room.relation === "before")) setLinkedRoomOwner(plan, target.id, first, "before");
  if (roomsLinkedTo(plan, target.id).some((room) => room.relation === "after")) setLinkedRoomOwner(plan, target.id, last, "after");
  syncEventBuffers(plan);
  changes.notes.push(`${target.title} split into ${parts.length} linked sessions.`);
  return null;
}

export function mergeEvents(plan: DayPlan, targets: CalendarEvent[], title: string | undefined, changes: ChangeSet): EngineFailure | null {
  if (targets.length < 2) return { status: "conflict", title: "More events are needed", detail: "Choose at least two events to combine.", options: ["Name two event titles"] };
  if (targets.some((event) => event.dateKey !== plan.dateKey)) {
    return { status: "conflict", title: "Bring those events to one day first", detail: "Merge works only when every source event is on today’s schedule. Nothing changed.", options: ["Move the deferred event back today", "Keep them separate"] };
  }
  const total = targets.reduce((minutes, event) => minutes + duration(event), 0);
  const canonical = byStart(targets)[0]!;
  const occupied = plan.events.filter((event) => !targets.some((target) => target.id === event.id));
  const targetIds = new Set(targets.map((event) => event.id));
  const linked = (plan.breathingRooms ?? []).filter((room) => room.linkedEventId && targetIds.has(room.linkedEventId));
  const beforeRooms = linked.filter((room) => room.relation === "before");
  const afterRooms = linked.filter((room) => room.relation === "after");
  const beforeMinutes = beforeRooms.reduce((minutes, room) => minutes + room.end - room.start, 0);
  const afterMinutes = afterRooms.reduce((minutes, room) => minutes + room.end - room.start, 0);
  const roomBlockers: CalendarEvent[] = (plan.breathingRooms ?? []).filter((room) => !linked.some((candidate) => candidate.id === room.id)).map((room) => ({
    ...room, title: room.label ?? "Breathing Room", kind: "fixed", priority: "high",
  }));
  const compositeDuration = beforeMinutes + total + afterMinutes;
  const compositeStart = firstAvailable([...occupied, ...roomBlockers], compositeDuration, Math.max(DAY_START, canonical.start - beforeMinutes), plan.endBoundaryMinutes ?? DAY_END)
    ?? firstAvailable([...occupied, ...roomBlockers], compositeDuration, DAY_START, plan.endBoundaryMinutes ?? DAY_END);
  if (compositeStart === null) return { status: "conflict", title: "The batch does not fit", detail: `${targets.map((event) => event.title).join(", ")} and their Breathing Room need ${compositeDuration} continuous minutes.`, options: ["Choose another day", "Keep them separate"] };
  const start = compositeStart + beforeMinutes;
  const ancestry = [...new Set(targets.flatMap((event) => event.mergedFromIds?.length ? event.mergedFromIds : [event.id]))];
  const merged = withEventDefaults({
    ...canonical,
    title: title || `${targets.map((event) => event.title.replace(/ · \d+\/\d+$/, "")).join(" + ")}`,
    start, end: start + total, linkedGroupId: canonical.linkedGroupId ?? `merge-${canonical.id}`,
    mergedFromIds: ancestry,
  });
  plan.events = byStart([...occupied, merged]);
  let beforeCursor = start - beforeMinutes;
  let afterCursor = merged.end;
  plan.breathingRooms = (plan.breathingRooms ?? []).map((room) => {
    if (!room.linkedEventId || !targetIds.has(room.linkedEventId) || !room.relation) return room;
    const roomDuration = room.end - room.start;
    const nextStart = room.relation === "before" ? beforeCursor : afterCursor;
    if (room.relation === "before") beforeCursor += roomDuration;
    else afterCursor += roomDuration;
    changes.changedIds.add(room.id);
    return { ...room, linkedEventId: merged.id, dateKey: merged.dateKey, start: nextStart, end: nextStart + roomDuration };
  });
  syncEventBuffers(plan);
  targets.forEach((event) => changes.changedIds.add(event.id));
  changes.notes.push(`${targets.length} events combined into ${merged.title}.`);
  return null;
}

