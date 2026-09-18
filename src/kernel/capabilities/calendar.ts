import { applyLifeTransaction } from "../../domain/life-transaction";
import type { LifeDocument } from "../../domain/life-model";
import type { CalendarAction, CalendarRequest, Destination, EventSelector } from "../../features/day-planner/model";
import { DAY_END, DAY_START } from "../../features/day-planner/time";
import { firstAvailable, lastAvailable } from "../../features/day-planner/scheduling/slots";
import { formatMinutes } from "../lib/format";
import { dayPlanFor, findCalendarMatches, type CalendarMatch } from "../lib/calendarLookup";
import { emptyPreflight, fail, ok, type Capability, type CapabilityContext, type CapabilityResult, type PreflightResult } from "../types";

interface EventQuery {
  eventId?: string;
  title?: string;
  dateKey?: string;
}

function selectorFor(query: EventQuery): EventSelector {
  return query.eventId ? { type: "id", id: query.eventId } : { type: "title", query: query.title ?? "" };
}

type ResolveOutcome =
  | { kind: "found"; match: CalendarMatch }
  | { kind: "not-found"; message: string }
  | { kind: "ambiguous"; message: string; matches: CalendarMatch[] };

function resolveOne(ctx: CapabilityContext, query: EventQuery): ResolveOutcome {
  const matches = findCalendarMatches(ctx.document, query);
  const [first] = matches;
  if (matches.length === 0 || !first) return { kind: "not-found", message: `Couldn't find "${query.title ?? query.eventId}" on the calendar.` };
  if (matches.length > 1) return { kind: "ambiguous", message: `That matches ${matches.length} events — say which one.`, matches };
  return { kind: "found", match: first };
}

type RequestOutcome = { kind: "failed"; message: string } | { kind: "applied"; document: LifeDocument };

function runRequest(ctx: CapabilityContext, request: CalendarRequest): RequestOutcome {
  // The kernel's own preflight()/requiresConfirmation() are the single source
  // of truth for whether a step needs the user's approval (see kernel.ts's
  // continuePlan). By the time a capability's execute() runs, the kernel has
  // already gated on that, so the scheduling engine's own separate
  // confirmation prompt (e.g. for moving an anchored/protected event) would
  // just be a redundant second gate — always confirm here to bypass it.
  const result = applyLifeTransaction(ctx.document, [{ type: "calendar.request", request, confirmed: true }], ctx.clock.now);
  if (result.status !== "success") return { kind: "failed", message: `${result.title} ${result.detail}`.trim() };
  return { kind: "applied", document: result.document };
}

function overlapConflicts(ctx: CapabilityContext, dateKey: string, excludeId: string, start: number, end: number) {
  const day = dayPlanFor(ctx.document, dateKey);
  if (!day) return [];
  return day.events.filter((event) => event.id !== excludeId && start < event.end && end > event.start);
}

/** The requested slot itself can fail for a reason no *other* event is
 * responsible for: it simply falls outside the schedulable day window
 * (DAY_START/DAY_END, features/day-planner/time.ts). Without this check,
 * preflight would report "no conflicts" and let the kernel execute
 * immediately, only for the scheduling engine to reject it — the same class
 * of "proposal doesn't match what execute() will actually accept" gap as the
 * alternatives bug, just for the primary requested time instead of a
 * suggested one. */
function dayBoundsConflict(start: number, end: number): PreflightResult["conflicts"][number] | null {
  if (start >= DAY_START && end <= DAY_END) return null;
  return { code: "outside-day-window", message: `That's outside the ${formatMinutes(DAY_START)}–${formatMinutes(DAY_END)} schedulable day.` };
}

/**
 * Finds genuinely free slots near `start` for an event of length `duration`,
 * reusing the same `firstAvailable`/`lastAvailable` primitives the real
 * scheduling engine (schedulePlacement.ts) uses to actually place events —
 * so a proposed alternative is guaranteed to respect the schedulable day
 * window (DAY_START/DAY_END), every other event's placement (including
 * protected/anchored ones, which block just like any other event here),
 * and the requested duration, instead of re-deriving those rules by hand
 * and risking them drifting out of sync (see kernel verification report:
 * the previous offset-guessing version could propose alternatives that then
 * failed on execute() because it never checked DAY_END).
 *
 * Candidates are searched outward from `start` in both directions (forward
 * first, since that best matches "move it later" intent, then backward) and
 * always returned closest-to-`start` first — deterministic, and tied to what
 * the user actually asked for rather than an arbitrary day-wide scan.
 * `excludeStart`, when given (an event being moved away from its own current
 * time), filters out a "alternative" that is just the event's current,
 * unchanged position.
 */
