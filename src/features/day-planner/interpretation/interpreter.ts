import type { CalendarAction, CalendarConstraint, Destination, InterpretationResult } from "../model";
import { splitClauses } from "./clauses";
import { parseIntent } from "./intent";
import { normalizeTranscript } from "./normalize";
import { cleanTitle, parseEventReference, parseSourceEventReference } from "./references";
import { destinationForDate, parseClockExpression, parseDateExpression, parseDurationExpression } from "./temporal";
import { parseTideClause, previewMode } from "./tideInterpreter";
import { numberToken } from "./numbers";
import { createTemporalSpans, isClockFirstCreation } from "./createSpans";
import { protectRenameValue } from "./freeFormRename";
import { parsePreservationGuard } from "./preservationGuards";
import { calendarCommandSource } from "./calendarCommandSource";
import { bindSourceDates } from "./sourceDates";

type ParseResult = { actions: CalendarAction[]; constraints: CalendarConstraint[] } | { error: string };

function globalAction(clause: string): CalendarAction | null {
  if (/^(?:undo|go back|revert)/.test(clause)) return { type: "undo" };
  if (/^redo/.test(clause)) return { type: "redo" };
  if (/^(?:reset|start over)/.test(clause)) return { type: "reset" };
  if (/^what changed/.test(clause)) return { type: "whatChanged" };
  if (/^(?:confirm|apply|yes,? do it)$/.test(clause)) return { type: "confirm" };
  if (/^(?:never mind|cancel that|cancel|stop)$/.test(clause)) return { type: "cancel" };
  return null;
}

function clockFrom(value: string) {
  const result = parseClockExpression(value.trim());
  return result.status === "found" ? result.minutes : result.status === "invalid" ? "invalid" : null;
}

function parseDestination(clause: string, today: string, allowUnresolved = false): Destination | null | "invalid" {
  if (allowUnresolved && /\b(?:another|different|new)\s+(?:time|slot)\b|\bsomewhere else\b/.test(clause)) {
    return { type: "unresolved", kind: "time" };
  }
  if (/\bnext free\b/.test(clause)) {
    const date = parseDateExpression(clause, today);
    return { type: "nextFree", ...(date ? { date } : {}) };
  }
  const between = clause.match(/\bbetween\s+(.+?)\s+and\s+(.+?)(?:$|\s+for\b)/);
  if (between) {
    const start = clockFrom(between[1] ?? "");
    const end = clockFrom(between[2] ?? "");
    if (start === "invalid" || end === "invalid" || start === null || end === null || end <= start) return "invalid";
    return { type: "window", start, end };
  }
  const relative = clause.match(/\b(before|after)\s+(.+)$/);
  if (relative) {
    const value = relative[2]?.trim() ?? "";
    const clock = clockFrom(value);
    if (clock === "invalid") return "invalid";
    if (clock !== null) return { type: "absolute", minutes: clock };
    const anchor = parseEventReference(value);
    if (anchor) return { type: "relative", relation: relative[1] as "before" | "after", anchor };
  }
  const absoluteMarkers = [...clause.matchAll(/\b(to|at|for)\s+/g)].filter((match) =>
    match[1] !== "to" || !clause.slice(0, match.index).endsWith("quarter "));
  const absolute = absoluteMarkers.at(-1);
  if (absolute?.index !== undefined) {
    const clock = clockFrom(clause.slice(absolute.index + absolute[0].length));
    if (clock === "invalid") return "invalid";
    if (clock !== null) {
      const date = parseDateExpression(clause, today);
      return { type: "absolute", minutes: clock, ...(date ? { date } : {}) };
    }
  }
  const dateDestination = destinationForDate(clause, today);
  if (dateDestination) return dateDestination;
  return null;
}

