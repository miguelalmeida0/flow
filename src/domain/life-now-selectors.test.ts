import { describe, expect, it } from "vitest";
import { emptyDay, projectCalendarDate } from "./life-calendar-world";
import { createFreshLifeSnapshot } from "./life-storage";
import { selectNowCandidates, selectNowWindow } from "./life-selectors";

const today = "2026-09-03";
const now = new Date(`${today}T10:15:00`);
const at = now.toISOString();
function documentWithWork() {
  const document = createFreshLifeSnapshot(today).document;
  document.people = [{ id: "maya", kind: "person", name: "Maya", createdAt: at, updatedAt: at }];
  document.plans = [
    { id: "later", kind: "plan", title: "Later", outcome: "Later", status: "active", stepIds: ["alpha"], dueAt: "2026-12-01", createdAt: at, updatedAt: at },
    { id: "earlier", kind: "plan", title: "Earlier", outcome: "Earlier", status: "active", stepIds: ["zeta"], dueAt: "2026-11-01", createdAt: at, updatedAt: at },
  ];
  document.steps = [
    { id: "alpha", kind: "plan-step", planId: "later", title: "Alpha", status: "planned", estimatedMinutes: 15, createdAt: at, updatedAt: at },
    { id: "zeta", kind: "plan-step", planId: "earlier", title: "Zeta", status: "planned", estimatedMinutes: 15, createdAt: at, updatedAt: at },
  ];
  document.commitments = [{ id: "promise", kind: "commitment", personId: "maya", title: "Proposal", direction: "i-owe", status: "open", deferredUntil: "2026-09-04", createdAt: at, updatedAt: at }];
  return document;
}

describe("actual-date Now selectors", () => {
  it.each(["2026-01-01", "2026-12-02"])("uses today's due/defer scoring while viewing %s without changing any bytes", (viewedDay) => {
    const source = documentWithWork();
    const expected = selectNowCandidates(source, now);
    expect(expected.map(({ id }) => id)).toEqual(["alpha", "zeta"]);
    const document = projectCalendarDate(source, viewedDay);
    const before = structuredClone(document);
    expect(selectNowCandidates(document, now)).toEqual(expected);
    expect(document).toEqual(before);
  });

  it.each(["2026-09-02", "2026-09-04"])("uses today's event, protected room and boundary rather than viewed %s", (viewedDay) => {
    const source = documentWithWork();
    source.calendar.breathingRooms = [{ id: "pause", dateKey: today, start: 615, end: 630, protected: true, source: "user", label: "Actual pause" }];
    source.calendar.endBoundaryMinutes = 1215;
    const document = projectCalendarDate(source, viewedDay);
    expect(selectNowWindow(document, now)).toMatchObject({ dateKey: today, minutes: 0, nextTitle: "Actual pause" });
    expect(selectNowWindow(document, new Date(`${today}T19:10:00`))).toMatchObject({ dateKey: today, minutes: 0, nextTitle: "Dinner" });
    expect(selectNowWindow(document, new Date(`${today}T20:00:00`))).toMatchObject({ dateKey: today, minutes: 15, end: 1215 });
  });

  it("uses the current active-day draft before its persisted calendar mirror, and never falls back to a different day", () => {
    const document = documentWithWork();
    document.calendar.endBoundaryMinutes = 620;
    expect(selectNowWindow(document, now).minutes).toBe(5);
    const absentDate = new Date("2026-09-10T20:30:00");
    expect(selectNowWindow(document, absentDate)).toMatchObject({ dateKey: "2026-09-10", minutes: 30, end: 1260 });
    expect(document.calendars["2026-09-10"]).toBeUndefined();
  });

  it("releases deferred commitments and updates due ranking according to real today only", () => {
    const document = projectCalendarDate(documentWithWork(), "2026-01-01");
    document.calendars["2026-11-01"] = emptyDay("2026-11-01");
    const candidates = selectNowCandidates(document, new Date("2026-11-01T10:15:00"));
    expect(candidates.map(({ id }) => id)).toEqual(["zeta", "alpha", "promise"]);
    expect(candidates.every((candidate) => !Object.hasOwn(candidate, "dateKey") && !Object.hasOwn(candidate, "startMinutes"))).toBe(true);
  });

  it("never calls ten-minute capture triage a fit in a five-minute window or a shorter query budget", () => {
    const document = documentWithWork();
    document.captures = [{ id: "note", kind: "capture", title: "Check passport", status: "unresolved", source: "typed", createdAt: at, updatedAt: at }];
    expect(selectNowCandidates(document, new Date(`${today}T10:55:00`))).toEqual([]);
    expect(selectNowCandidates(document, now, { excluded: [], maxMinutes: 5 })).toEqual([]);
    expect(selectNowCandidates(document, now, { excluded: [], maxMinutes: 10 }).map(({ id }) => id)).toEqual(["note"]);
    expect(selectNowCandidates(document, now, null)).toEqual([]);
  });
});