function findAlternatives(
  ctx: CapabilityContext,
  dateKey: string,
  excludeId: string,
  start: number,
  duration: number,
  excludeStart?: number,
): PreflightResult["alternatives"] {
  const day = dayPlanFor(ctx.document, dateKey);
  const blocked = (day?.events ?? []).filter((event) => event.id !== excludeId);

  // One search per direction is enough: firstAvailable/lastAvailable already
  // walk every blocked event in sorted order internally, so a single call
  // correctly skips any number of adjacent conflicts to land on the real gap
  // beyond them. Looking for a *second* candidate per direction by nudging
  // the cursor further out has no natural stopping point once the nearby
  // events are exhausted — it degenerates into arbitrary, ever-more-distant
  // guesses disconnected from what the user actually asked for, which is
  // exactly the failure mode this function exists to avoid.
  const forward = firstAvailable(blocked, duration, start, DAY_END);
  const backward = lastAvailable(blocked, duration, DAY_START, Math.min(start + duration, DAY_END));
  const candidates = [forward, backward].filter((candidate): candidate is number => candidate !== null && candidate !== excludeStart);

  // Closest to the requested time wins; a tie between an earlier and a later
  // candidate is broken in favor of the later one, since that matches the
  // direction the user actually asked to move in (never guessing "backward"
  // over an equally-close "forward" option just because it sorts first).
  return [...new Set(candidates)]
    .sort((a, b) => Math.abs(a - start) - Math.abs(b - start) || Number(a < start) - Number(b < start) || a - b)
    .map((candidate) => ({
      label: formatMinutes(candidate),
      description: `Move it to ${formatMinutes(candidate)} instead?`,
      args: { startMinutes: candidate },
    }));
}

/** All event ids present anywhere in the document (today's canonical day plan
 * plus every stored calendar date, including deferred items) — used to spot
 * the one id a create action just introduced without depending on the
 * scheduling engine's internal id-generation mechanics (cross-date deferral,
 * Tide reflow, etc. can all reshape the plan before the new event settles). */
function allEventIds(document: LifeDocument): Set<string> {
  const ids = new Set<string>();
  const plans = [document.calendar, ...Object.values(document.calendars)];
  for (const plan of plans) for (const event of [...plan.events, ...plan.deferred]) ids.add(event.id);
  return ids;
}

function newlyCreatedEventId(before: LifeDocument, after: LifeDocument): string | undefined {
  const beforeIds = allEventIds(before);
  const plans = [after.calendar, ...Object.values(after.calendars)];
  for (const plan of plans) {
    for (const event of [...plan.events, ...plan.deferred]) {
      if (!beforeIds.has(event.id)) return event.id;
    }
  }
  return undefined;
}

export interface CalendarCreateArgs {
  title: string;
  startMinutes: number;
  durationMinutes: number;
  dateKey?: string;
  protect?: boolean;
}

export interface CalendarMoveArgs {
  eventId?: string;
  title?: string;
  startMinutes: number;
  dateKey?: string;
}

export interface CalendarRenameArgs {
  eventId?: string;
  title?: string;
  newTitle: string;
  dateKey?: string;
}

export interface CalendarDeleteArgs {
  eventId?: string;
  title?: string;
  dateKey?: string;
}

export interface CalendarProtectArgs {
  eventId?: string;
  title?: string;
  dateKey?: string;
  protect?: boolean;
}

export interface CalendarQueryArgs {
  dateKey?: string;
}

