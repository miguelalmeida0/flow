import type { CalendarEvent } from "../model";
import { DAY_END, DAY_START, duration } from "../time";

export function byStart(events: CalendarEvent[]) {
  return [...events].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
}

export function overlaps(start: number, end: number, event: CalendarEvent) {
  return start < event.end && end > event.start;
}

export function firstAvailable(blocked: CalendarEvent[], length: number, from: number, to: number) {
  let cursor = from;
  for (const event of byStart(blocked)) {
    if (event.end <= cursor || event.start >= to) continue;
    if (event.start - cursor >= length) return cursor;
    cursor = Math.max(cursor, event.end);
  }
  return cursor + length <= to ? cursor : null;
}

export function lastAvailable(blocked: CalendarEvent[], length: number, from: number, to: number) {
  let cursor = to;
  for (const event of byStart(blocked).reverse()) {
    if (event.start >= cursor || event.end <= from) continue;
    if (cursor - event.end >= length) return cursor - length;
    cursor = Math.min(cursor, event.start);
  }
  return cursor - length >= from ? cursor - length : null;
}

export function hasCollision(event: CalendarEvent, others: CalendarEvent[]) {
  return others.some((other) => other.id !== event.id && other.dateKey === event.dateKey && overlaps(event.start, event.end, other));
}

export function suggestAlternativeSlots(
  events: CalendarEvent[],
  target: CalendarEvent,
  limit = 3,
) {
  const blocked = events.filter((event) => event.id !== target.id);
  const length = duration(target);
  const starts: number[] = [];
  for (let start = DAY_START; start + length <= DAY_END; start += 15) {
    if (start === target.start) continue;
    const candidate = { ...target, start, end: start + length };
    if (!hasCollision(candidate, blocked)) starts.push(start);
  }
  return starts
    .sort((left, right) => Math.abs(left - target.start) - Math.abs(right - target.start) || right - left)
    .slice(0, limit);
}
