import type { CalendarAction, Destination, EventColor, EventImportance, EventMobility, EventSelector } from "../model";
import { parseNumberWords } from "./numbers";
import { cleanFilterQuery, cleanTitle, parseSourceEventReference } from "./references";
import { parseClockExpression, parseDateExpression, parseDurationExpression } from "./temporal";

export const colors = ["neutral", "red", "orange", "yellow", "green", "cyan", "blue", "indigo"] as const;
export const colorPattern = "neutral|gray|grey|red|orange|yellow|green|cyan|blue|indigo";

export function colorIn(text: string): EventColor | undefined {
  const color = text.match(new RegExp(`\\b(${colorPattern})\\b`))?.[1];
  if (!color) return undefined;
  return color === "gray" || color === "grey" ? "neutral" : color as EventColor;
}

export function lastColorIn(text: string): EventColor | undefined {
  const matches = [...text.matchAll(new RegExp(`\\b(${colorPattern})\\b`, "g"))];
  const color = matches.at(-1)?.[1];
  if (!color) return undefined;
  return color === "gray" || color === "grey" ? "neutral" : color as EventColor;
}

export function selectorFor(value: string): EventSelector | null {
  const text = value.trim().replace(/^(?:the\s+)?/, "");
  const batch = /^(?:all|every)\s+(.+)$/.exec(text);
  if (batch) {
    const body = batch[1] ?? "";
    const color = colorIn(body);
    const rich = parseSourceEventReference(`all ${body}`);
    if (rich?.type === "filter") return { ...rich, cardinality: "many", ...(color ? { color } : {}) };
    const query = cleanFilterQuery(body.replace(new RegExp(`\\b(?:${colorPattern})\\b`, "g"), " "));
    return { type: "filter", cardinality: "many", ...(color ? { color } : {}), ...(query ? { query } : {}) };
  }
  return parseSourceEventReference(text);
}

export function parseAbsolute(text: string, today: string): Destination | null {
  const marker = [...text.matchAll(/\b(?:at|from)\s+/g)].at(-1);
  const clock = parseClockExpression(marker?.index === undefined ? text : text.slice(marker.index + marker[0].length));
  if (clock.status !== "found") return null;
  const date = parseDateExpression(text, today);
  return { type: "absolute", minutes: clock.minutes, ...(date ? { date } : {}) };
}

export function propertyPatch(text: string) {
  const color = lastColorIn(text);
  const importance = /\bcritical\b/.test(text)
    ? "critical" as EventImportance
    : /\bimportant\b/.test(text)
      ? "important" as EventImportance
      : /\b(?:normal importance|not important)\b/.test(text)
        || (/^(?:make|mark|set|change)\b/.test(text) && /\bnormal\b/.test(text) && !/\b(?:neutral|gray|grey)\b/.test(text))
        ? "normal" as EventImportance
        : undefined;
  const mobility = /\b(?:anchor|anchored)\b/.test(text)
    ? "anchored" as EventMobility
    : /\bheavy\b/.test(text)
      ? "heavy" as EventMobility
      : /\bfluid\b|\blet .* flow\b/.test(text)
        ? "fluid" as EventMobility
        : /\b(?:light|flexible|movable)\b/.test(text)
          ? "light" as EventMobility
          : undefined;
  return { ...(color ? { color } : {}), ...(importance ? { importance } : {}), ...(mobility ? { mobility } : {}) };
}

export function propertySubject(clause: string) {
  return clause
    .replace(/^(?:make|mark|set|paint|color|change)\s+/, "")
    .replace(/\s+(?:back to\s+)?(?:normal importance|normal|not important|important|critical|anchored|heavy|light|fluid|flexible(?: again)?|movable(?: again)?)(?:\s+and\s+(?:important|critical|anchored|heavy|light|fluid|flexible|movable|neutral|gray|grey|red|orange|yellow|green|cyan|blue|indigo))*.*$/, "")
    .replace(new RegExp(`\\s+(?:and\\s+)?(?:${colorPattern})(?:\\s+and\\s+(?:important|critical|anchored|heavy|light|fluid|flexible|movable))?.*$`), "")
    .trim();
}

