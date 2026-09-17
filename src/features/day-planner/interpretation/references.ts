import type { EventColor, EventSelector } from "../model";
import { parseClockExpression, clockExpressionRange } from "./temporal";
import { extractSourceDate } from "./sourceDates";
import { leadingQuotedValue } from "../../../shared/command/literalValue";

// Keep the trailing whitespace optional so a source made entirely from a
// determiner (for example `the 2 PM` after its clock span is removed) does not
// leave a bogus title query behind.
const leadingDeterminers = /^(?:(?:a|an|my|the|please|for)\b\s*)+/;

export function cleanTitle(value: string) {
  return value
    .trim()
    .replace(leadingDeterminers, "")
    .replace(/\b(?:where it is|fixed|again|flexible|low priority)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Removes category words that narrow event type but are not part of a title. */
export function cleanFilterQuery(value: string) {
  return cleanTitle(value)
    .replace(/\b(?:work|tasks?|events?|meetings?|appointments?|calls?|blocks?)\s*$/g, "")
    .trim();
}

function parsePlainEventReference(value: string): EventSelector | null {
  const text = value.trim();
  if (/\bselected\b/.test(text) || /^(?:its|(?:this|that)(?: one| event| meeting| appointment| block)?)$/.test(cleanTitle(text))) return { type: "selected" };
  if (/^(?:it|first one|second one)$/.test(cleanTitle(text))) {
    const ordinal = /second/.test(text) ? 2 : /first/.test(text) ? 1 : undefined;
    return { type: "anaphor", ...(ordinal ? { ordinal } : {}) };
  }
  // `one` is a positional noun in phrases such as “the last one”, not a
  // title query. Keeping it outside the trailing capture lets the ordinary
  // resolver select the final event instead of searching for “one”.
  const position = text.match(/\b(current|next|previous|last)\s+(?:event|meeting|appointment|task|block|one)?\s*(.*)$/);
  if (position) {
    const query = cleanTitle(position[2] ?? "");
    return { type: "position", position: position[1] as "current" | "next" | "previous" | "last", ...(query ? { query } : {}) };
  }
  const relative = text.match(/^(?:the\s+)?(?:event|meeting|appointment|task|block|one)\s+(before|after)\s+(.+)$/);
  if (relative) {
    const anchor = parseEventReference(relative[2] ?? "");
    if (anchor) return { type: "relativeEvent", relation: relative[1] as "before" | "after", anchor };
  }
  const color = text.match(/\b(red|orange|yellow|green|cyan|blue|indigo|neutral|gray|grey)\b/)?.[1];
  const every = /\b(?:all|every|everything|anything|what can move)\b/.test(text)
    || /\b(?:work|events|meetings|appointments|tasks|calls)\b/.test(text);
  const afterGroup = text.match(/\bafter\s+(.+)$/);
  if (every && /\b(?:flexible|light|fluid)\b/.test(text) && afterGroup
    && !/^\d|^(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/.test(afterGroup[1] ?? "")) {
    const anchor = parseEventReference(afterGroup[1] ?? "");
    if (anchor) return {
      type: "all", mobility: /\bfluid\b/.test(text) ? "fluid" : "light", after: anchor,
    };
  }
  if (color) {
    const normalizedColor = /gray|grey/.test(color) ? "neutral" : color as EventColor;
    const query = cleanFilterQuery(text.replace(/\b(?:all|every|the|my)\b/g, " ").replace(new RegExp(`\\b${color}\\b`), " "));
    return { type: "filter", cardinality: every ? "many" : "one", color: normalizedColor, ...(query ? { query } : {}) };
  }
  const status = /\b(?:completed|finished|done)\b/.test(text)
    ? "done" as const
    : /\b(?:active|started|in progress)\b/.test(text)
      ? "active" as const
    : /\b(?:planned|open)\b/.test(text)
      ? "planned" as const
      : undefined;
  const importance = /\bcritical\b/.test(text)
    ? "critical" as const
    : /\bimportant\b/.test(text)
      ? "important" as const
      : /\bnormal(?: importance)?\b/.test(text)
        ? "normal" as const
        : undefined;
  const mobility = /\b(?:anchored|fixed)\b/.test(text)
    ? "anchored" as const
    : /\bheavy\b/.test(text)
      ? "heavy" as const
      : /\b(?:light|flexible|movable)\b/.test(text)
        ? "light" as const
        : /\bfluid\b/.test(text)
          ? "fluid" as const
          : undefined;
  const labelMatch = text.match(/\b(?:labelled|labeled|with (?:the )?label)\s+([a-z0-9-]+)\b/);
  if (status || importance || mobility || labelMatch) {
    const query = cleanFilterQuery(text
      .replace(/\b(?:all|every|the|my)\b/g, " ")
      .replace(/\b(?:completed|finished|done|active|started|in progress|planned|open|critical|important|normal importance|normal|anchored|fixed|heavy|light|flexible|movable|fluid)\b/g, " ")
      .replace(/\b(?:labelled|labeled|with (?:the )?label)\s+[a-z0-9-]+\b/g, " "));
    return {
      type: "filter", cardinality: every ? "many" : "one",
      ...(status ? { status } : {}), ...(importance ? { importance } : {}),
      ...(mobility ? { mobility } : {}), ...(labelMatch?.[1] ? { label: labelMatch[1] } : {}),
      ...(query && !/^(?:work|tasks?|events?|meetings?|appointments?|calls?)$/.test(query) ? { query } : {}),
    };
  }
  if (/\b(?:all|every)\b/.test(text) && !/\b(?:flexible work|low priority work|fixed appointments?|everything|anything|afternoon)\b/.test(text)) {
    const query = cleanFilterQuery(text.replace(/\b(?:all|every)\b/g, " "));
    return { type: "filter", cardinality: "many", ...(query ? { query } : {}) };
  }
  const isAll = /\b(?:all|everything|anything|what can move|afternoon)\b/.test(text);
  if (isAll || /\b(?:flexible work|low priority work|fixed appointments?)\b/.test(text)) {
    const selector: Extract<EventSelector, { type: "all" }> = { type: "all" };
    if (/\b(?:flexible|what can move)\b/.test(text)) selector.kind = "flexible";
    if (/\bfixed appointments?\b/.test(text)) selector.kind = "fixed";
    if (/\blow priority\b/.test(text)) selector.priority = "low";
    if (/\blight\b/.test(text)) selector.mobility = "light";
    if (/\bfluid\b/.test(text)) selector.mobility = "fluid";
    if (/\bimportant\b/.test(text)) selector.importance = "important";
    if (/\bafternoon\b/.test(text)) selector.period = "afternoon";
    const after = text.match(/\bafter\s+(.+)$/);
    if (after && !/^\d|^(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/.test(after[1] ?? "")) {
      const anchor = parseEventReference(after[1] ?? "");
      if (anchor) selector.after = anchor;
    }
    return selector;
  }
  const title = cleanTitle(text);
  return title ? { type: "title", query: title } : null;
}

/** Builds a composite selector for phrases such as “my 2 PM meeting”. */
export function parseSourceEventReference(value: string): EventSelector | null {
  const original = value.trim();
  const quoted = leadingQuotedValue(original.replace(/^(?:the|my)\s+/, ""));
  if (quoted) {
    if (!quoted.suffix.trim()) return { type: "title", query: quoted.value };
    const qualified = parseSourceEventReference(`event ${quoted.suffix}`);
    return qualified?.type === "title" || qualified?.type === "source" ? { ...qualified, query: quoted.value } : null;
  }
  const { text, date, literalDateQuery } = extractSourceDate(original);
  const dated = (selector: EventSelector | null) => selector && date ? { ...selector, date, ...(literalDateQuery ? { literalDateQuery } : {}) } : selector;
  const rich = parsePlainEventReference(text);
  if (rich && rich.type !== "title" && rich.type !== "all") return dated(rich);
  if (/^(?:the|my)?\s*(?:morning|afternoon)$/.test(text)) return dated(rich);
  const range = clockExpressionRange(text);
  const clockText = range ? text.slice(range.start, range.end) : "";
  // A number inside a title (Project 2) is not source-time evidence.
  const clockQualified = Boolean(range && (/\b(?:am|pm|oclock|noon|midnight)\b|:\d{2}|half past|quarter (?:to|past)/.test(clockText)
    || /\b(?:at|from|around|covering|through)\s*$/.test(text.slice(0, range.start))
    || /^(?:(?:the|my)\s+)?$/.test(text.slice(0, range.start))));
  const clock = clockQualified ? parseClockExpression(clockText) : { status: "missing" as const };
  const period = /\bmorning\b/.test(text)
    ? "morning" as const
    : /\bafternoon\b/.test(text)
      ? "afternoon" as const
      : /\bevening\b/.test(text)
        ? "evening" as const
        : undefined;
  if (clock.status !== "found" && !period) return dated(rich);

  const clockRange = clockQualified ? range : undefined;
  const withoutClock = clockRange ? `${text.slice(0, clockRange.start).replace(/\b(?:(?:that\s+)?(?:starting|starts) at|at|from|around|covering|running through)\s*$/, "")} ${text.slice(clockRange.end)}` : text;
  const query = cleanTitle(withoutClock
    .replace(/\b(?:(?:for|in|during)\s+(?:the\s+)?)?(?:morning|afternoon|evening)\b/g, " "));
  return {
    type: "source",
    ...(clock.status === "found" ? { at: clock.minutes } : {}),
    ...(period ? { period } : {}),
    ...(query ? { query } : {}),
    ...(date ? { date } : {}),
    ...(literalDateQuery ? { literalDateQuery } : {}),
    ...(clockRange && /^[a-z ]+$/.test(clockText) && !/\b(?:am|pm|oclock|hundred)\b/.test(clockText)
      && /\bat\s*$/.test(text.slice(0, clockRange.start)) && query ? { literalQuery: cleanTitle(text) } : {}),
  };
}

// Constraints, anchors and property changes use the same source primitive.
export const parseEventReference = parseSourceEventReference;

export function selectorLabel(selector: EventSelector): string {
  if (selector.type === "selected") return "the selected event";
  if (selector.type === "title") return selector.query;
  if (selector.type === "source") return selector.query ?? "the event at that time";
  if (selector.type === "id") return selector.id;
  if (selector.type === "position") return `${selector.position} ${selector.query ?? "event"}`;
  if (selector.type === "filter") return selector.query ?? selector.color ?? selector.label ?? "matching events";
  if (selector.type === "relativeEvent") return `event ${selector.relation} ${selectorLabel(selector.anchor)}`;
  if (selector.type === "anaphor") return selector.ordinal ? `part ${selector.ordinal}` : "that event";
  if (selector.type === "multi") return selector.selectors.map(selectorLabel).join(", ");
  if (selector.priority) return `${selector.priority}-priority work`;
  if (selector.kind) return `${selector.kind} events`;
  if (selector.period) return `your ${selector.period}`;
  return "matching events";
}
