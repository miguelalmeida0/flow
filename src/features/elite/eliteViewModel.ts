import type { CalendarEvent, DayPlan } from "../day-planner/model";
import { eventStatus } from "../day-planner/eventDefaults";
import { DAY_END, DAY_START, formatTime } from "../day-planner/time";
import type { LifeDocument, TemporalScope, WeatherObservation } from "../../domain/life-model";
import { decideOutfit, weatherAt } from "./weather";
import { dateKeysForScope, formatScopeDate } from "./temporal";

export interface FocusWindow {
  start: number;
  end: number;
  minutes: number;
  anchorTitle?: string;
  sourceEventId?: string;
  sourceTitle?: string;
}

export interface EliteInstinct {
  id: string;
  icon: "leaf" | "sun" | "rain" | "sunset" | "clock";
  title: string;
  detail: string;
  priority: number;
  provenance: string;
}

export interface EliteHomeModel {
  scope: TemporalScope;
  calendar: DayPlan;
  calendars: DayPlan[];
  dateKeys: string[];
  dateLabel: string;
  greeting: string;
  summary: string;
  events: CalendarEvent[];
  focusWindow: FocusWindow;
  focusWindows: Array<FocusWindow & { dateKey: string }>;
  weather?: WeatherObservation;
  weatherRange: WeatherObservation[];
  outfit: ReturnType<typeof decideOutfit>;
  people: Array<{ id: string; name: string; detail: string; time?: string }>;
  instincts: EliteInstinct[];
}

function findFocusWindow(plan: DayPlan, nowMinutes: number): FocusWindow {
  const events = plan.events
    .filter((event) => !["done", "cancelled"].includes(eventStatus(event)))
    .sort((left, right) => left.start - right.start);
  const rooms = (plan.breathingRooms ?? []).filter(({ protected: fixed }) => fixed).map((room) => ({ start: room.start, end: room.end, title: room.label ?? "Breathing Room" }));
  const anchors = [...events.filter((event) => event.kind === "fixed" || event.kind === "protected" || event.protected), ...rooms]
    .sort((left, right) => left.start - right.start);
  // Future scopes show the same local moment in that day's schedule. This is
  // what makes time travel comparable instead of pretending every future day
  // is viewed at 9 AM.
  let start = nowMinutes;
  const boundary = plan.endBoundaryMinutes ?? DAY_END;
  if (start < DAY_START || start >= boundary) start = 9 * 60;
  const occupied = events.find((event) => event.start <= start && start < event.end);
  if (occupied && occupied.kind === "flexible") {
    const nextAnchor = anchors.find((event) => event.start >= occupied.end);
    return { start, end: occupied.end, minutes: Math.max(0, occupied.end - start), sourceEventId: occupied.id, sourceTitle: occupied.title, ...(nextAnchor?.title ? { anchorTitle: nextAnchor.title } : {}) };
  }
  if (occupied) start = occupied.end;
  const next = anchors.find((event) => event.start > start);
  const end = Math.min(next?.start ?? boundary, boundary);
  const minutes = Math.max(0, end - start);
  if (minutes >= 10) return { start, end, minutes, ...(next?.title ? { anchorTitle: next.title } : {}) };

  let cursor = DAY_START;
  for (const event of [...events, ...rooms].sort((a, b) => a.start - b.start)) {
    if (event.start - cursor >= 15) return { start: cursor, end: event.start, minutes: event.start - cursor, anchorTitle: event.title };
    cursor = Math.max(cursor, event.end);
  }
  return { start: cursor, end: boundary, minutes: Math.max(0, boundary - cursor) };
}

export function focusWindowBefore(plan: DayPlan, query: string, nowMinutes: number): { window?: FocusWindow; matches: CalendarEvent[] } {
  const normalized = query.toLowerCase().replace(/^(?:the|my)\s+/, "").trim();
  const matches = plan.events.filter((event) => event.title.toLowerCase().includes(normalized) && !["done", "cancelled"].includes(eventStatus(event)));
  if (matches.length !== 1) return { matches };
  const anchor = matches[0]!;
  const blockers = [
    ...plan.events.filter((event) => event.id !== anchor.id && event.end <= anchor.start && !["done", "cancelled"].includes(eventStatus(event))),
    ...(plan.breathingRooms ?? []).filter((room) => room.end <= anchor.start),
  ].sort((left, right) => right.end - left.end);
  const start = Math.max(Math.ceil(nowMinutes / 5) * 5, blockers[0]?.end ?? DAY_START);
  if (start >= anchor.start) return { matches, window: { start, end: anchor.start, minutes: 0, anchorTitle: anchor.title } };
  return { matches, window: { start, end: anchor.start, minutes: anchor.start - start, anchorTitle: anchor.title } };
}

function relevantPeople(document: LifeDocument, events: CalendarEvent[], dateKeys: string[]) {
  const firstDate = dateKeys[0] ?? "0000-00-00";
  const lastDate = dateKeys.at(-1) ?? "9999-99-99";
  const commitments = document.commitments
    .filter(({ status, dueAt }) => status !== "completed" && (!dueAt || (dueAt.slice(0, 10) >= firstDate && dueAt.slice(0, 10) <= lastDate)))
    .sort((left, right) => (left.dueAt ?? "9999").localeCompare(right.dueAt ?? "9999"))
    .slice(0, 2)
    .map((commitment) => ({
      id: commitment.id,
      name: document.people.find(({ id }) => id === commitment.personId)?.name ?? "Someone",
      detail: commitment.title,
      ...(commitment.dueAt ? { time: new Intl.DateTimeFormat("en", { weekday: "short" }).format(new Date(commitment.dueAt)) } : {}),
    }));
  if (commitments.length) return commitments;
  return events
    .filter(({ title }) => /meeting|interview|call|creative review/i.test(title))
    .slice(0, 2)
    .map((event) => ({ id: event.id, name: "Team", detail: event.title, time: `${dateKeys.length > 1 ? `${new Intl.DateTimeFormat("en", { weekday: "short" }).format(new Date(`${event.dateKey}T12:00:00`))} · ` : ""}${formatTime(event.start)} – ${formatTime(event.end)}` }));
}

