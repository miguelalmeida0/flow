import type { DateTarget, Destination, EventSelector } from "../model";
import { numberToken, parseNumberWords } from "./numbers";

const DAY_PART_START = { morning: 9 * 60, afternoon: 14 * 60 } as const;

export function parseDurationExpression(text: string): number | null {
  if (/\b(?:half an hour|half hour)\b/.test(text)) return 30;
  if (/\b(?:a quarter hour|quarter of an hour|quarter hour)\b/.test(text)) return 15;
  const hourMinute = text.match(new RegExp(`\\b(${numberToken})\\s*-?\\s*hours?\\s*(?:and\\s*)?(${numberToken})?\\s*-?\\s*minutes?`));
  if (hourMinute) {
    const hours = parseNumberWords(hourMinute[1] ?? "") ?? 0;
    const minutes = parseNumberWords(hourMinute[2] ?? "") ?? 0;
    return hours * 60 + minutes;
  }
  const hours = text.match(new RegExp(`\\b(${numberToken})\\s*-?\\s*hours?\\b`));
  if (hours) return (parseNumberWords(hours[1] ?? "") ?? 0) * 60;
  const minutes = text.match(new RegExp(`\\b(${numberToken})\\s*-?\\s*(?:minutes?|mins?|min)\\b`));
  return minutes ? parseNumberWords(minutes[1] ?? "") : null;
}

function wordClock(text: string): { hour: number; minute: number } | null {
  const hundred = text.match(new RegExp(`(${numberToken}) hundred`));
  if (hundred) return { hour: parseNumberWords(hundred[1] ?? "") ?? -1, minute: 0 };
  const half = text.match(new RegExp(`half past (${numberToken})`));
  if (half) return { hour: parseNumberWords(half[1] ?? "") ?? -1, minute: 30 };
  const quarterTo = text.match(new RegExp(`quarter to (${numberToken})`));
  if (quarterTo) return { hour: (parseNumberWords(quarterTo[1] ?? "") ?? 0) - 1, minute: 45 };
  const quarterPast = text.match(new RegExp(`quarter past (${numberToken})`));
  if (quarterPast) return { hour: parseNumberWords(quarterPast[1] ?? "") ?? -1, minute: 15 };
  const spokenPair = text.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(ten|fifteen|twenty(?:[- ]five)?|thirty|forty(?:[- ]five)?|fifty(?:[- ]five)?)\b/);
  if (spokenPair) {
    return {
      hour: parseNumberWords(spokenPair[1] ?? "") ?? -1,
      minute: parseNumberWords(spokenPair[2] ?? "") ?? -1,
    };
  }
  return null;
}

export type ClockResult = { status: "found"; minutes: number } | { status: "missing" } | { status: "invalid" };

/** Full structural source span, so “eleven thirty meeting” does not leave a
 * bogus title qualifier “thirty”. Only the matched clock is removed. */
export function clockExpressionRange(text: string): { start: number; end: number } | undefined {
  const spoken = "(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)";
  const minute = "(?:ten|fifteen|twenty(?:[- ]five)?|thirty|forty(?:[- ]five)?|fifty(?:[- ]five)?)";
  const patterns = [
    /\b(?:noon|midnight)\b/,
    new RegExp(`\\b(?:half past|quarter (?:to|past))\\s+${numberToken}(?:\\s*(?:am|pm|oclock))?\\b`),
    new RegExp(`\\b${numberToken}\\s+hundred(?:\\s*(?:am|pm))?\\b`),
    new RegExp(`\\b${spoken}\\s+${minute}(?:\\s*(?:am|pm|oclock))?\\b`),
    new RegExp(`\\b(?:\\d{1,2}(?::\\d{2})?|${spoken})(?:\\s*(?:am|pm|oclock))?\\b`),
  ];
  const match = patterns.map((pattern) => text.match(pattern)).find(Boolean);
  return match?.index === undefined ? undefined : { start: match.index, end: match.index + match[0].length };
}

export function parseClockExpression(text: string): ClockResult {
  if (/\b\d{1,2}:\d{0,1}(?=\D|$)/.test(text)) return { status: "invalid" };
  if (/\bnoon\b/.test(text)) return { status: "found", minutes: 12 * 60 };
  if (/\bmidnight\b/.test(text)) return { status: "found", minutes: 0 };
  const word = wordClock(text);
  const match = text.match(new RegExp(`(?:\\bat\\s+|\\bto\\s+|\\bfor\\s+)?(${numberToken})(?::(\\d{2}))?\\s*(am|pm|oclock)?\\b`));
  if (!word && !match) return { status: "missing" };
  if (!word && /^(?:a|an)$/.test(match?.[1] ?? "")) return { status: "missing" };

  let hour = word?.hour ?? parseNumberWords(match?.[1] ?? "") ?? -1;
  const minute = word?.minute ?? Number(match?.[2] ?? 0);
  // “o'clock” describes the clock form, not a meridiem. Bare one–seven
  // follows Flow's documented daytime convention and therefore means PM.
  const meridiem = match?.[3] === "oclock" ? undefined : match?.[3];
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return { status: "invalid" };
  if (meridiem === "am" && hour > 12 || meridiem === "pm" && hour === 0) return { status: "invalid" };
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (!meridiem && hour >= 1 && hour <= 7) hour += 12;
  if (hour > 23) return { status: "invalid" };
  return { status: "found", minutes: hour * 60 + minute };
}

export function parseStandaloneClockExpression(text: string): ClockResult {
  const standalone = new RegExp(`^(?:(?:at|to)\\s+)?(?:(?:half past|quarter (?:to|past))\\s+${numberToken}|${numberToken}(?::\\d{2})?\\s*(?:am|pm|oclock)?)$`);
  return standalone.test(text.trim()) ? parseClockExpression(text) : { status: "missing" };
}

export function dateKeyAfter(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year ?? 2026, (month ?? 1) - 1, (day ?? 1) + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function parseDateExpression(text: string, today: string): DateTarget | undefined {
  if (/\btoday\b/.test(text)) return "today";
  if (/\btomorrow\b/.test(text)) return "tomorrow";
  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const weekday = weekdays.findIndex((name) => new RegExp(`\\b${name}\\b`).test(text));
  if (weekday >= 0) {
    const current = new Date(`${today}T12:00:00`).getDay();
    const days = ((weekday - current + 7) % 7) || 7;
    return { dateKey: dateKeyAfter(today, days) };
  }
  return undefined;
}

export function destinationForDate(text: string, today: string): Destination | null {
  const date = parseDateExpression(text, today);
  const part = /\bmorning\b/.test(text) ? "morning" : /\bafternoon\b/.test(text) ? "afternoon" : null;
  if (date && part) return { type: "dayPart", date, part };
  if (date) return { type: "dayPart", date, part: "morning" };
  return null;
}

export function dayPartStart(part: "morning" | "afternoon") {
  return DAY_PART_START[part];
}

export function relativeDestination(relation: "before" | "after", anchor: EventSelector): Destination {
  return { type: "relative", relation, anchor };
}
