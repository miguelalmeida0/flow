import type { CalendarEvent, DayPlan } from "../model";

export function roomsLinkedTo(plan: DayPlan, eventId: string) {
  return (plan.breathingRooms ?? []).filter((room) => room.linkedEventId === eventId && room.relation);
}

export function hasProtectedLinkedRoom(plan: DayPlan, eventId: string) {
  return roomsLinkedTo(plan, eventId).some((room) => room.protected);
}

export function moveLinkedRooms(plan: DayPlan, eventId: string, delta: number, dateKey?: string) {
  plan.breathingRooms = (plan.breathingRooms ?? []).map((room) => room.linkedEventId === eventId
    ? { ...room, dateKey: dateKey ?? room.dateKey, start: room.start + delta, end: room.end + delta }
    : room);
}

export function removeLinkedRooms(plan: DayPlan, eventIds: Set<string>) {
  const removed = (plan.breathingRooms ?? []).filter((room) => room.linkedEventId && eventIds.has(room.linkedEventId));
  plan.breathingRooms = (plan.breathingRooms ?? []).filter((room) => !room.linkedEventId || !eventIds.has(room.linkedEventId));
  return removed;
}

export function setLinkedRoomOwner(plan: DayPlan, fromId: string, to: CalendarEvent, relation?: "before" | "after") {
  plan.breathingRooms = (plan.breathingRooms ?? []).map((room) => {
    if (room.linkedEventId !== fromId || !room.relation || (relation && room.relation !== relation)) return room;
    const length = room.end - room.start;
    const start = room.relation === "before" ? to.start - length : to.end;
    return { ...room, linkedEventId: to.id, dateKey: to.dateKey, start, end: start + length };
  });
}

export function syncEventBuffers(plan: DayPlan) {
  const totals = new Map<string, { before: number; after: number }>();
  for (const room of plan.breathingRooms ?? []) {
    if (!room.linkedEventId || !room.relation) continue;
    const value = totals.get(room.linkedEventId) ?? { before: 0, after: 0 };
    value[room.relation] += room.end - room.start;
    totals.set(room.linkedEventId, value);
  }
  const apply = (event: CalendarEvent) => {
    const value = totals.get(event.id) ?? { before: 0, after: 0 };
    return { ...event, bufferBeforeMinutes: value.before, bufferAfterMinutes: value.after };
  };
  plan.events = plan.events.map(apply);
  plan.deferred = plan.deferred.map(apply);
}

export function linkedGeometryError(plan: DayPlan) {
  const events = [...plan.events, ...plan.deferred];
  for (const room of plan.breathingRooms ?? []) {
    if (!room.linkedEventId) continue;
    const event = events.find((candidate) => candidate.id === room.linkedEventId);
    if (!event) return `${room.label ?? "Breathing Room"} is linked to a missing event.`;
    if (!room.relation) return `${room.label ?? "Breathing Room"} is missing its before-or-after relation.`;
    if (room.dateKey !== event.dateKey) return `${room.label ?? "Breathing Room"} is on a different day from ${event.title}.`;
    if (room.relation === "before" && room.end !== event.start) return `${room.label ?? "Breathing Room"} no longer ends when ${event.title} starts.`;
    if (room.relation === "after" && room.start !== event.end) return `${room.label ?? "Breathing Room"} no longer starts when ${event.title} ends.`;
  }
  for (const event of events) {
    const linked = roomsLinkedTo(plan, event.id);
    const before = linked.filter((room) => room.relation === "before").reduce((total, room) => total + room.end - room.start, 0);
    const after = linked.filter((room) => room.relation === "after").reduce((total, room) => total + room.end - room.start, 0);
    if ((event.bufferBeforeMinutes ?? 0) !== before || (event.bufferAfterMinutes ?? 0) !== after) {
      return `${event.title} has stale Breathing Room metadata.`;
    }
  }
  return null;
}

export function linkedRoomViolationMinutes(plan: DayPlan) {
  return linkedGeometryError(plan) ? 1 : 0;
}
