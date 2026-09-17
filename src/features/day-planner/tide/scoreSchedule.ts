import { eventImportance, eventMobility } from "../eventDefaults";
import type { CalendarEvent, DayPlan } from "../model";
import { DAY_END, DAY_START } from "../time";
import { linkedRoomViolationMinutes } from "../scheduling/linkedBreathingRooms";

export interface ScheduleScore {
  overflowMinutes: number;
  movementMinutes: number;
  fragments: number;
  usefulOpenMinutes: number;
  bufferViolationMinutes: number;
}

function movementWeight(event: CalendarEvent) {
  const importance = { normal: 1, important: 3, critical: 8 }[eventImportance(event)];
  const mobility = { fluid: 1, light: 2, heavy: 5, anchored: 1000 }[eventMobility(event)];
  return importance * mobility;
}

export function scoreSchedule(before: DayPlan, after: DayPlan): ScheduleScore {
  const boundary = after.endBoundaryMinutes ?? DAY_END;
  const overflowMinutes = after.events.reduce((total, event) => total + Math.max(0, event.end - boundary), 0);
  const movementMinutes = after.events.reduce((total, event) => {
    const origin = before.events.find((candidate) => candidate.id === event.id);
    return total + (origin ? Math.abs(event.start - origin.start) * movementWeight(event) : 0);
  }, 0);
  const occupied = [...after.events, ...(after.breathingRooms ?? []).filter((room) => room.dateKey === after.dateKey)].sort((left, right) => left.start - right.start);
  let usefulOpenMinutes = 0;
  let fragments = 0;
  let cursor = DAY_START;
  for (const item of occupied) {
    const gap = Math.max(0, item.start - cursor);
    if (gap >= 30) usefulOpenMinutes += gap;
    else if (gap > 0) fragments += 1;
    cursor = Math.max(cursor, item.end);
  }
  const lastGap = Math.max(0, boundary - cursor);
  if (lastGap >= 30) usefulOpenMinutes += lastGap;
  else if (lastGap > 0) fragments += 1;
  return { overflowMinutes, movementMinutes, fragments, usefulOpenMinutes, bufferViolationMinutes: linkedRoomViolationMinutes(after) };
}