function movementParts(clause: string, verbs: RegExp) {
  const withoutVerb = clause.replace(verbs, "").replace(/\s+(?:immediately|straight|directly)(?=\s+(?:before|after)\b)/g, "");
  const afterDescribesGroup = /^(?:all|everything|anything|what can move)\b/.test(withoutVerb)
    && (/\b(?:minutes?|hours?)\s+(?:later|earlier)\b/.test(withoutVerb)
      || /\bback\s+(?:\d+|[a-z-]+)(?:\s+[a-z-]+)?\s+(?:minutes?|hours?)\b/.test(withoutVerb)
      || /\bto\s+(?:tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(withoutVerb));
  const hasExplicitDestination = new RegExp(`\\s+(?:to|before|${afterDescribesGroup ? "(?!)" : "after"}|somewhere else|until)\\b`).test(withoutVerb);
  const destinationBoundary = hasExplicitDestination
    ? new RegExp(`\\s+(?:to|before|${afterDescribesGroup ? "(?!)" : "after"}|somewhere else|until)\\b`)
    : /\s+(?:at|for|tomorrow|today|on (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/;
  const boundary = withoutVerb.search(destinationBoundary);
  const value = (boundary < 0 ? withoutVerb : withoutVerb.slice(0, boundary))
    ?.replace(/\b(?:by|back)(?:\s+.*)?$/, "")
    .replace(/\s+(?:\d+|[a-z-]+)\s+(?:minutes?|hours?)\s+(?:later|earlier)$/, "")
    .trim() ?? "";
  const selector = parseSourceEventReference(value);
  // A motion particle immediately before “to” is a bounded alternative,
  // not permission to erase an exact title such as “Game over”.
  return { selector: selector?.type === "title" && /\bover\s+to\b/.test(withoutVerb) && /\s+over$/.test(value)
    ? { ...selector, fallbackQuery: value.replace(/\s+over$/, "") } : selector,
  destinationText: boundary < 0 ? "" : withoutVerb.slice(boundary).trim() };
}

function selectorBeforeDestination(clause: string, verbs: RegExp) { return movementParts(clause, verbs).selector; }

function sourceOnlyAtMove(clause: string) {
  const atIndex = clause.indexOf(" at ");
  if (atIndex < 0) return false;
  const verb = clause.match(/^(change|reschedule|move|shift|push|put)\b/)?.[1];
  const sourcePhrase = clause.slice(0, atIndex);
  // “at” following an explicit destination qualifies that destination, even
  // when the source is called a meeting or appointment.
  if (/\s+(?:to|before|after|until)\s+/.test(sourcePhrase)) return false;
  const atQualifiesSource = verb === "change" || verb === "reschedule"
    || /\b(?:event|meeting|appointment|task|block|thing)\b/.test(sourcePhrase);
  if (!atQualifiesSource) return false;
  const afterAt = clause.slice(atIndex + 4);
  return !/\s+(?:to|before|after)\s+|\b(?:another|different|new)\s+(?:time|slot)\b|\bsomewhere else\b/.test(afterAt);
}

function titleForCreate(clause: string) {
  const withoutVerbOrDuration = clause
    .replace(/^(?:add|create|schedule|block|book|fit|make room for|give me|make)\s+/, "")
    .replace(new RegExp(`\\b${numberToken}\\s*-?\\s*hours?(?:\\s+and\\s+${numberToken}\\s*-?\\s*minutes?)?\\b`, "g"), "")
    .replace(new RegExp(`\\b${numberToken}\\s*-?\\s*(?:minutes?|mins?|min)\\b`, "g"), "")
    .replace(/\b(?:quick|slot)\b/g, "")
    .replace(/\s+for\s*$/, "").trim();
  // Location-bearing titles such as “Dinner at Pizzeria Roma” must survive.
  // Remove only a trailing temporal phrase instead of splitting on the first
  // `at`, which used to turn ordinary restaurant bookings into “Dinner”.
  const withoutTemporalSuffix = withoutVerbOrDuration
    .replace(/\s+(?:in\s+)?(?:the\s+)?next free(?: slot)?\s*$/i, "")
    .replace(/\s+(?:tomorrow|(?:next\s+|on\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))(?:\s+(?:morning|afternoon|evening|after work))?(?:\s+at\s+.+)?$/i, "")
    .replace(/\s+(?:before|after|between|next free)\s+.+$/i, "")
    .replace(/\s+at\s+(?:noon|midnight)$/i, "")
    .replace(new RegExp(`\\s+at\\s+(?:half past|quarter (?:to|past))\\s+${numberToken}\\s*(?:am|pm|oclock)?$`, "i"), "")
    .replace(new RegExp(`\\s+at\\s+${numberToken}(?::\\d{2})?\\s*(?:am|pm|oclock)?$`, "i"), "");
  return cleanTitle(withoutTemporalSuffix.replace(/^\s*of\s+/, "").replace(/\s+to (?:my|your|the) (?:schedule|calendar)$/, "")).replace(/\bat\s+(.+)$/i, (_, location: string) => `at ${location.replace(/\b\w/g, (letter) => letter.toUpperCase())}`);
}

function parseKeepConstraints(clause: string): CalendarConstraint[] {
  let match = clause.match(/\b(?:do not (?:move|touch)|without moving)\s+(.+)$/);
  if (!match) match = clause.match(/^keep\s+(.+?)(?:\s+(?:fixed|where it is)|\s+at\s+.+)?$/);
  if (!match) return [];
  const raw = match[1]?.replace(/\b(?:fixed|where it is)\b/g, "").replace(/\s+at\s+.+$/, "") ?? "";
  const atMatch = clause.match(/\bat\s+(.+)$/);
  const at = atMatch ? clockFrom(atMatch[1] ?? "") : null;
  return raw.split(/\s+(?:and|or)\s+/).flatMap((part) => {
    const selector = parseEventReference(part);
    return selector ? [{ type: "keep" as const, selector, ...(typeof at === "number" ? { at } : {}) }] : [];
  });
}

function parseClause(clause: string, today: string, literalValues: Readonly<Record<string, string>> = {}, literalCreations: ReadonlySet<string> = new Set()): ParseResult {
  const untouched = clause.match(/^leave (.+?) alone$/);
  if (untouched) {
    const selector = parseSourceEventReference(untouched[1]!);
    if (selector) return { actions: [], constraints: [{ type: "keep", selector }] };
  }
  const negativeMovement = clause.match(/^i do not want (.+?) (?:moved|rescheduled)$/);
  if (negativeMovement) {
    const selector = parseSourceEventReference(negativeMovement[1]!);
    if (selector) return { actions: [{ type: "protect", selector }], constraints: [{ type: "keep", selector }] };
  }
  if (/^(?:keep|leave) its\s+.+\s+(?:unchanged|alone|where it is|as it is)$/.test(clause)) return { error: "I could not resolve that unchanged field. Nothing changed." };
  const constraints = parseKeepConstraints(clause);
  let stripped = clause.replace(/\b(?:do not (?:move|touch)|without moving)\s+.+$/, "").trim();
  const dateFirst = stripped.match(/^(tomorrow|today|(?:next )?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\s+at\s+(.+?)\s+(add|create|schedule|book)\s+(.+)$/);
  if (dateFirst) stripped = `${dateFirst[3]} ${dateFirst[4]} ${dateFirst[1]} at ${dateFirst[2]}`;
  const intent = isClockFirstCreation(stripped) ? "create" : parseIntent(stripped);
  const global = globalAction(stripped);
  if (global) return { actions: [global], constraints };
  const splitPartPlacement = stripped.match(/^keep\s+(?:(?:the\s+)?(first|second)\s+(?:one|part)|one)\s+(before|after)\s+(.+)$/);
  if (splitPartPlacement) {
    const anchor = parseEventReference(splitPartPlacement[3] ?? "");
    if (!anchor) return { error: "Which event should anchor that split session?" };
    return {
      actions: [{
        type: "move",
        selector: { type: "anaphor", ordinal: splitPartPlacement[1] === "second" ? 2 : 1 },
        destination: { type: "relative", relation: splitPartPlacement[2] as "before" | "after", anchor, preserveIfSatisfied: true },
      }],
      constraints: [],
    };
  }
  if (!stripped || /^keep\b/.test(stripped)) return { actions: [], constraints };
  if (intent === "recover") {
    const parsedDelay = parseDurationExpression(stripped);
    return { actions: [{ type: "recover", delayMinutes: parsedDelay ?? 30, assumedDelay: parsedDelay === null }], constraints };
  }
  if (intent === "protect" || intent === "unprotect") {
    const selector = /^change\b/.test(stripped)
      ? selectorBeforeDestination(stripped, /^change\s+/)
      : parseSourceEventReference(stripped.replace(/^remove protection from\s+/, "").replace(/^(?:protect|lock|fix|unlock|unprotect|release|make|change|let)\s+/, "").replace(/\s+(?:(?:flexible|movable)(?: again)?|move again|in place)$/, ""));
    return selector ? { actions: [{ type: intent, selector }], constraints } : { error: "I could not tell which event to change." };
  }
  if (intent === "delete") {
    const selector = parseSourceEventReference(stripped.replace(/^(?:delete|cancel|remove)\s+/, ""));
    return selector ? { actions: [{ type: "delete", selector }], constraints } : { error: "I could not tell which event to remove." };
  }
  if (intent === "defer") {
    const { selector, destinationText } = movementParts(stripped, /^defer\s+/);
    const date = parseDateExpression(destinationText, today) ?? "tomorrow";
    const part = /\bmorning\b/.test(destinationText) ? "morning" : /\bafternoon\b/.test(destinationText) ? "afternoon" : undefined;
    if (!selector || !date) return { error: "I need both the event and the day to defer it to." };
    return { actions: [{ type: "defer", selector, date, ...(part ? { part } : {}) }], constraints };
  }
  if (intent === "resize") {
    const duration = parseDurationExpression(stripped);
    if (!duration) return { error: "How long should that event be?" };
    const addedTo = stripped.match(/^add\s+.+?\s+(?:minutes?|hours?)\s+to\s+(.+)$/)?.[1];
    const takenOff = stripped.match(/^take\s+.+?\s+(?:minutes?|hours?)\s+off\s+(.+)$/)?.[1];
    const selectorText = (addedTo ?? takenOff ?? (stripped.replace(/^(?:make|shorten|extend|reduce|stretch|trim|give|change)\s+/, "").split(/\b(?:by|to|another|more)\b/)[0] ?? ""))
      .replace(new RegExp(`\\s+(?:half an hour|half hour|a quarter hour|quarter (?:of an )?hour|${numberToken}\\s*hours?(?:\\s+and\\s+${numberToken}\\s*minutes?)?|${numberToken}\\s*(?:minutes?|mins?|min)).*$`), "")
      .trim();
    const selector = parseSourceEventReference(selectorText);
    if (!selector) return { error: "I could not tell which event to resize." };
    const additive = Boolean(addedTo || takenOff) || (/^(?:shorten|extend|reduce|trim)\b/.test(stripped) && /\bby\b/.test(stripped))
      || /^give\b.*\b(?:another|more)\b/.test(stripped) || /\b(?:shorter|longer)$/.test(stripped);
    const sign = takenOff || /^(?:shorten|reduce|trim)\b/.test(stripped) || /\bshorter$/.test(stripped) ? -1 : 1;
    return { actions: [{ type: "resize", selector, mode: additive ? "add" : "set", minutes: additive ? sign * duration : duration }], constraints };
  }
  if (intent === "shift") {
    const duration = parseDurationExpression(stripped);
    const selectorText = stripped
      .replace(/^(?:shift|push|move|reschedule|put)\s+/, "")
      .replace(new RegExp(`\\s+(?:(?:by|back(?:\\s+by)?|forward(?:\\s+by)?)\\s+)?(?:half an hour|half hour|a quarter hour|quarter (?:of an )?hour|${numberToken}\\s*(?:minutes?|hours?))\\s*(?:later|earlier)?$`), "")
      .trim();
    const selector = parseSourceEventReference(selectorText);
    if (!duration || !selector) return { error: "I need an event and an amount of time to shift it." };
    const direction = /\bearlier\b/.test(stripped) ? -1 : 1;
    return { actions: [{ type: "shift", selector, deltaMinutes: direction * duration }], constraints };
  }
  if (intent === "create" || intent === "fit") {
    const explicitDuration = parseDurationExpression(stripped);
    const range = stripped.match(/\s+from\s+(.+?)\s+(?:to|until)\s+(.+)$/);
    const rangeStart = range && parseClockExpression(range[1]!);
    const rangeEnd = range && parseClockExpression(range[2]!);
    if (range && (rangeStart?.status !== "found" || rangeEnd?.status !== "found" || rangeEnd.minutes <= rangeStart.minutes)) return { error: "The end time must be after the start time. Nothing changed." };
    const rangeDuration = rangeStart?.status === "found" && rangeEnd?.status === "found" ? rangeEnd.minutes - rangeStart.minutes : undefined;
    const defaultDurationText = stripped.replace(/flowliteralvalue\d+/g, (token) => literalValues[token] ?? token);
    const duration = rangeDuration ?? explicitDuration ?? (/^book\b/.test(stripped) && ![...literalCreations].some((token) => stripped.includes(token)) && /\b(?:breakfast|brunch|lunch|dinner|supper)\b/i.test(defaultDurationText) ? 60 : 30);
    const temporal = createTemporalSpans(stripped);
    if (temporal && "error" in temporal) return temporal;
    const date = parseDateExpression(stripped, today);
    const destination = rangeStart?.status === "found" ? { type: "absolute" as const, minutes: rangeStart.minutes, ...(date ? { date } : {}) } : temporal ? { type: "absolute" as const, minutes: temporal.minutes, ...(date ? { date } : {}) } : parseDestination(stripped, today);
    if (destination === "invalid") return { error: "That time is outside a valid 24-hour clock." };
    const safeDestination = destination ?? (intent === "fit" ? { type: "nextFree" as const } : null);
    if (!safeDestination) return { error: "When should I schedule it?" };
    let title = titleForCreate(range ? stripped.slice(0, range.index) : temporal?.titleSource ?? stripped).replace(/\s+for$/, "");
    if (/^give me\b/.test(stripped)) title = "Breathe and reset";
    const forTitle = stripped.match(/\bfor\s+(.+)$/);
    if (/\bnext free\b/.test(stripped) && forTitle) title = cleanTitle(forTitle[1] ?? "");
    if (!title) title = /\bbreak\b/.test(stripped) ? "Break" : "New event";
    const action = intent === "fit"
      ? { type: "fit" as const, title, durationMinutes: duration, destination: safeDestination }
      : { type: "create" as const, title, durationMinutes: duration, destination: safeDestination };
    return { actions: [action], constraints };
  }
  if (intent === "move") {
    const sourceOnlyAt = sourceOnlyAtMove(stripped);
    const parts = movementParts(stripped, /^(?:move|shift|push|reschedule|put|change)\s+/);
    const parsedDestination = sourceOnlyAt ? null : parseDestination(parts.destinationText, today, true);
    const destination = parsedDestination ?? { type: "unresolved" as const, kind: "time" as const };
    if (destination === "invalid") return { error: "That time is outside a valid 24-hour clock." };
    const parsedSelector = sourceOnlyAt
      ? parseSourceEventReference(stripped.replace(/^(?:move|shift|push|reschedule|put|change)\s+/, ""))
      : parts.selector;
    if (!parsedSelector) return { error: "I could not tell which event to move." };
    const selector = parsedSelector;
    if (destination.type === "dayPart") return { actions: [{ type: "defer", selector, date: destination.date,
      ...(/\b(?:morning|afternoon)\b/.test(parts.destinationText) ? { part: destination.part } : {}) }], constraints };
    return { actions: [{ type: "move", selector, destination }], constraints };
  }
  return { error: `I couldn't resolve an action from “${clause}”.` };
}

export function interpretTranscript(input: string, today: string, visibleWeekStart?: string): InterpretationResult {
  const source = calendarCommandSource(input, today);
  const literal = protectRenameValue(source, today);
  const normalized = normalizeTranscript(literal?.structure ?? source);
  if (!normalized) return { status: "unsupported", title: "Nothing to apply", detail: "Say or type a calendar change." };
  if (/^(?:remove|delete|cancel)\b.*\bevery\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(normalized)) return { status: "unsupported", title: "Which occurrence should I remove?", detail: "Name one date. Recurring weekday removal is not supported; nothing changed." };
  const preview = previewMode(normalized);
  const actions: CalendarAction[] = [];
  const constraints: CalendarConstraint[] = [];
  let lastConcreteSelector: Extract<CalendarAction, { selector: unknown }>["selector"] | undefined;
  for (const clause of splitClauses(preview.body)) {
    const preservation = parsePreservationGuard(clause);
    if (preservation) {
      constraints.push({ ...preservation, selector: preservation.selector.type === "anaphor" ? lastConcreteSelector ?? { type: "selected" } : preservation.selector });
      continue;
    }
    const parsed = parseTideClause(clause, today) ?? parseClause(clause, today, literal?.values, literal?.literalCreationTitles);
    if ("error" in parsed) return { status: "unsupported", title: "I need one detail", detail: parsed.error };
    const contextualActions: CalendarAction[] = parsed.actions.map((action) => {
      if (!((action.type === "move" || action.type === "create" || action.type === "fit" || action.type === "createBreathingRoom")
        && action.destination.type === "absolute")
        || action.destination.minutes < 8 * 60 || action.destination.minutes >= 12 * 60 || /\b(?:am|pm|morning)\b/.test(clause)) return action;
      const selector = "selector" in action && action.selector.type === "anaphor" ? lastConcreteSelector : "selector" in action ? action.selector : undefined;
      const titleHint = action.type === "create" || action.type === "fit" ? literal?.values[action.title] ?? action.title : selector?.type === "title" ? selector.query : "";
      return /\b(?:dinner|supper|evening)\b/i.test(titleHint)
        ? { ...action, destination: { ...action.destination, minutes: action.destination.minutes + 12 * 60 } } as CalendarAction
        : action;
    });
    actions.push(...contextualActions);
    for (const action of contextualActions) {
      if ("selector" in action && action.selector.type !== "anaphor") lastConcreteSelector = action.selector;
    }
    constraints.push(...parsed.constraints);
  }
  const recoveries = actions.filter((action) => action.type === "recover");
  if (recoveries.length > 1) {
    const first = actions.findIndex((action) => action.type === "recover");
    actions.splice(first + 1, actions.length - first - 1, ...actions.slice(first + 1).filter((action) => action.type !== "recover"));
  }
  if (!actions.length && constraints.length) {
    actions.push(...constraints.filter((constraint) => constraint.type === "keep").map((constraint) => ({ type: "protect" as const, selector: constraint.selector })));
  }
  const reflows = actions.filter((action) => action.type === "reflow");
  if (reflows.length > 1) {
    let last = -1;
    for (let index = actions.length - 1; index >= 0; index -= 1) {
      if (actions[index]?.type === "reflow") { last = index; break; }
    }
    for (let index = actions.length - 1; index >= 0; index -= 1) {
      if (actions[index]?.type === "reflow" && index !== last) actions.splice(index, 1);
    }
  }
  if (!actions.length) return { status: "unsupported", title: "No calendar action found", detail: "Tell me which event to add, move, resize, protect, defer, or remove." };
  const restoredActions = literal ? actions.map((action) => action.type === "update"
    ? { ...action, patch: { ...action.patch,
      ...(action.patch.title && literal.values[action.patch.title] !== undefined ? { title: literal.values[action.patch.title] } : {}),
      ...(action.patch.addLabels ? { addLabels: action.patch.addLabels.map((value) => literal.values[value] ?? value) } : {}),
      ...(action.patch.removeLabels ? { removeLabels: action.patch.removeLabels.map((value) => literal.values[value] ?? value) } : {}),
    } }
    : (action.type === "create" || action.type === "fit") && literal.values[action.title] !== undefined ? { ...action, title: literal.values[action.title]!, ...(literal.literalCreationTitles.has(action.title) ? { literalTitle: true } : {}) }
    : action.type === "merge" && action.title && literal.values[action.title] !== undefined ? { ...action, title: literal.values[action.title] } : action) : actions;
  const titles = restoredActions.flatMap((action) => "title" in action && action.title ? [action.title] : action.type === "update" && action.patch.title ? [action.patch.title] : []);
  if (titles.some((title) => /flowliteralvalue\d+/.test(title) && !Object.values(literal?.values ?? {}).includes(title))) return { status: "unsupported", title: "What is the complete event title?", detail: "I could not separate the title from its date and time. Nothing changed." };
  return { status: "ready", request: bindSourceDates({ transcript: input.trim(), normalized: normalizeTranscript(input), actions: restoredActions, constraints, mode: preview.mode }, today, visibleWeekStart) };
}
