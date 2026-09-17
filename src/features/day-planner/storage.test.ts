import { beforeEach, describe, expect, it } from "vitest";
import { createInitialPlan } from "./seed";
import { loadPlannerState, savePlannerState } from "./storage";

describe("versioned persistence", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips current state and complete history", () => {
    const plan = createInitialPlan("2026-09-02");
    plan.events[1] = { ...plan.events[1]!, color: "red", labels: ["strategy"], importance: "critical", mobility: "heavy", protected: true };
    plan.breathingRooms = [{ id: "room", dateKey: plan.dateKey, start: 10 * 60, end: 10 * 60 + 20, protected: true, source: "user" }];
    plan.endBoundaryMinutes = 20 * 60;
    const previous = structuredClone(plan);
    savePlannerState({
      plan,
      past: [{ plan: previous, lastChange: { summary: "Changed.", detail: "Exact state.", transcript: "change", source: "voice", actions: [{ type: "update", selector: { type: "id", id: plan.events[1]!.id }, patch: { color: "red" } }], before: previous, after: plan } }],
      future: [],
    });
    const loaded = loadPlannerState("2026-09-02");
    expect(loaded?.past).toHaveLength(1);
    expect(loaded?.plan).toEqual(plan);
    expect(loaded?.past[0]?.lastChange?.source).toBe("voice");
    expect(loaded?.past[0]?.lastChange).toMatchObject({ transactionId: expect.stringMatching(/^legacy-/), timestamp: "1970-01-01T00:00:00.000Z" });
    expect(loaded?.past[0]?.lastChange?.actions?.[0]?.type).toBe("update");
    loaded!.plan.events[1]!.labels!.push("mutated");
    expect(loaded?.past[0]?.plan.events[1]?.labels).toEqual(["strategy"]);
  });

  it("rejects invalid stored overlaps safely", () => {
    const plan = createInitialPlan("2026-09-02");
    plan.events[1] = { ...plan.events[1]!, start: 460, end: 500 };
    localStorage.setItem("flow.planner.v3", JSON.stringify({ version: 3, plan, past: [], future: [] }));
    expect(loadPlannerState("2026-09-02")).toBeNull();
  });

  it("migrates valid v1 data with explicit event dates", () => {
    const plan = createInitialPlan("2026-09-02");
    const legacy = {
      dateKey: plan.dateKey,
      events: plan.events.map(({ id, title, start, end, kind, priority }) => ({ id, title, start, end, kind, priority })),
      deferred: [],
    };
    localStorage.setItem("flow.day-plan.v1", JSON.stringify(legacy));
    expect(loadPlannerState("2026-09-02")?.plan.events.every((event) => event.dateKey === "2026-09-02")).toBe(true);
  });

  it("migrates v2 plan-only history into v3 history entries", () => {
    const plan = createInitialPlan("2026-09-02");
    const previous = {
      ...plan,
      events: plan.events.map((event) => event.id === "workout" ? { ...event, start: 1050, end: 1110 } : { ...event }),
    };
    const lastChange = { summary: "Workout → 6 PM.", detail: "No protected time moved.", transcript: "Move my workout to 6" };
    localStorage.setItem("flow.planner.v2", JSON.stringify({ version: 2, plan, past: [previous], future: [], lastChange }));
    const migrated = loadPlannerState("2026-09-02");
    expect(migrated?.past[0]?.plan.events.find((event) => event.id === "workout")?.start).toBe(1050);
    expect(migrated?.lastChange).toMatchObject({ ...lastChange, transactionId: expect.stringMatching(/^legacy-/), timestamp: "1970-01-01T00:00:00.000Z" });
  });

  it("migrates v3 events into the independent v4 property model", () => {
    const plan = createInitialPlan("2026-09-02");
    const legacy = {
      ...plan,
      events: plan.events.map((event) => ({
        id: event.id, title: event.title, dateKey: event.dateKey, start: event.start, end: event.end,
        kind: event.kind, priority: event.priority,
      })),
    };
    localStorage.setItem("flow.planner.v3", JSON.stringify({ version: 3, plan: legacy, past: [], future: [] }));
    const migrated = loadPlannerState("2026-09-02");
    expect(migrated?.plan.events.find((event) => event.id === "dentist")).toMatchObject({ color: "neutral", labels: [], importance: "important", mobility: "anchored", protected: false, status: "planned" });
    expect(migrated?.plan.events.find((event) => event.id === "lunch")).toMatchObject({ mobility: "heavy", protected: true });
  });

  it("migrates linked-room direction, synchronizes buffers, and round-trips transaction metadata", () => {
    const plan = createInitialPlan("2026-09-02");
    plan.breathingRooms = [{
      id: "before-interview", dateKey: plan.dateKey, start: 15 * 60 + 40, end: 16 * 60,
      protected: true, source: "user", linkedEventId: "interview",
    }];
    localStorage.setItem("flow.planner.v4", JSON.stringify({
      version: 4, plan, past: [], future: [],
      lastChange: { transactionId: "tx-linked", timestamp: "2026-09-02T14:10:00.000Z", summary: "Room added.", detail: "Linked.", transcript: "room" },
    }));
    const migrated = loadPlannerState("2026-09-02");
    expect(migrated?.plan.breathingRooms).toEqual([expect.objectContaining({ linkedEventId: "interview", relation: "before" })]);
    expect(migrated?.plan.events.find((event) => event.id === "interview")?.bufferBeforeMinutes).toBe(20);
    expect(migrated?.lastChange).toMatchObject({ transactionId: "tx-linked", timestamp: "2026-09-02T14:10:00.000Z" });
    savePlannerState(migrated!);
    expect(loadPlannerState("2026-09-02")).toEqual(migrated);
  });
});
