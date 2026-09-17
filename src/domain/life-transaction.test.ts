import { describe, expect, it } from "vitest";
import { createInitialPlan, createInitialTomorrowPlan } from "../features/day-planner/seed";
import type { LifeAction } from "./life-actions";
import { validateLifeDocument } from "./life-invariants";
import { selectNowCandidates, selectNowWindow } from "./life-selectors";
import { applyLifeTransaction } from "./life-transaction";
import { normalizeCalendarWorld } from "./life-calendar-world";
import type { Capture, LifeDocument, Plan, PlanStep } from "./life-model";
import { createInitialStudioState } from "./studio-model";
import { acceptanceFixture } from "../features/voice-intelligence/acceptanceFixtures";

const at = "2026-09-03T10:00:00.000Z";
function emptyDocument(): LifeDocument {
  const calendar = createInitialPlan("2026-09-03");
  return {
    schemaVersion: 5, calendar, calendars: { [calendar.dateKey]: structuredClone(calendar) },
    captures: [], plans: [], steps: [], people: [], commitments: [], links: [], focus: {},
    environment: { location: { label: "Berlin", latitude: 52.52, longitude: 13.405, timezone: "Europe/Berlin" }, weatherByDate: {} },
    instinctState: { dismissedUntil: {}, lastShownAt: {} },
    studio: createInitialStudioState(at),
    preferences: { workdayEndMinutes: 17 * 60, firstName: "Alex", weekStartsOn: 1 },
  };
}

function passportActions(): LifeAction[] {
  const capture: Capture = { id: "capture-passport", kind: "capture", title: "Renew passport before Senegal", status: "unresolved", source: "typed", createdAt: at, updatedAt: at };
  const plan: Plan = { id: "plan-passport", kind: "plan", title: capture.title, outcome: "Passport ready", status: "active", stepIds: [], createdAt: at, updatedAt: at };
  const step: PlanStep = { id: "step-documents", kind: "plan-step", planId: plan.id, title: "Documents", status: "planned", estimatedMinutes: 25, createdAt: at, updatedAt: at };
  return [
    { type: "capture.create", capture }, { type: "plan.create", plan }, { type: "plan.step.add", step },
    { type: "link.create", link: { id: "link-origin", type: "capture-origin-of-plan", fromId: capture.id, toId: plan.id, createdAt: at } },
    { type: "capture.resolve", captureId: capture.id },
  ];
}

