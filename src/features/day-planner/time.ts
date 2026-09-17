import type { CalendarEvent } from "./model";

export const DAY_START = 7 * 60;
export const DAY_END = 21 * 60;
export const MINUTE_HEIGHT = 1;

// Clock labels represent wall-clock minutes, not instants in a timezone. ICU
// formatter construction is expensive during layout/history re-renders; keep
// the two fixed formats and an explicit UTC reference instead of rebuilding
// locale data for every event label.
const hourFormatter = new Intl.DateTimeFormat("en", { hour: "numeric", timeZone: "UTC" });
const minuteFormatter = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
const clockLabels = new Map<number, string>();

export function formatTime(minutes: number) {
  const cacheable = Number.isInteger(minutes) && minutes >= 0 && minutes <= 24 * 60;
  const cached = cacheable ? clockLabels.get(minutes) : undefined;
  if (cached !== undefined) return cached;
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const date = new Date(Date.UTC(2026, 0, 1, hour, minute));
  const label = (minute === 0 ? hourFormatter : minuteFormatter).format(date);
  if (cacheable) clockLabels.set(minutes, label);
  return label;
}

export function formatRange(event: CalendarEvent) {
  return `${formatTime(event.start)}–${formatTime(event.end)}`;
}

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDayTitle(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year ?? 2026, (month ?? 1) - 1, day ?? 1);

  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function duration(event: CalendarEvent) {
  return event.end - event.start;
}
