import type { CalendarRequest, SourceDate } from "../model";
import { dateKeyAfter } from "./temporal";

export const weekdayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const dateWords = `(?:(?:this|next|last)\\s+)?(?:${weekdayNames.join("|")})|today|tomorrow|yesterday|\\d{4}-\\d{2}-\\d{2}`;

/** Only source-position date spans: possessives, attached prepositions, suffixes.
 * Wednesday Club and quoted titles remain ordinary titles. */
export function extractSourceDate(text: string): { text: string; date?: SourceDate; literalDateQuery?: string } {
  const possessive = text.match(new RegExp(`^(?:(?:the|my)\\s+)?(${dateWords})'s\\s+`));
  const missingApostrophe = text.match(new RegExp(`^(?:(?:the|my)\\s+)?((?:(?:this|next|last)\\s+)?(?:${weekdayNames.join("|")}))s\\s+`));
  const weekdayPrefix = text.match(new RegExp(`^(?:(?:the|my)\\s+)?((?:(?:this|next|last)\\s+)?(?:${weekdayNames.join("|")}))\\s+(?=.*\\b(?:appointments?|meetings?|events?|tasks?|blocks?|calls?)\\b|\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)\\s+)`));
  const qualified = text.match(new RegExp(`\\s+(?:on|at|from|for)\\s+(${dateWords})(?=\\s+(?:at|from|starting|starts|in|during)\\b|$)`));
  const suffix = text.match(new RegExp(`\\s+(${dateWords})$`));
  const match = possessive ?? missingApostrophe ?? weekdayPrefix ?? qualified ?? suffix;
  if (!match || match.index === undefined) return { text };
  const value = match[1]!;
  let date: SourceDate;
  if (/^\d{4}-/.test(value)) date = { dateKey: value };
  else if (["today", "tomorrow", "yesterday"].includes(value)) date = value as "today" | "tomorrow" | "yesterday";
  else {
    const weekday = weekdayNames.findIndex((name) => value.endsWith(name));
    date = { weekday, relation: value.startsWith("next ") ? "next" : value.startsWith("last ") ? "last" : value.startsWith("this ") ? "this" : "named" };
  }
  return { text: `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`.trim(), date,
    ...(match === missingApostrophe || match === weekdayPrefix ? { literalDateQuery: text.replace(/^(?:the|my)\s+/, "") } : {}) };
}

export function sourceDateKey(date: SourceDate, today: string, visibleWeekStart?: string): string {
  if (date === "today") return today;
  if (date === "tomorrow") return dateKeyAfter(today, 1);
  if (date === "yesterday") return dateKeyAfter(today, -1);
  if ("dateKey" in date) return date.dateKey;
  if (visibleWeekStart && date.relation === "named") {
    const weekday = new Date(`${visibleWeekStart}T12:00:00`).getDay();
    return dateKeyAfter(visibleWeekStart, (date.weekday - weekday + 7) % 7);
  }
  const current = new Date(`${today}T12:00:00`).getDay();
  const forward = (date.weekday - current + 7) % 7;
  if (date.relation === "last") return dateKeyAfter(today, forward - 7);
  if (date.relation === "this") return dateKeyAfter(today, date.weekday - current);
  return dateKeyAfter(today, date.relation === "next" && !forward ? 7 : forward);
}

export function validSourceDate(dateKey: string) {
  const parsed = new Date(`${dateKey}T12:00:00`);
  return !Number.isNaN(parsed.getTime()) && `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}` === dateKey;
}

/** Bind selectors once, after all clause primitives have produced a request. */
export function bindSourceDates<T>(value: T, today: string, visibleWeekStart?: string): T {
  if (Array.isArray(value)) return value.map((item) => bindSourceDates(item, today, visibleWeekStart)) as T;
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const selectorTypes = ["id", "selected", "title", "source", "position", "filter", "relativeEvent", "anaphor", "multi", "all"];
  return Object.fromEntries(Object.entries(record).map(([key, item]) => [key,
    key === "date" && item !== undefined && selectorTypes.includes(String(record.type))
      ? { dateKey: sourceDateKey(item as SourceDate, today, visibleWeekStart) }
      : bindSourceDates(item, today, visibleWeekStart),
  ])) as T;
}

/** Relative destinations mean civil tomorrow even when viewing another day. */
export function bindRequestDestinations(request: CalendarRequest, today: string): CalendarRequest {
  return { ...request, actions: request.actions.map((action) => {
    const concrete = (date: "today" | "tomorrow" | { dateKey: string }) => typeof date === "string" ? { dateKey: sourceDateKey(date, today) } : date;
    if (action.type === "defer") return { ...action, date: concrete(action.date) };
    if ("destination" in action && action.destination && "date" in action.destination && action.destination.date) return { ...action, destination: { ...action.destination, date: concrete(action.destination.date) } };
    return action;
  }) };
}