export const calendarCreate: Capability<CalendarCreateArgs> = {
  id: "calendar.create",
  domain: "calendar",
  description: "Create a new calendar event.",
  mutates: true,
  undoable: true,
  riskLevel: "low",
  requiresConfirmation: () => false,
  validate: (args) => (!args.title ? "Needs a title." : args.durationMinutes <= 0 ? "Duration must be positive." : null),
  preflight: (args, ctx): PreflightResult => {
    const dateKey = args.dateKey ?? ctx.document.calendar.dateKey;
    const bounds = dayBoundsConflict(args.startMinutes, args.startMinutes + args.durationMinutes);
    const conflicts = [...(bounds ? [bounds] : []), ...overlapConflicts(ctx, dateKey, "", args.startMinutes, args.startMinutes + args.durationMinutes).map((event) => ({ code: "time-conflict", message: `${event.title} is already scheduled ${formatMinutes(event.start)}–${formatMinutes(event.end)}.`, withEntityId: event.id }))];
    if (conflicts.length === 0) return emptyPreflight();
    return {
      blocking: true,
      conflicts,
      warnings: [],
      alternatives: findAlternatives(ctx, dateKey, "", args.startMinutes, args.durationMinutes),
      dependencies: [],
    };
  },
  execute: (args, ctx): CapabilityResult => {
    const dateKey = args.dateKey ?? ctx.document.calendar.dateKey;
    const destination: Destination = { type: "absolute", minutes: args.startMinutes, date: { dateKey } };
    const action: CalendarAction = { type: "create", title: args.title, literalTitle: true, durationMinutes: args.durationMinutes, destination };
    const request: CalendarRequest = { transcript: `create ${args.title}`, normalized: "", actions: action.type === "create" && args.protect ? [action, { type: "protect", selector: { type: "title", query: args.title } }] : [action], constraints: [] };
    const outcome = runRequest(ctx, request);
    if (outcome.kind === "failed") return fail("calendar-create-failed", outcome.message);
    const entityId = newlyCreatedEventId(ctx.document, outcome.document);
    return ok(`Created "${args.title}" at ${formatMinutes(args.startMinutes)}.`, { document: outcome.document }, { entityId, entityKind: "calendar-event" });
  },
};

export const calendarMove: Capability<CalendarMoveArgs> = {
  id: "calendar.move",
  domain: "calendar",
  description: "Move an existing calendar event to a new time.",
  mutates: true,
  undoable: true,
  riskLevel: "medium",
  requiresConfirmation: () => false,
  validate: (args) => (!args.eventId && !args.title ? "Say which event to move." : args.startMinutes == null ? "Say what time to move it to." : null),
  preflight: (args, ctx): PreflightResult => {
    const resolved = resolveOne(ctx, args);
    if (resolved.kind !== "found") {
      return {
        blocking: true,
        conflicts: [{ code: resolved.kind === "ambiguous" ? "ambiguous-selector" : "not-found", message: resolved.message }],
        warnings: [],
        alternatives: resolved.kind === "ambiguous" ? resolved.matches.map((m) => ({ label: `${m.event.title} (${m.dateKey})`, description: `Move ${m.event.title} on ${m.dateKey}?`, args: { eventId: m.event.id } })) : [],
        dependencies: [],
      };
    }
    const { event, dateKey } = resolved.match;
    const targetDateKey = args.dateKey ?? dateKey;
    const duration = event.end - event.start;
    const bounds = dayBoundsConflict(args.startMinutes, args.startMinutes + duration);
    const conflicts = [
      ...(bounds ? [bounds] : []),
      ...overlapConflicts(ctx, targetDateKey, event.id, args.startMinutes, args.startMinutes + duration).map((other) => ({ code: "time-conflict", message: `You already have ${other.title} at ${formatMinutes(other.start)}.`, withEntityId: other.id })),
    ];
    if (conflicts.length === 0) return emptyPreflight();
    return {
      blocking: true,
      conflicts,
      warnings: [],
      alternatives: findAlternatives(ctx, targetDateKey, event.id, args.startMinutes, duration, event.start),
      dependencies: [],
    };
  },
  execute: (args, ctx): CapabilityResult => {
    const resolved = resolveOne(ctx, args);
    if (resolved.kind !== "found") return fail("ambiguous", resolved.message);
    const { event, dateKey } = resolved.match;
    const destination: Destination = { type: "absolute", minutes: args.startMinutes, date: { dateKey: args.dateKey ?? dateKey } };
    const request: CalendarRequest = {
      transcript: `move ${event.title}`,
      normalized: "",
      actions: [{ type: "move", selector: selectorFor({ eventId: event.id }), destination }],
      constraints: [],
    };
    // runRequest's underlying multi-day world normalization can throw on a
    // cross-day identity collision (see life-calendar-world.ts) rather than
    // returning a typed failure — a capability must never let that escape as
    // an uncaught exception, so convert it into an ordinary CapabilityFailure.
    let outcome: ReturnType<typeof runRequest>;
    try {
      outcome = runRequest(ctx, request);
    } catch (error) {
      return fail("calendar-move-failed", error instanceof Error ? error.message : "That move could not be completed.");
    }
    if (outcome.kind === "failed") return fail("calendar-move-failed", outcome.message);
    return ok(
      `Moved ${event.title} from ${formatMinutes(event.start)} to ${formatMinutes(args.startMinutes)}.`,
      { document: outcome.document },
      { entityId: event.id, entityKind: "calendar-event" },
    );
  },
};

