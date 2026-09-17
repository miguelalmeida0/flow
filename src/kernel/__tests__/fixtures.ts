import { createInitialPlan } from "../../features/day-planner/seed";
import { withEventDefaults } from "../../features/day-planner/eventDefaults";
import { createInitialStudioState } from "../../domain/studio-model";
import { emptyFriendsState } from "../../domain/friends-model";
import type { LifeDocument } from "../../domain/life-model";
import { createDefaultRegistry } from "../capabilities";
import { createEnvironment, type KernelEnvironment } from "../kernel";
import type { KernelClock } from "../types";

export const AT = "2026-09-17T09:00:00.000Z";

export function fixedClock(iso: string = AT): KernelClock {
  return { now: () => new Date(iso) };
}

export function emptyDocument(dateKey = "2026-09-17"): LifeDocument {
  const calendar = createInitialPlan(dateKey);
  return {
    schemaVersion: 6,
    calendar,
    calendars: { [dateKey]: structuredClone(calendar) },
    captures: [],
    plans: [],
    steps: [],
    people: [],
    commitments: [],
    links: [],
    focus: {},
    environment: { location: { label: "Berlin", latitude: 52.52, longitude: 13.405, timezone: "Europe/Berlin" }, weatherByDate: {} },
    instinctState: { dismissedUntil: {}, lastShownAt: {} },
    studio: createInitialStudioState(AT),
    preferences: { workdayEndMinutes: 17 * 60, firstName: "Alex", weekStartsOn: 1 },
    friends: emptyFriendsState(),
  };
}

/** A day with Dinner (7-7:30 PM) and Drinks (8-8:30 PM) — the conflict shape
 * the sprint brief's Journey A and the consequence-engine examples describe.
 *
 * Both events are deliberately 30 minutes, not an hour: the schedulable day
 * ends at 9 PM (DAY_END, see features/day-planner/time.ts), so a 60-minute
 * Dinner moved to exactly 8 PM would leave zero slack for ANY same-day
 * alternative — 8:30 PM would already run past 9 PM regardless of how
 * short Drinks is. A 60-minute event butting up against the day boundary
 * genuinely has no valid alternative, which is a real (and separately
 * covered) case, but it isn't the "propose a genuinely free alternative"
 * scenario this fixture exists to model — hence 30-minute events here. */
export function journeyDocument(dateKey = "2026-09-17"): LifeDocument {
  const document = emptyDocument(dateKey);
  document.calendar = {
    dateKey,
    breathingRooms: [],
    deferred: [],
    events: [
      withEventDefaults({ id: "dinner", title: "Dinner", dateKey, start: 19 * 60, end: 19 * 60 + 30, kind: "protected", priority: "high" }),
      withEventDefaults({ id: "drinks", title: "Drinks", dateKey, start: 20 * 60, end: 20 * 60 + 30, kind: "fixed", priority: "medium" }),
    ],
  };
  document.calendars = { [dateKey]: structuredClone(document.calendar) };
  return document;
}

/** Same day as `journeyDocument`, but Dinner runs a full hour (7-8 PM) —
 * butting exactly against Drinks with zero slack before DAY_END (9 PM).
 * Models the "no valid same-day alternative" case: moving a 60-minute event
 * into the last free hour of the day, when that hour is already occupied,
 * has nowhere left to go. */
export function noAlternativeJourneyDocument(dateKey = "2026-09-17"): LifeDocument {
  const document = journeyDocument(dateKey);
  const dinner = document.calendar.events.find((event) => event.id === "dinner")!;
  const drinks = document.calendar.events.find((event) => event.id === "drinks")!;
  dinner.end = dinner.start + 60;
  drinks.end = drinks.start + 60;
  document.calendars = { [dateKey]: structuredClone(document.calendar) };
  return document;
}

export function testEnvironment(document: LifeDocument = emptyDocument(), clock: KernelClock = fixedClock()): KernelEnvironment {
  return createEnvironment(createDefaultRegistry(), document, { route: "today" }, clock);
}