export function roomAction(clause: string, today: string): CalendarAction | null {
  if (/^give\b.*\b(?:another|more)\b/.test(clause)) return null;
  // “Fit …” and “find the next free slot …” create/move work through the
  // ordinary fit operation. The word `free` is not by itself an instruction
  // to create protected Breathing Room.
  if (/^(?:fit|find)\b/.test(clause)) return null;
  if (/^make room for\b/.test(clause) && /\bnext free slot\b/.test(clause)
    && !/\b(?:breathing room|buffer)\b/.test(clause)) return null;
  if (!/\b(?:breathing room|buffer|free|room)\b/.test(clause) && !/^(?:give(?: me)?|make room)/.test(clause)) return null;
  if (/^make room for\b/.test(clause) && !/\b(?:breathing room|buffer|free)\b/.test(clause)) return null;
  const range = clause.match(/\bfrom\s+(.+?)\s+(?:to|until)\s+(.+?)(?:\s+(?:open|free))?$/);
  if (range) {
    const start = parseClockExpression(range[1] ?? "");
    const end = parseClockExpression(range[2] ?? "");
    if (start.status === "found" && end.status === "found" && end.minutes > start.minutes) {
      return { type: "createBreathingRoom", durationMinutes: end.minutes - start.minutes, destination: { type: "absolute", minutes: start.minutes }, label: "Breathing room", protected: true };
    }
  }
  const duration = parseDurationExpression(clause) ?? 15;
  const relative = clause.match(/\b(before|after)\s+(.+)$/);
  if (relative) {
    const anchor = selectorFor(relative[2] ?? "");
    if (anchor) return { type: "createBreathingRoom", durationMinutes: duration, destination: { type: "relative", relation: relative[1] as "before" | "after", anchor }, label: "Breathing room", protected: true };
  }
  const absolute = parseAbsolute(clause, today);
  return absolute ? { type: "createBreathingRoom", durationMinutes: duration, destination: absolute, label: "Breathing room", protected: true } : null;
}

export function splitAction(clause: string): CalendarAction | null {
  const match = clause.match(/^(?:split|divide|break)\s+(.+?)\s+(?:into\s+(.+)|in half)$/);
  if (!match) return null;
  const selector = selectorFor(match[1] ?? "");
  if (!selector) return null;
  if (/in half$/.test(clause)) return { type: "split", selector, durations: [0, 0] };
  const detail = match[2] ?? "";
  const countText = detail.match(/^(\w+|\d+)/)?.[1] ?? "two";
  const count = Math.max(2, Math.min(4, parseNumberWords(countText) ?? 2));
  const each = parseDurationExpression(detail);
  return { type: "split", selector, durations: Array.from({ length: count }, () => each ?? 0) };
}

export function mergeAction(clause: string): CalendarAction | null {
  const match = clause.match(/^(?:combine|merge|batch)\s+(.+)$/);
  if (!match) return null;
  const [source = "", customTitle] = (match[1] ?? "").split(/\s+and\s+(?:call|name)\s+it\s+/);
  if (/^(?:all|every)\b/.test(source)) {
    const counted = source.match(/^(?:all|every)\s+(\d+|[a-z-]+)\s+(.+)$/);
    const expectedCount = counted ? parseNumberWords(counted[1] ?? "") : undefined;
    const selectorSource = expectedCount && expectedCount > 1 ? `all ${counted?.[2] ?? ""}` : source;
    const selector = selectorFor(selectorSource);
    return selector ? {
      type: "merge", selector,
      ...(expectedCount && expectedCount > 1 ? { expectedCount } : {}),
      ...(customTitle ? { title: cleanTitle(customTitle) } : {}),
    } : null;
  }
  const names = source.replace(/,\s+and\s+/g, ", ").split(/\s*,\s*|\s+and\s+/).map(cleanTitle).filter(Boolean);
  if (names.length < 2) return null;
  return {
    type: "merge",
    selector: { type: "multi", selectors: names.map((query) => ({ type: "title", query })) },
    ...(customTitle ? { title: cleanTitle(customTitle) } : {}),
  };
}