export const calendarRename: Capability<CalendarRenameArgs> = {
  id: "calendar.rename",
  domain: "calendar",
  description: "Rename an existing calendar event.",
  mutates: true,
  undoable: true,
  riskLevel: "low",
  requiresConfirmation: () => false,
  validate: (args) => (!args.eventId && !args.title ? "Say which event to rename." : !args.newTitle ? "Say the new name." : null),
  execute: (args, ctx): CapabilityResult => {
    const resolved = resolveOne(ctx, args);
    if (resolved.kind !== "found") return fail("ambiguous", resolved.message);
    const { event } = resolved.match;
    const request: CalendarRequest = {
      transcript: `rename ${event.title} to ${args.newTitle}`,
      normalized: "",
      actions: [{ type: "update", selector: selectorFor({ eventId: event.id }), patch: { title: args.newTitle } }],
      constraints: [],
    };
    const outcome = runRequest(ctx, request);
    if (outcome.kind === "failed") return fail("calendar-rename-failed", outcome.message);
    return ok(`Renamed "${event.title}" to "${args.newTitle}".`, { document: outcome.document }, { entityId: event.id, entityKind: "calendar-event" });
  },
};

export const calendarDelete: Capability<CalendarDeleteArgs> = {
  id: "calendar.delete",
  domain: "calendar",
  description: "Delete a calendar event.",
  mutates: true,
  undoable: true,
  riskLevel: "high",
  requiresConfirmation: () => true,
  validate: (args) => (!args.eventId && !args.title ? "Say which event to delete." : null),
  execute: (args, ctx): CapabilityResult => {
    const resolved = resolveOne(ctx, args);
    if (resolved.kind !== "found") return fail("ambiguous", resolved.message);
    const { event } = resolved.match;
    const request: CalendarRequest = { transcript: `delete ${event.title}`, normalized: "", actions: [{ type: "delete", selector: selectorFor({ eventId: event.id }) }], constraints: [] };
    const outcome = runRequest(ctx, request);
    if (outcome.kind === "failed") return fail("calendar-delete-failed", outcome.message);
    return ok(`Deleted "${event.title}".`, { document: outcome.document }, { entityId: event.id, entityKind: "calendar-event" });
  },
};

export const calendarProtect: Capability<CalendarProtectArgs> = {
  id: "calendar.protect",
  domain: "calendar",
  description: "Protect (or unprotect) a calendar event from being moved.",
  mutates: true,
  undoable: true,
  riskLevel: "low",
  requiresConfirmation: () => false,
  validate: (args) => (!args.eventId && !args.title ? "Say which event to protect." : null),
  execute: (args, ctx): CapabilityResult => {
    const resolved = resolveOne(ctx, args);
    if (resolved.kind !== "found") return fail("ambiguous", resolved.message);
    const { event } = resolved.match;
    const protect = args.protect ?? true;
    const request: CalendarRequest = {
      transcript: `${protect ? "protect" : "unprotect"} ${event.title}`,
      normalized: "",
      actions: [{ type: protect ? "protect" : "unprotect", selector: selectorFor({ eventId: event.id }) }],
      constraints: [],
    };
    const outcome = runRequest(ctx, request);
    if (outcome.kind === "failed") return fail("calendar-protect-failed", outcome.message);
    return ok(`${protect ? "Protected" : "Unprotected"} "${event.title}".`, { document: outcome.document }, { entityId: event.id, entityKind: "calendar-event" });
  },
};

export const calendarQuery: Capability<CalendarQueryArgs> = {
  id: "calendar.query",
  domain: "calendar",
  description: "List events for a day.",
  mutates: false,
  undoable: false,
  riskLevel: "low",
  requiresConfirmation: () => false,
  validate: () => null,
  execute: (args, ctx): CapabilityResult => {
    const dateKey = args.dateKey ?? ctx.document.calendar.dateKey;
    const day = dayPlanFor(ctx.document, dateKey);
    const events = day?.events ?? [];
    return ok(
      events.length === 0 ? `Nothing scheduled on ${dateKey}.` : `${events.length} event${events.length === 1 ? "" : "s"} on ${dateKey}.`,
      {},
      { data: events },
    );
  },
};

export const calendarCapabilities = [calendarCreate, calendarMove, calendarRename, calendarDelete, calendarProtect, calendarQuery];
