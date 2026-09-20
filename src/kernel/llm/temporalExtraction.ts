/**
 * Deterministic, independently-testable extraction of clock times and
 * relative dates from raw transcript text.
 *
 * Why this exists instead of trusting the model's own arithmetic: an
 * earlier local-model comparison (see docs/CONVERSATIONAL_INTELLIGENCE.md)
 * showed the selected 2B model reliably SEPARATES a time expression from
 * surrounding clauses, but small local models are not a reliable arithmetic
 * oracle for "eight in the evening" -> minutes-since-midnight. The kernel's
 * capability layer has no standalone reusable natural-language time parser
 * exported for this purpose (the only such logic that exists is fused deep
 * inside the legacy interpreter's LifeContext-coupled parsing in
 * globalInterpreter.ts, which the kernel does not and should not depend on).
 * So conversationCoordinator.ts uses THIS module — not the model — as the
 * authority for the numeric minutes/date fields on any calendar plan step,
 * and only falls back to the model's own value when this module finds
 * nothing explicit to extract, at "inferred" confidence that keeps the
 * capability's own preflight/confirmation machinery in the loop.
 */

const WORD_NUMBERS: Record<string, number> = {
  midnight: 0,
  noon: 12,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

export type TimeConfidence = "explicit" | "contextual" | "ambiguous";

export interface ExtractedTime {
  hour: number;
  minute: number;
  confidence: TimeConfidence;
}

const PM_CONTEXT = /\b(dinner|tonight|evening|pm|p\.m\.|afternoon|supper)\b/i;
const AM_CONTEXT = /\b(breakfast|morning|gym|am|a\.m\.|sunrise)\b/i;

/** Finds the single most explicit clock-time expression in `text`, or null
 * if none is present. Does not guess a meridiem it isn't reasonably
 * confident about — callers must treat `confidence: "ambiguous"` as a
 * reason to ask, not a value to execute with. */
export function extractClockTime(text: string): ExtractedTime | null {
  const numericMatch = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\b/i);
  const wordMatch = !numericMatch
    ? text.match(new RegExp(`\\b(${Object.keys(WORD_NUMBERS).join("|")})\\s*(?:o'?clock)?\\b`, "i"))
    : null;

  if (!numericMatch && !wordMatch) return null;

  let hour: number;
  let minute = 0;
  let meridiem: "am" | "pm" | null = null;

  if (numericMatch) {
    hour = Number(numericMatch[1]);
    minute = numericMatch[2] ? Number(numericMatch[2]) : 0;
    if (numericMatch[3]) meridiem = numericMatch[3].toLowerCase().startsWith("a") ? "am" : "pm";
    if (hour > 23 || minute > 59) return null;
  } else {
    const word = wordMatch![1]!.toLowerCase();
    hour = WORD_NUMBERS[word]!;
    if (word === "midnight" || word === "noon") meridiem = word === "noon" ? "pm" : "am";
  }

  if (meridiem === null && hour >= 13) meridiem = "pm"; // 24h-shaped input is already explicit.
  if (meridiem === null && hour === 0) meridiem = "am";

  if (meridiem !== null) {
    const resolvedHour = meridiem === "pm" && hour < 12 ? hour + 12 : meridiem === "am" && hour === 12 ? 0 : hour;
    return { hour: resolvedHour, minute, confidence: "explicit" };
  }

  // Bare 1-12 with no am/pm marker: only guess when the sentence itself
  // supplies a strong context word, and say so via "contextual" rather than
  // reporting the same confidence as an explicit "8pm".
  if (PM_CONTEXT.test(text) && !AM_CONTEXT.test(text)) {
    return { hour: hour === 12 ? 12 : hour + 12, minute, confidence: "contextual" };
  }
  if (AM_CONTEXT.test(text) && !PM_CONTEXT.test(text)) {
    return { hour: hour === 12 ? 0 : hour, minute, confidence: "contextual" };
  }
  return { hour, minute, confidence: "ambiguous" };
}

export function timeToMinutes(time: ExtractedTime): number {
  return time.hour * 60 + time.minute;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export type DateConfidence = "explicit" | "implicit-today";

export interface ExtractedDate {
  dateKey: string;
  confidence: DateConfidence;
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Resolves a relative date phrase in `text` against `today`. Falls back to
 * `{ confidence: "implicit-today" }` when nothing date-shaped is present, so
 * a bare time ("move it to eight") stays on the day it was already on. */
export function extractRelativeDate(text: string, today: Date): ExtractedDate {
  const lower = text.toLowerCase();
  if (/\btomorrow\b/.test(lower)) return { dateKey: toDateKey(addDays(today, 1)), confidence: "explicit" };
  if (/\btoday\b|\btonight\b/.test(lower)) return { dateKey: toDateKey(today), confidence: "explicit" };

  const weekdayMatch = lower.match(new RegExp(`\\b(next\\s+)?(${WEEKDAYS.join("|")})\\b`));
  if (weekdayMatch) {
    const targetIndex = WEEKDAYS.indexOf(weekdayMatch[2]!);
    const todayIndex = today.getDay();
    let delta = (targetIndex - todayIndex + 7) % 7;
    if (delta === 0 || weekdayMatch[1]) delta = delta === 0 ? 7 : delta;
    return { dateKey: toDateKey(addDays(today, delta)), confidence: "explicit" };
  }

  const isoMatch = lower.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) return { dateKey: isoMatch[0], confidence: "explicit" };

  return { dateKey: toDateKey(today), confidence: "implicit-today" };
}
