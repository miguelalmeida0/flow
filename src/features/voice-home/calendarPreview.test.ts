import { describe, expect, it } from "vitest";
import type { CalendarEvent, DayPlan } from "../day-planner/model";
import { selectCalendarPreviewEvents } from "./calendarPreview";

const today = "2026-09-07";
const now = new Date(`${today}T14:22:00`);
const starts = [450, 540, 660, 750, 840, 930, 1020, 1140];
const plan = (dateKey = today): DayPlan => ({ dateKey, deferred: [], events: starts.map((start, index) => ({
  id: `event-${index}`, title: `Event ${index}`, dateKey, start, end: start + 45, kind: "flexible", priority: "medium",
})) });
const ids = (events: CalendarEvent[]) => events.map(({ id }) => id);

describe("near-term Calendar preview", () => {
  it("prioritizes current then upcoming events without mutating the plan or event identity", () => {
    const original = plan();
    const before = structuredClone(original);
    const shown = selectCalendarPreviewEvents(original, now);
    expect(ids(shown)).toEqual(["event-4", "event-5", "event-6", "event-7"]);
    expect(shown[0]).toBe(original.events[4]);
    expect(original).toEqual(before);
  });
  it("retains past explicit targets and up to three clarification candidates without duplicates", () => {
    expect(ids(selectCalendarPreviewEvents(plan(), now, { targetId: "event-0", candidateIds: ["event-1", "event-2", "event-4"] })))
      .toEqual(["event-0", "event-1", "event-2", "event-4"]);
    expect(ids(selectCalendarPreviewEvents(plan(), now, { targetId: "event-4", candidateIds: ["event-4"] })))
      .toEqual(["event-4", "event-5", "event-6", "event-7"]);
  });
  it("shows a future day's first events, not only those after today's clock time", () => {
    expect(ids(selectCalendarPreviewEvents(plan("2026-09-08"), now))).toEqual(["event-0", "event-1", "event-2", "event-3"]);
  });
  it("shows a past day's most recent history in chronological order", () => {
    expect(ids(selectCalendarPreviewEvents(plan("2026-09-06"), now))).toEqual(["event-4", "event-5", "event-6", "event-7"]);
  });
  it("does not recycle expired events after day end, but retains an explicit reference", () => {
    const afterDay = new Date(`${today}T23:00:00`);
    expect(selectCalendarPreviewEvents(plan(), afterDay)).toEqual([]);
    expect(ids(selectCalendarPreviewEvents(plan(), afterDay, { targetId: "event-0" }))).toEqual(["event-0"]);
  });
  it("excludes finished/cancelled and wrong-date events unless an in-scope event is explicitly referenced", () => {
    const source = plan();
    source.events[4]!.status = "done";
    source.events[5]!.status = "cancelled";
    source.events[6]!.dateKey = "2026-09-08";
    expect(ids(selectCalendarPreviewEvents(source, now))).toEqual(["event-7"]);
    expect(ids(selectCalendarPreviewEvents(source, now, { targetId: "event-4" }))).toEqual(["event-4", "event-7"]);
  });
  it("treats an event's exact end as finished and preserves an empty day", () => {
    expect(ids(selectCalendarPreviewEvents(plan(), new Date(`${today}T14:45:00`)))).toEqual(["event-5", "event-6", "event-7"]);
    expect(selectCalendarPreviewEvents({ ...plan(), events: [] }, now)).toEqual([]);
  });
});
