import type { DayPlan } from "../features/day-planner/model";
import type { LifeDocument } from "./life-model";

export function emptyDay(dateKey: string): DayPlan {
  return { dateKey, events: [], deferred: [], breathingRooms: [] };
}

function cloneDay(plan: DayPlan): DayPlan {
  return structuredClone(plan);
}

/**
 * Calendar's mature scheduler works on one day and may emit future items in
 * `deferred`. The world owns many days, so this boundary repartitions every
 * event by date after a successful scheduler transaction.
 */
export function normalizeCalendarWorld(document: LifeDocument, activeDateKey = document.calendar.dateKey): LifeDocument {
  const sourceDays = { ...document.calendars, [document.calendar.dateKey]: document.calendar };
  const byDate = new Map<string, DayPlan>();
  const ids = new Set<string>();

  function addItem(sourceDateKey: string, item: DayPlan["events"][number], fromActiveDeferred = false) {
    if (ids.has(item.id)) {
      // The single-day scheduler temporarily mirrors untouched events from
      // other days into the active plan's deferred list for collision
      // awareness. That internal mirror is safe to ignore only when the
      // canonical item is byte-for-byte identical. Every other cross-day ID
      // collision is corrupt input and must fail loudly instead of losing the
      // later event.
      const canonical = document.calendars[item.dateKey];
      const mirrored = fromActiveDeferred
        && sourceDateKey === document.calendar.dateKey
        && item.dateKey !== sourceDateKey
        && Boolean(canonical)
        && [...(canonical?.events ?? []), ...(canonical?.deferred ?? [])].some((candidate) => candidate.id === item.id && JSON.stringify(candidate) === JSON.stringify(item));
      if (mirrored) return;
      throw new Error(`Duplicate calendar identity ${item.id}.`);
    }
    ids.add(item.id);
    const target = byDate.get(item.dateKey) ?? emptyDay(item.dateKey);
    target.events.push(structuredClone(item));
    byDate.set(item.dateKey, target);
  }

  const orderedDays = Object.entries(sourceDays).sort(([left], [right]) => Number(left === document.calendar.dateKey) - Number(right === document.calendar.dateKey));
  for (const [dateKey, source] of orderedDays) {
    const base = byDate.get(dateKey) ?? emptyDay(dateKey);
    base.endBoundaryMinutes = source.endBoundaryMinutes ?? base.endBoundaryMinutes;
    byDate.set(dateKey, base);
    for (const event of source.events) addItem(dateKey, event);
    for (const event of source.deferred) addItem(dateKey, event, dateKey === document.calendar.dateKey);
    for (const room of source.breathingRooms ?? []) {
      if (ids.has(room.id)) throw new Error(`Duplicate calendar identity ${room.id}.`);
      ids.add(room.id);
      const target = byDate.get(room.dateKey) ?? emptyDay(room.dateKey);
      target.breathingRooms = [...(target.breathingRooms ?? []), structuredClone(room)];
      byDate.set(room.dateKey, target);
    }
  }

  for (const plan of byDate.values()) {
    plan.events.sort((left, right) => left.start - right.start || left.id.localeCompare(right.id));
    plan.deferred = [];
  }
  const active = cloneDay(byDate.get(activeDateKey) ?? emptyDay(activeDateKey));
  const calendars = Object.fromEntries([...byDate].map(([key, value]) => [key, cloneDay(value)]));
  calendars[activeDateKey] = cloneDay(active);
  return { ...document, calendar: active, calendars };
}

export function projectCalendarDate(document: LifeDocument, dateKey: string): LifeDocument {
  const normalized = normalizeCalendarWorld(document, document.calendar.dateKey);
  const calendar = cloneDay(normalized.calendars[dateKey] ?? emptyDay(dateKey));
  return { ...normalized, calendar, calendars: { ...normalized.calendars, [dateKey]: cloneDay(calendar) } };
}

export function allCalendarPlans(document: LifeDocument) {
  return Object.values({ ...document.calendars, [document.calendar.dateKey]: document.calendar });
}

export function allCalendarEvents(document: LifeDocument) {
  return allCalendarPlans(document).flatMap((plan) => [...plan.events, ...plan.deferred]);
}
