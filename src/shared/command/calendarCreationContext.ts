import type { CalendarAction, CalendarRequest } from "../../features/day-planner/model";
import { normalizeTranscript } from "../../features/day-planner/interpretation/normalize";
import { parseDateExpression, parseStandaloneClockExpression } from "../../features/day-planner/interpretation/temporal";
import { outsideQuotedRanges } from "../../features/day-planner/interpretation/sourceClauses";

export interface CalendarCreationContinuation {
  type: "calendar-create";
  title: string;
  literalTitle?: boolean;
  durationMinutes: number;
  timingHint: string;
}

export function creationTimingHint(source: string) {
  const boundary = [...source.matchAll(/\b(?:before|after)\s+/gi)].find(({ index }) => outsideQuotedRanges(source, index));
  return boundary ? source.slice(boundary.index).trim() : "the event you named";
}

/** Only a complete date + clock answer can fill a missing creation time.
 * A global query, title, prose, or partial date cannot acquire this authority. */
export function calendarCreationTimeAnswer(text: string, pending: CalendarCreationContinuation, dateKey: string): CalendarRequest | undefined {
  const normalized = normalizeTranscript(text);
  const match = normalized.match(/^(today|tomorrow|(?:on )?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\s+at\s+(.+)$/);
  if (!match) return undefined;
  const clock = parseStandaloneClockExpression(match[2]!);
  if (clock.status !== "found") return undefined;
  const date = match[1] === "today" ? "today" : parseDateExpression(match[1]!, dateKey);
  if (!date) return undefined;
  const action: CalendarAction = { type: "create", title: pending.title, ...(pending.literalTitle ? { literalTitle: true } : {}),
    durationMinutes: pending.durationMinutes, destination: { type: "absolute", minutes: clock.minutes, date } };
  return { transcript: text, normalized, actions: [action], constraints: [] };
}
