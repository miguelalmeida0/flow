import type { CalendarAction } from "../model";
import { parseClockExpression, parseDurationExpression } from "./temporal";
import { selectorFor } from "./tideLanguagePrimitives";

/** Absolute endpoints are geometry, not completion. The draft scheduler
 * validates the resulting duration after any earlier action in the request. */
export function contextualGeometry(clause: string): CalendarAction[] | { error: string } | null {
  const declarativeEnd = clause.match(/^let\s+(.+?)\s+(start|end|finish)\s+at\s+(.+)$/);
  const endpoint = declarativeEnd ? [declarativeEnd[0], declarativeEnd[2], declarativeEnd[1], declarativeEnd[3]] : clause.match(/^(start|end|finish)\s+(?:(.+?)\s+)?at\s+(.+)$/);
  if (endpoint && !/^(?:my |the )?day$/.test(endpoint[2] ?? "") && (endpoint[1] !== "finish" || endpoint[2])) {
    const selector = selectorFor(endpoint[2] ?? "it");
    const clock = parseClockExpression(endpoint[3] ?? "");
    if (!selector || clock.status !== "found") return { error: "Which event and exact time should I use?" };
    return endpoint[1] === "start"
      ? [{ type: "move", selector, destination: { type: "absolute", minutes: clock.minutes } }]
      : [{ type: "resize", selector, mode: "end", minutes: clock.minutes }];
  }
  const placement = clause.match(/^bring\s+(.+?)\s+(?:forward|back)\s+to\s+(.+)$/)
    ?? clause.match(/^put\s+(.+?)\s+back\s+at\s+(.+)$/);
  if (placement) {
    const selector = selectorFor(placement[1]!);
    const clock = parseClockExpression(placement[2]!);
    return selector && clock.status === "found" ? [{ type: "move", selector, destination: { type: "absolute", minutes: clock.minutes } }] : { error: "Which event and exact time should I use?" };
  }
  const duration = clause.match(/^(add|extend by|shorten by|reduce by|take off)\s+(.+)$/);
  if (duration && /^(?:\d+|[a-z-]+(?:\s+[a-z-]+)?)\s+(?:minutes?|hours?)$|^(?:half|a quarter)(?: of)? an? hour$/.test(duration[2] ?? "")) {
    const minutes = parseDurationExpression(duration[2] ?? "");
    if (!minutes) return { error: "How much time should I add or remove?" };
    return [{ type: "resize", selector: { type: "anaphor" }, mode: "add", minutes: /^(?:shorten|reduce|take)/.test(duration[1]!) ? -minutes : minutes }];
  }
  return null;
}