describe("LifeDocument transactions", () => {
  it("moves and resizes an existing commitment reservation atomically across dates", () => {
    const { snapshot } = acceptanceFixture("commitment-scheduled");
    const before = structuredClone(snapshot.document);
    const action: LifeAction = { type: "commitment.schedule", commitmentId: "K1", eventId: "must-not-be-created", dateKey: "2026-09-11", startMinutes: 660, durationMinutes: 20 };
    const result = applyLifeTransaction(before, [action], () => new Date("2026-09-08T08:00:00.000Z"));
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    const expected = structuredClone(before);
    const source = expected.calendars["2026-09-09"]!;
    const reservation = source.events.find(({ id }) => id === "R2")!;
    source.events = source.events.filter(({ id }) => id !== "R2");
    expected.calendars["2026-09-11"] = { dateKey: "2026-09-11", events: [{ ...reservation, dateKey: "2026-09-11", start: 660, end: 680 }], deferred: [], breathingRooms: [] };
    expect(result.document).toEqual(expected);
    expect(snapshot.document).toEqual(before);
    expect(validateLifeDocument(result.document)).toBeNull();
  });
  it("rejects duplicate calendar identities across different days before normalization can discard either event", () => {
    const document = emptyDocument();
    const duplicate = { ...document.calendar.events[0]!, dateKey: "2026-09-04", start: 600, end: 660 };
    document.calendars[duplicate.dateKey] = { dateKey: duplicate.dateKey, events: [duplicate], deferred: [], breathingRooms: [] };
    expect(validateLifeDocument(document)).toBe(`Duplicate identity ${duplicate.id}.`);
    expect(() => normalizeCalendarWorld(document)).toThrow(`Duplicate calendar identity ${duplicate.id}.`);
    const before = structuredClone(document);
    expect(applyLifeTransaction(document, [{ type: "instinct.dismiss", instinctId: "anything", until: at }])).toMatchObject({
      status: "conflict",
      title: "Flow protected your data",
      detail: expect.stringContaining(`Duplicate identity ${duplicate.id}.`),
    });
    expect(document).toEqual(before);
  });

  it("commits capture-to-plan lineage atomically", () => {
    const result = applyLifeTransaction(emptyDocument(), passportActions());
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.document.captures[0]?.status).toBe("resolved");
    expect(result.document.plans[0]?.stepIds).toEqual(["step-documents"]);
    expect(result.document.links[0]).toMatchObject({ type: "capture-origin-of-plan", fromId: "capture-passport", toId: "plan-passport" });
    expect(validateLifeDocument(result.document)).toBeNull();
  });

  it("rolls the whole transaction back when a relationship is invalid", () => {
    const document = emptyDocument();
    const before = JSON.stringify(document);
    const actions = passportActions();
    actions.push({ type: "link.create", link: { id: "broken", type: "commitment-about-plan", fromId: "missing", toId: "plan-passport", createdAt: at } });
    expect(applyLifeTransaction(document, actions)).toMatchObject({ status: "conflict" });
    expect(JSON.stringify(document)).toBe(before);
  });

  it("schedules a plan step through the existing Calendar engine with one link", () => {
    const first = applyLifeTransaction(emptyDocument(), passportActions());
    expect(first.status).toBe("success"); if (first.status !== "success") return;
    const result = applyLifeTransaction(first.document, [{ type: "step.schedule", stepId: "step-documents", eventId: "event-documents-friday", dateKey: "2026-09-04", startMinutes: 600 }]);
    expect(result.status).toBe("success"); if (result.status !== "success") return;
    expect(result.document.steps[0]?.status).toBe("scheduled");
    expect(result.document.links.filter(({ type }) => type === "step-scheduled-as-event")).toHaveLength(1);
    expect(result.document.calendars["2026-09-04"]?.events).toContainEqual(expect.objectContaining({ id: "event-documents-friday", dateKey: "2026-09-04", start: 600 }));
    expect(validateLifeDocument(result.document)).toBeNull();
  });

  it("reschedules an existing step without duplication and preserves its event identity", () => {
    const first = applyLifeTransaction(emptyDocument(), passportActions()); if (first.status !== "success") return;
    const scheduled = applyLifeTransaction(first.document, [{ type: "step.schedule", stepId: "step-documents", eventId: "event-documents-friday", dateKey: "2026-09-04", startMinutes: 600 }]); if (scheduled.status !== "success") return;
    const moved = applyLifeTransaction(scheduled.document, [{ type: "step.schedule", stepId: "step-documents", eventId: "ignored", dateKey: "2026-09-04", startMinutes: 660 }]);
    expect(moved.status).toBe("success"); if (moved.status !== "success") return;
    expect(moved.document.calendars["2026-09-04"]?.events.filter(({ id }) => id === "event-documents-friday")).toHaveLength(1);
    expect(moved.document.calendars["2026-09-04"]?.events.find(({ id }) => id === "event-documents-friday")?.start).toBe(660);
    expect(moved.document.links.filter(({ type }) => type === "step-scheduled-as-event")).toHaveLength(1);
  });

  it("unschedules atomically while retaining the plan step", () => {
    const first = applyLifeTransaction(emptyDocument(), passportActions()); if (first.status !== "success") return;
    const scheduled = applyLifeTransaction(first.document, [{ type: "step.schedule", stepId: "step-documents", eventId: "event-documents-friday", dateKey: "2026-09-04", startMinutes: 600 }]); if (scheduled.status !== "success") return;
    const result = applyLifeTransaction(scheduled.document, [{ type: "step.unschedule", stepId: "step-documents" }]);
    expect(result.status).toBe("success"); if (result.status !== "success") return;
    expect(result.document.steps[0]?.status).toBe("planned");
    expect(result.document.links.some(({ type }) => type === "step-scheduled-as-event")).toBe(false);
    expect(Object.values(result.document.calendars).flatMap(({ events }) => events).some(({ id }) => id === "event-documents-friday")).toBe(false);
  });

  it("defers a scheduled step and its stable linked Calendar event together", () => {
    const first = applyLifeTransaction(emptyDocument(), passportActions()); if (first.status !== "success") return;
    const scheduled = applyLifeTransaction(first.document, [{ type: "step.schedule", stepId: "step-documents", eventId: "event-documents", dateKey: "2026-09-03", startMinutes: 615 }]); if (scheduled.status !== "success") return;
    const result = applyLifeTransaction(scheduled.document, [
      { type: "plan.step.update", stepId: "step-documents", patch: { status: "deferred", deferredUntil: "2026-09-07" } },
      { type: "calendar.request", confirmed: true, request: { transcript: "Defer Documents until Monday", normalized: "defer documents until monday", actions: [{ type: "defer", selector: { type: "id", id: "event-documents" }, date: { dateKey: "2026-09-07" } }], constraints: [] } },
    ]);
    expect(result.status).toBe("success"); if (result.status !== "success") return;
    expect(result.document.steps[0]).toMatchObject({ status: "deferred", deferredUntil: "2026-09-07" });
    expect(result.document.calendars["2026-09-07"]?.events).toContainEqual(expect.objectContaining({ id: "event-documents", dateKey: "2026-09-07" }));
    expect(result.document.links).toContainEqual(expect.objectContaining({ fromId: "step-documents", toId: "event-documents" }));
  });

  it("moves across days without colliding with target-day work or changing identity", () => {
    const document = emptyDocument();
    const tomorrow = createInitialTomorrowPlan("2026-09-04");
    document.calendars[tomorrow.dateKey] = tomorrow;
    const beforeIds = Object.values(document.calendars).flatMap(({ events }) => events.map(({ id }) => id));
    const result = applyLifeTransaction(document, [{
      type: "calendar.request",
      confirmed: true,
      request: {
        transcript: "Move the roadmap to tomorrow morning",
        normalized: "move the roadmap to tomorrow morning",
        actions: [{ type: "move", selector: { type: "title", query: "roadmap" }, destination: { type: "dayPart", date: { dateKey: "2026-09-04" }, part: "morning" } }],
        constraints: [],
      },
    }]);
    expect(result.status).toBe("success"); if (result.status !== "success") return;
    expect(result.document.calendars["2026-09-04"]?.events).toContainEqual(expect.objectContaining({ id: "roadmap", start: 10 * 60, end: 11 * 60 }));
    const afterIds = Object.values(result.document.calendars).flatMap(({ events }) => events.map(({ id }) => id));
    expect(new Set(afterIds)).toEqual(new Set(beforeIds));
    expect(afterIds).toHaveLength(beforeIds.length);
    expect(validateLifeDocument(result.document)).toBeNull();
  });

  it("makes normalized person creation idempotent without source mutation", () => {
    const document = emptyDocument(); const before = JSON.stringify(document);
    const person = { id: "person-maya", kind: "person" as const, name: "Maya", createdAt: at, updatedAt: at };
    const result = applyLifeTransaction(document, [{ type: "person.ensure", person }, { type: "person.ensure", person: { ...person, id: "person-maya-two", name: " maya " } }]);
    // person.ensure is deliberately idempotent by normalized name.
    expect(result.status).toBe("success");
    expect(result.status === "success" ? result.document.people : []).toHaveLength(1);
    expect(JSON.stringify(document)).toBe(before);
  });

  it("reserves Calendar time for a promise with one stable relationship", () => {
    const document = emptyDocument();
    const person = { id: "person-maya", kind: "person" as const, name: "Maya", createdAt: at, updatedAt: at };
    const commitment = { id: "commitment-proposal", kind: "commitment" as const, personId: person.id, title: "Send the proposal", direction: "i-owe" as const, status: "open" as const, createdAt: at, updatedAt: at };
    const created = applyLifeTransaction(document, [
      { type: "person.ensure", person }, { type: "commitment.create", commitment },
      { type: "commitment.schedule", commitmentId: commitment.id, eventId: "event-proposal-prep", dateKey: "2026-09-04", startMinutes: 600, durationMinutes: 30 },
    ]);
    expect(created.status).toBe("success"); if (created.status !== "success") return;
    expect(created.document.links).toContainEqual(expect.objectContaining({ type: "commitment-reserved-by-event", fromId: commitment.id, toId: "event-proposal-prep" }));
    expect(created.document.calendars["2026-09-04"]?.events).toContainEqual(expect.objectContaining({
      id: "event-proposal-prep", title: "Prepare · Send the proposal", start: 600, end: 630,
    }));
    const moved = applyLifeTransaction(created.document, [{ type: "commitment.schedule", commitmentId: commitment.id, eventId: "ignored", dateKey: "2026-09-04", startMinutes: 660, durationMinutes: 30 }]);
    expect(moved.status).toBe("success"); if (moved.status !== "success") return;
    expect(moved.document.calendars["2026-09-04"]?.events.filter(({ id }) => id === "event-proposal-prep")).toHaveLength(1);
    expect(moved.document.calendars["2026-09-04"]?.events.find(({ id }) => id === "event-proposal-prep")?.start).toBe(660);
    expect(validateLifeDocument(moved.document)).toBeNull();
  });

  it("Now returns at most three ready items that fit", () => {
    const result = applyLifeTransaction(emptyDocument(), passportActions()); if (result.status !== "success") return;
    const candidates = selectNowCandidates(result.document, new Date("2026-09-03T11:45:00"));
    expect(candidates.length).toBeLessThanOrEqual(3);
    expect(candidates.every(({ minutes }) => minutes <= 45)).toBe(true);
    expect(candidates[0]).toMatchObject({ title: "Documents", minutes: 25, source: "plan-step" });
  });

  it("reports no availability while a live Calendar event is in progress", () => {
    const document = emptyDocument();
    expect(selectNowWindow(document, new Date("2026-09-03T09:30:00"))).toEqual({
      dateKey: "2026-09-03", start: 570, end: 600, minutes: 0, nextTitle: "Deep work — project brief", currentEventId: "deep-work",
    });
    expect(selectNowCandidates(document, new Date("2026-09-03T09:30:00"))).toEqual([]);
  });

  it("truncates availability at the next protected Breathing Room", () => {
    const document = emptyDocument();
    document.calendar.breathingRooms = [{
      id: "room-focus", dateKey: document.calendar.dateKey, start: 630, end: 660,
      label: "Protected pause", protected: true, source: "user",
    }];
    expect(selectNowWindow(document, new Date("2026-09-03T10:00:00"))).toEqual({
      dateKey: "2026-09-03", start: 600, end: 630, minutes: 30, nextTitle: "Protected pause",
    });
  });

  it("recommends only the first dependency-ready step in each active plan", () => {
    const result = applyLifeTransaction(emptyDocument(), passportActions());
    expect(result.status).toBe("success"); if (result.status !== "success") return;
    const later: PlanStep = { id: "step-photos", kind: "plan-step", planId: "plan-passport", title: "Passport photos", status: "planned", estimatedMinutes: 15, createdAt: at, updatedAt: at };
    const withLater = applyLifeTransaction(result.document, [{ type: "plan.step.add", step: later }]);
    expect(withLater.status).toBe("success"); if (withLater.status !== "success") return;
    expect(selectNowCandidates(withLater.document, new Date("2026-09-03T10:00:00")).map(({ id }) => id)).toEqual(["step-documents"]);
    const completed = applyLifeTransaction(withLater.document, [{ type: "plan.step.update", stepId: "step-documents", patch: { status: "completed" } }]);
    expect(completed.status).toBe("success"); if (completed.status !== "success") return;
    expect(selectNowCandidates(completed.document, new Date("2026-09-03T10:00:00")).map(({ id }) => id)).toEqual(["step-photos"]);
  });
});
