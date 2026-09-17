import { dateKeyAfter } from "../day-planner/interpretation/temporal";
import type { TemporalScope } from "../../domain/life-model";

const scopeDateFormatter = new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" });
const compactScopeDateFormatter = new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" });

export function formatCompactScopeDate(dateKey: string) {
  return compactScopeDateFormatter.format(dateForKey(dateKey));
}

export function dateKeyFromClock(now: Date) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateForKey(dateKey: string) {
  return new Date(`${dateKey}T12:00:00`);
}

export function nearestWeekday(base: string, weekday: number, strictlyNext = false) {
  const date = dateForKey(base);
  let offset = (weekday - date.getDay() + 7) % 7;
  if (strictlyNext && offset === 0) offset = 7;
  return dateKeyAfter(base, offset);
}

export function weekScope(base: string, startsOn: 0 | 1): TemporalScope {
  const date = dateForKey(base);
  const offset = (date.getDay() - startsOn + 7) % 7;
  const start = dateKeyAfter(base, -offset);
  return { kind: "week", dateKey: start, endDateKey: dateKeyAfter(start, 6) };
}

export function weekendScope(base: string): TemporalScope {
  const start = nearestWeekday(base, 6, true);
  return { kind: "week", dateKey: start, endDateKey: dateKeyAfter(start, 1) };
}

export function dateKeysForScope(scope: TemporalScope) {
  if (scope.kind === "day") return [scope.dateKey];
  const end = scope.endDateKey ?? scope.dateKey;
  const keys: string[] = [];
  for (let offset = 0; offset < 31; offset += 1) {
    const key = dateKeyAfter(scope.dateKey, offset);
    keys.push(key);
    if (key >= end) break;
  }
  return keys;
}

export function formatScopeDate(scope: TemporalScope) {
  const date = dateForKey(scope.dateKey);
  if (scope.kind === "week") {
    const end = dateForKey(scope.endDateKey ?? scope.dateKey);
    return `${new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date)} – ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(end)}`;
  }
  return scopeDateFormatter.format(date);
}

export function scopeLabel(scope: TemporalScope, todayDateKey: string) {
  if (scope.kind === "week") return scope.dateKey <= todayDateKey && (scope.endDateKey ?? scope.dateKey) >= todayDateKey ? "This Week" : formatScopeDate(scope);
  if (scope.dateKey === todayDateKey) return "Today";
  if (scope.dateKey === dateKeyAfter(todayDateKey, 1)) return "Tomorrow";
  return new Intl.DateTimeFormat("en", { weekday: "long" }).format(dateForKey(scope.dateKey));
}
