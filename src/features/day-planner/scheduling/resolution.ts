import type { CalendarEvent, CalendarRequest, DayPlan, Destination, EventSelector } from "../model";
import { formatTime } from "../time";
import { selectorLabel } from "../interpretation/references";
import { canTideMove, eventColor, eventImportance, eventMobility, eventProtected, eventStatus } from "../eventDefaults";
import { sourceDateKey, validSourceDate } from "../interpretation/sourceDates";

export type ResolutionResult =
  | { status: "resolved"; events: CalendarEvent[] }
  | { status: "clarification"; type: "event"; question: string; selector: EventSelector; choices: { id: string; label: string }[] }
  | { status: "missing"; detail: string };

function searchable(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const boundaryGenericNouns = new Set(["meeting", "appointment", "task", "event", "block", "session"]);

function words(value: string) {
  return searchable(value).split(" ").filter(Boolean);
}

function singular(token: string) {
  return token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token;
}

function uniqueEvents(events: CalendarEvent[]) {
  return [...new Map(events.map((event) => [event.id, event])).values()];
}

function contiguousMatches(events: CalendarEvent[], query: string) {
  return events.filter((event) => searchable(event.title).includes(query));
}

function tokenMatches(events: CalendarEvent[], query: string) {
  const queryTokens = words(query).map(singular);
  return events.filter((event) => {
    const titleTokens = words(event.title).map(singular);
    return queryTokens.every((token) => titleTokens.includes(token));
  });
}

function boundaryAliases(query: string) {
  const tokens = words(query);
  const aliases: string[] = [];
  const add = (candidate: string[]) => {
    if (candidate.length && candidate.some((token) => !boundaryGenericNouns.has(token))) aliases.push(candidate.join(" "));
  };
  if (boundaryGenericNouns.has(tokens[0] ?? "")) add(tokens.slice(1));
  if (boundaryGenericNouns.has(tokens.at(-1) ?? "")) add(tokens.slice(0, -1));
  return [...new Set(aliases)];
}

/** Stops at each exact, contiguous-phrase, token, and safe boundary-alias tier. */
export function matchTitleReference(events: CalendarEvent[], rawQuery: string) {
  const query = searchable(rawQuery);
  if (!query) return [];
  const exact = events.filter((event) => searchable(event.title) === query);
  if (exact.length) return exact;
  const contiguous = contiguousMatches(events, query);
  if (contiguous.length) return contiguous;
  const tokens = tokenMatches(events, query);
  if (tokens.length) return tokens;

  const aliases = boundaryAliases(query);
  const aliasExact = uniqueEvents(aliases.flatMap((alias) =>
    events.filter((event) => searchable(event.title) === alias)));
  if (aliasExact.length) return aliasExact;
  const aliasContiguous = uniqueEvents(aliases.flatMap((alias) => contiguousMatches(events, alias)));
  if (aliasContiguous.length) return aliasContiguous;
  return uniqueEvents(aliases.flatMap((alias) => tokenMatches(events, alias)));
}

export function eventDateLabel(dateKey: string) {
  return new Intl.DateTimeFormat("en", { weekday: "long", month: "short", day: "numeric" }).format(new Date(`${dateKey}T12:00:00`));
}

function choices(events: CalendarEvent[]) {
  return [...events].sort((left, right) => left.dateKey.localeCompare(right.dateKey) || left.start - right.start).slice(0, 3).map((event) => ({
    id: event.id,
    label: `${event.title} — ${eventDateLabel(event.dateKey)}, ${formatTime(event.start)}`,
  }));
}

function clarification(question: string, selector: EventSelector, events: CalendarEvent[]): ResolutionResult {
  return { status: "clarification", type: "event", question, selector, choices: choices(events) };
}

function liveEvents(plan: DayPlan) {
  return plan.events.filter((event) => !["done", "cancelled"].includes(eventStatus(event)));
}

function addressableEvents(plan: DayPlan) {
  return uniqueEvents([...plan.events, ...plan.deferred, ...(plan.referenceEvents ?? [])]).filter((event) => eventStatus(event) !== "cancelled");
}

function filterByQuery(events: CalendarEvent[], query?: string) {
  if (!query) return events;
  const titleMatches = matchTitleReference(events, query);
  if (titleMatches.length) return titleMatches;
  const tokens = words(query).map(singular).filter((token) => !boundaryGenericNouns.has(token) && token !== "work");
  if (!tokens.length) return events;
  return events.filter((event) => {
    const labels = (event.labels ?? []).flatMap(words).map(singular);
    return tokens.every((token) => labels.includes(token));
  });
}

export function resolveEventReference(plan: DayPlan, selector: EventSelector, selectedId?: string, nowMinutes = 12 * 60, doneOnly = false, destructive = false): ResolutionResult {
  if (selector.participantIds?.length) {
    const matches = (event: CalendarEvent) => selector.participantIds!.every((id) => event.participantIds?.includes(id));
    const result = resolveEventReference({ ...plan, events: plan.events.filter(matches), deferred: plan.deferred.filter(matches), referenceEvents: plan.referenceEvents?.filter(matches) }, { ...selector, participantIds: undefined }, selectedId, nowMinutes, doneOnly, destructive);
    return result.status === "clarification" ? { ...result, selector } : result;
  }
  if (selector.date) {
    if (selector.literalDateQuery) {
      const literal = addressableEvents(plan).filter((event) => searchable(event.title) === searchable(selector.literalDateQuery!));
      if (literal.length === 1) return { status: "resolved", events: literal };
      if (literal.length > 1) return clarification(`Which ${selector.literalDateQuery} do you mean?`, selector, literal);
    }
    const dateKey = sourceDateKey(selector.date, plan.dateKey);
    if (!validSourceDate(dateKey)) return { status: "missing", detail: `${dateKey} is not a valid calendar date. Nothing changed.` };
    const undated = { ...selector, date: undefined };
    const events = uniqueEvents([...plan.events, ...plan.deferred, ...(plan.referenceEvents ?? [])]).filter((event) => event.dateKey === dateKey);
    const result = resolveEventReference({ dateKey, events, deferred: [] }, undated, selectedId, nowMinutes, doneOnly, destructive);
    return result.status === "clarification" ? { ...result, selector } : result;
  }
  const searchableEvents = addressableEvents(plan);
  const schedulingEvents = doneOnly ? plan.events.filter((event) => eventStatus(event) === "done") : liveEvents(plan);
  if (selector.type === "id") {
    const event = searchableEvents.find((item) => item.id === selector.id);
    return event ? { status: "resolved", events: [event] } : { status: "missing", detail: "That event is no longer in the plan." };
  }
  if (selector.type === "selected") {
    const selected = (doneOnly ? schedulingEvents : searchableEvents).find((event) => event.id === selectedId);
    if (selected) return { status: "resolved", events: [selected] };
    if (doneOnly) {
      return schedulingEvents.length
        ? clarification("Which completed event should I reopen?", selector, schedulingEvents)
        : { status: "missing", detail: "There is no completed event to reopen." };
    }
    const active = liveEvents(plan).filter((event) => eventStatus(event) === "active");
    if (active.length === 1) return { status: "resolved", events: active };
    if (active.length > 1) return clarification("Which active event do you mean?", selector, active);
    const current = liveEvents(plan).filter((event) => event.start <= nowMinutes && event.end > nowMinutes);
    return current.length === 1
      ? { status: "resolved", events: current }
      : clarification("Which event do you mean?", selector, current.length ? current : liveEvents(plan));
  }
  if (selector.type === "title") {
    // A completed item remains directly addressable for reopen and explicit
    // inspection, while events projected from other dates never compete with
    // the active time scope. Batch/default selectors still use liveEvents.
    const titlePool = doneOnly
      ? schedulingEvents
      : plan.events.filter((event) => eventStatus(event) !== "cancelled");
    const primary = matchTitleReference(titlePool, selector.query);
    const matches = primary.length || !selector.fallbackQuery ? primary : matchTitleReference(titlePool, selector.fallbackQuery);
    if (matches.length === 1) return { status: "resolved", events: matches };
    if (matches.length > 1) return clarification(`Which ${selector.query} do you mean?`, selector, matches);
    return { status: "missing", detail: `I could not find “${selector.query}” in ${scopeLabel(plan)}.` };
  }
  if (selector.type === "source") {
    const literal = selector.literalQuery ? schedulingEvents.filter((event) => searchable(event.title) === searchable(selector.literalQuery!)) : [];
    if (literal.length === 1) return { status: "resolved", events: literal };
    if (literal.length > 1) return clarification(`Which ${selector.literalQuery} do you mean?`, selector, literal);
    let matches = schedulingEvents.filter((event) => {
      if (selector.period === "morning" && event.start >= 12 * 60) return false;
      if (selector.period === "afternoon" && (event.start < 12 * 60 || event.start >= 17 * 60)) return false;
      if (selector.period === "evening" && event.start < 17 * 60) return false;
      return true;
    });
    if (selector.at === undefined && !selector.period && !selector.query) {
      return { status: "missing", detail: "I need a title, selected event, or source time." };
    }
    const query = selector.query ? searchable(selector.query) : undefined;
    const timeQualifiedGeneric = Boolean((selector.at !== undefined || selector.period)
      && query && (boundaryGenericNouns.has(query) || query === "calendar event"));
    if (query && !timeQualifiedGeneric) matches = matchTitleReference(matches, query);
    if (selector.at !== undefined) {
      const at = selector.at;
      const exact = matches.filter((event) => event.start === at);
      const containing = matches.filter((event) => event.start < at && event.end > at);
      const near = matches.filter((event) => Math.abs(event.start - at) <= 30)
        .sort((a, b) => Math.abs(a.start - at) - Math.abs(b.start - at));
      matches = exact.length ? exact : uniqueEvents([...containing, ...near]);
      if (destructive && !exact.length && matches.length) return clarification(`I found ${matches.length === 1 ? `${matches[0]!.title} at ${formatTime(matches[0]!.start)}` : "nearby events"}, not an exact ${formatTime(at)} start. Which event should I remove?`, selector, matches);
    }
    if (matches.length === 1) return { status: "resolved", events: matches };
    const sourceLabel = selector.at !== undefined
      ? `the event starting at ${formatTime(selector.at)}`
      : `the ${selector.period ?? "matching"} event`;
    if (matches.length > 1) return clarification(`Which ${selector.query ?? "event"} do you mean?`, selector, matches);
    return { status: "missing", detail: `I could not find ${selector.query ? `“${selector.query}” matching ` : ""}${sourceLabel} in ${scopeLabel(plan)}.` };
  }

  if (selector.type === "position") {
    const candidates = filterByQuery(schedulingEvents, selector.query).sort((left, right) => left.start - right.start);
    let matches: CalendarEvent[] = [];
    if (selector.position === "current") {
      const active = candidates.filter((event) => eventStatus(event) === "active");
      if (active.length > 1) return clarification("Which active event is current?", selector, active);
      matches = active.length ? active : candidates.filter((event) => event.start <= nowMinutes && event.end > nowMinutes);
    }
    if (selector.position === "next") matches = candidates.filter((event) => event.start > nowMinutes).slice(0, 1);
    if (selector.position === "previous") matches = candidates.filter((event) => event.end <= nowMinutes).slice(-1);
    if (selector.position === "last") matches = candidates.slice(-1);
    if (matches.length) return { status: "resolved", events: matches };
    return { status: "missing", detail: `There is no ${selector.position} ${selector.query ?? "event"} to change.` };
  }

  if (selector.type === "relativeEvent") {
    const anchor = resolveEventReference(plan, selector.anchor, selectedId, nowMinutes, doneOnly);
    if (anchor.status !== "resolved") return anchor;
    const target = anchor.events[0];
    if (!target) return { status: "missing", detail: "I could not resolve that relative event." };
    const ordered = schedulingEvents.filter((event) => event.id !== target.id).sort((left, right) => left.start - right.start);
    const match = selector.relation === "before"
      ? ordered.filter((event) => event.end <= target.start).slice(-1)
      : ordered.filter((event) => event.start >= target.end).slice(0, 1);
    return match.length ? { status: "resolved", events: match } : { status: "missing", detail: `There is no event ${selector.relation} ${target.title}.` };
  }

  if (selector.type === "filter") {
    const filterPool = doneOnly || selector.status === "done"
      ? plan.events.filter((event) => eventStatus(event) === "done")
      : liveEvents(plan);
    let matches = filterByQuery(filterPool, selector.query);
    if (selector.color) matches = matches.filter((event) => eventColor(event) === selector.color);
    if (selector.label) matches = matches.filter((event) => (event.labels ?? []).some((label) => searchable(label) === searchable(selector.label!)));
    if (selector.status) matches = matches.filter((event) => eventStatus(event) === selector.status);
    if (selector.importance) matches = matches.filter((event) => eventImportance(event) === selector.importance);
    if (selector.mobility) matches = matches.filter((event) => eventMobility(event) === selector.mobility);
    if (selector.protected !== undefined) matches = matches.filter((event) => eventProtected(event) === selector.protected);
    if (!matches.length) return { status: "missing", detail: `There are no ${selectorLabel(selector)} to change.` };
    if (selector.cardinality === "one" && matches.length > 1) return clarification(`Which ${selector.query ?? selector.color ?? selector.label ?? "event"} do you mean?`, selector, matches);
    return { status: "resolved", events: matches };
  }

  if (selector.type === "multi") {
    const collected: CalendarEvent[] = [];
    for (const part of selector.selectors) {
      const result = resolveEventReference(plan, part, selectedId, nowMinutes, doneOnly, destructive);
      if (result.status !== "resolved") return result;
      collected.push(...result.events);
    }
    return { status: "resolved", events: uniqueEvents(collected) };
  }

  if (selector.type === "anaphor") {
    if (!selectedId) return clarification("Which event do you mean?", selector, liveEvents(plan));
    const selected = (doneOnly ? schedulingEvents : searchableEvents).find((event) => event.id === selectedId);
    if (!selected) return { status: "missing", detail: "That event is no longer in the plan." };
    if (selector.ordinal && selected.linkedGroupId) {
      const group = searchableEvents.filter((event) => event.linkedGroupId === selected.linkedGroupId).sort((left, right) => left.start - right.start);
      const part = group[selector.ordinal - 1];
      return part ? { status: "resolved", events: [part] } : { status: "missing", detail: `That split has no part ${selector.ordinal}.` };
    }
    return { status: "resolved", events: [selected] };
  }

  let matches = doneOnly || selector.status === "done"
    ? plan.events.filter((event) => eventStatus(event) === "done")
    : liveEvents(plan);
  if (selector.kind === "flexible") matches = matches.filter(canTideMove);
  if (selector.kind === "fixed") matches = matches.filter((event) => eventMobility(event) === "anchored");
  if (selector.priority) matches = matches.filter((event) => event.priority === selector.priority);
  if (selector.color) matches = matches.filter((event) => eventColor(event) === selector.color);
  if (selector.label) matches = matches.filter((event) => (event.labels ?? []).includes(selector.label!));
  if (selector.status) matches = matches.filter((event) => eventStatus(event) === selector.status);
  if (selector.importance) matches = matches.filter((event) => eventImportance(event) === selector.importance);
  if (selector.mobility) matches = matches.filter((event) => eventMobility(event) === selector.mobility);
  if (selector.protected !== undefined) matches = matches.filter((event) => eventProtected(event) === selector.protected);
  if (selector.period === "morning") matches = matches.filter((event) => event.start < 12 * 60);
  if (selector.period === "afternoon") matches = matches.filter((event) => event.start >= 12 * 60);
  if (selector.after) {
    const anchor = resolveEventReference(plan, selector.after, selectedId, nowMinutes, doneOnly);
    if (anchor.status !== "resolved") return anchor;
    const after = anchor.events[0];
    if (after) matches = matches.filter((event) => event.start >= after.end && event.id !== after.id);
  }
  return matches.length
    ? { status: "resolved", events: matches }
    : { status: "missing", detail: `There are no ${selectorLabel(selector)} to change.` };
}

function scopeLabel(plan: DayPlan) {
  const dates = [...new Set(plan.events.map(({ dateKey }) => dateKey))];
  return dates.length > 1 ? "the visible calendar dates" : `the calendar for ${eventDateLabel(dates[0] ?? plan.dateKey)}`;
}

function replaceSelector(selector: EventSelector, target: EventSelector, eventId: string): EventSelector {
  if (JSON.stringify(selector) === JSON.stringify(target)) return { type: "id", id: eventId };
  if (selector.type === "all" && selector.after) return { ...selector, after: replaceSelector(selector.after, target, eventId) };
  if (selector.type === "relativeEvent") return { ...selector, anchor: replaceSelector(selector.anchor, target, eventId) };
  if (selector.type === "multi") return { ...selector, selectors: selector.selectors.map((part) => replaceSelector(part, target, eventId)) };
  return selector;
}

export function applyClarificationChoice<T>(value: T, target: EventSelector, eventId: string): T {
  if (Array.isArray(value)) return value.map((item) => applyClarificationChoice(item, target, eventId)) as T;
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (typeof record.type === "string" && ["id", "selected", "title", "source", "all", "position", "filter", "relativeEvent", "anaphor", "multi"].includes(record.type)) {
    return replaceSelector(value as unknown as EventSelector, target, eventId) as T;
  }
  return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, applyClarificationChoice(item, target, eventId)])) as T;
}

export function applyDestinationChoice(
  request: CalendarRequest,
  actionIndex: number,
  destination: Exclude<Destination, { type: "unresolved" }>,
): CalendarRequest {
  return {
    ...request,
    actions: request.actions.map((action, index) => {
      if (index !== actionIndex || action.type !== "move") return action;
      return { ...action, destination };
    }),
  };
}

export function applyBoundaryChoice(request: CalendarRequest, actionIndex: number, endMinutes: number): CalendarRequest {
  return {
    ...request,
    actions: request.actions.map((action, index) => index === actionIndex && action.type === "setDayBoundary"
      ? { ...action, endMinutes }
      : action),
  };
}