function buildInstincts(document: LifeDocument, focus: FocusWindow, now: Date): EliteInstinct[] {
  const candidates: EliteInstinct[] = [];
  if (focus.minutes >= 20) candidates.push({ id: "clear-focus-window", icon: "leaf", title: "Great window for deep work", detail: `Now – ${formatTime(focus.end)}`, priority: 100, provenance: focus.sourceTitle ? `${focus.minutes} usable minutes in ${focus.sourceTitle}, until ${formatTime(focus.end)}.` : `${focus.minutes} clear minutes before ${focus.anchorTitle ?? "your boundary"}.` });
  // Weather, rain, UV, and daylight are already explicit in the adjacent
  // Weather lens. Good to know ranks conclusions from other facts instead of
  // repeating telemetry the person can already see.
  const open = document.commitments.filter(({ status }) => status !== "completed").length;
  if (open) candidates.push({ id: "commitments", icon: "clock", title: `${open} promise${open === 1 ? "" : "s"} still open`, detail: "Keep the next commitment visible", priority: 60, provenance: `${open} locally stored open commitment${open === 1 ? "" : "s"}.` });
  const nowMs = now.getTime();
  return candidates
    .filter((item) => new Date(document.instinctState.dismissedUntil[item.id] ?? 0).getTime() <= nowMs)
    .sort((a, b) => {
      const novelty = (item: EliteInstinct) => {
        const lastShown = new Date(document.instinctState.lastShownAt[item.id] ?? 0).getTime();
        return lastShown > 0 && nowMs - lastShown < 12 * 60 * 60 * 1000 ? 50 : 0;
      };
      return (b.priority - novelty(b)) - (a.priority - novelty(a));
    })
    .slice(0, 4);
}

export function buildEliteHomeModel(document: LifeDocument, scope: TemporalScope, now: Date): EliteHomeModel {
  const dateKeys = dateKeysForScope(scope);
  const calendars = dateKeys.map((dateKey) => document.calendars[dateKey]
    ?? (document.calendar.dateKey === dateKey
      ? document.calendar
      : { dateKey, events: [], deferred: [], breathingRooms: [], endBoundaryMinutes: DAY_END }));
  const calendar = calendars[0]!;
  const isToday = scope.dateKey === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const focusWindows = calendars.map((plan) => ({ ...findFocusWindow(plan, nowMinutes), dateKey: plan.dateKey }));
  const focusWindow: FocusWindow = scope.kind === "week"
    ? {
        start: focusWindows[0]?.start ?? nowMinutes,
        end: focusWindows.at(-1)?.end ?? nowMinutes,
        minutes: focusWindows.reduce((total, window) => total + window.minutes, 0),
        anchorTitle: `${focusWindows.filter(({ minutes }) => minutes > 0).length} open days`,
      }
    : focusWindows[0]!;
  const weatherRange = dateKeys.map((dateKey) => weatherAt(document.environment.weatherByDate[dateKey], now)).filter((item): item is WeatherObservation => Boolean(item));
  const weather = scope.kind === "week"
    ? [...weatherRange].sort((left, right) => (right.precipitationProbability ?? -1) - (left.precipitationProbability ?? -1) || (left.apparentTemperatureC ?? left.minimumC ?? 100) - (right.apparentTemperatureC ?? right.minimumC ?? 100))[0]
    : weatherRange[0];
  const outfit = decideOutfit(weather);
  const hour = now.getHours();
  const greeting = scope.kind === "week" ? "Here’s the shape of your week." : isToday ? `Good ${hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"}, ${document.preferences.firstName}.` : `Here’s ${new Intl.DateTimeFormat("en", { weekday: "long" }).format(new Date(`${scope.dateKey}T12:00:00`))}, ${document.preferences.firstName}.`;
  const summary = scope.kind === "week"
    ? `${Math.round(focusWindow.minutes / 60)} hours of clear focus time across ${dateKeys.length} days.`
    : focusWindow.sourceTitle ? `You have ${focusWindow.minutes} minutes available in ${focusWindow.sourceTitle}, until ${formatTime(focusWindow.end)}.`
      : focusWindow.minutes > 0 ? `You have ${focusWindow.minutes} minutes free before ${focusWindow.anchorTitle ?? "your day ends"}.` : `Your next anchor is already in motion.`;
  const events = calendars.flatMap(({ events: dayEvents }) => dayEvents).filter((event) => !["cancelled"].includes(eventStatus(event))).sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.start - b.start);
  return {
    scope, calendar, calendars, dateKeys,
    dateLabel: formatScopeDate(scope),
    greeting, summary, events, focusWindow, focusWindows, weather, weatherRange, outfit,
    people: relevantPeople(document, events, dateKeys),
    instincts: buildInstincts(document, focusWindow, now),
  };
}
