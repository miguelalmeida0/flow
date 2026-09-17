import { describe, expect, it } from "vitest";
import { createLifeDocument } from "../../domain/life-storage";
import { buildEliteHomeModel, focusWindowBefore } from "./eliteViewModel";
import { fixtureWeather } from "./weather";
import { dateKeyAfter } from "../day-planner/interpretation/temporal";

const now = new Date("2026-09-03T09:32:00");

describe("Elite whole-scene projections", () => {
  it("derives the five lenses from one selected-day snapshot", () => {
    const document = createLifeDocument("2026-09-03");
    const tomorrow = "2026-09-04";
    document.environment.weatherByDate[tomorrow] = fixtureWeather(tomorrow, now.toISOString());
    const model = buildEliteHomeModel(document, { kind: "day", dateKey: tomorrow }, now);
    expect(model.calendar.dateKey).toBe(tomorrow);
    expect(model.dateLabel).toContain("Friday");
    expect(model.events.map(({ title }) => title)).toEqual(expect.arrayContaining(["Deep work — project brief", "Lunch", "Creative Review"]));
    expect(model.focusWindow).toMatchObject({ minutes: 28, anchorTitle: "Lunch" });
    expect(model.outfit.headline).not.toBe("Forecast unavailable");
    expect(model.instincts[0]).toMatchObject({ id: "clear-focus-window", priority: 100 });
  });

  it("finds the exact usable window before a named anchor", () => {
    const document = createLifeDocument("2026-09-03");
    const plan = document.calendars["2026-09-04"]!;
    expect(focusWindowBefore(plan, "lunch", 9 * 60 + 32)).toMatchObject({
      window: { start: 12 * 60 + 2, end: 12 * 60 + 30, minutes: 28, anchorTitle: "Lunch" },
    });
  });

  it("suppresses a dismissed instinct until its cooldown expires", () => {
    const document = createLifeDocument("2026-09-03");
    document.instinctState.dismissedUntil["clear-focus-window"] = "2026-09-03T12:00:00.000Z";
    const hidden = buildEliteHomeModel(document, { kind: "day", dateKey: "2026-09-03" }, now);
    expect(hidden.instincts.some(({ id }) => id === "clear-focus-window")).toBe(false);
    const visible = buildEliteHomeModel(document, { kind: "day", dateKey: "2026-09-03" }, new Date("2026-09-03T15:00:00"));
    expect(visible.instincts.some(({ id }) => id === "clear-focus-window")).toBe(true);
  });

  it("projects every day, event, focus window, forecast, and relevant person through the full week range", () => {
    const document = createLifeDocument("2026-09-03");
    const dateKeys = Array.from({ length: 7 }, (_, index) => dateKeyAfter("2026-09-03", index));
    for (const [index, dateKey] of dateKeys.entries()) {
      document.calendars[dateKey] = {
        dateKey,
        deferred: [],
        breathingRooms: [],
        events: [{
          id: `week-event-${index}`, title: index === 6 ? "Friday planning meeting" : `Week event ${index + 1}`,
          dateKey, start: 9 * 60 + index * 5, end: 10 * 60 + index * 5,
          kind: index === 6 ? "fixed" : "flexible", priority: "medium",
        }],
      };
      document.environment.weatherByDate[dateKey] = { ...fixtureWeather(dateKey, now.toISOString()), minimumC: 8 + index, maximumC: 14 + index };
    }
    const scope = { kind: "week" as const, dateKey: dateKeys[0]!, endDateKey: dateKeys[6]! };
    const model = buildEliteHomeModel(document, scope, now);
    expect(model.dateKeys).toEqual(dateKeys);
    expect(model.calendars).toHaveLength(7);
    expect(model.events.map(({ id }) => id)).toEqual(dateKeys.map((_, index) => `week-event-${index}`));
    expect(model.focusWindows.map(({ dateKey }) => dateKey)).toEqual(dateKeys);
    expect(model.weatherRange.map(({ dateKey }) => dateKey)).toEqual(dateKeys);
    expect(model.summary).toContain("across 7 days");
    expect(model.people).toContainEqual(expect.objectContaining({ detail: "Friday planning meeting", time: expect.stringContaining("Wed") }));
  });

  it("does not repeat visible weather telemetry in Good to know and uses exposure recency in ranking", () => {
    const document = createLifeDocument("2026-09-03");
    document.environment.weatherByDate["2026-09-03"] = { ...fixtureWeather("2026-09-03", now.toISOString()), precipitationProbability: 90, uvIndex: 8 };
    document.people.push({ id: "person-maya", kind: "person", name: "Maya", createdAt: now.toISOString(), updatedAt: now.toISOString() });
    document.commitments.push({ id: "commitment-proposal", kind: "commitment", personId: "person-maya", title: "Send proposal", direction: "i-owe", status: "open", createdAt: now.toISOString(), updatedAt: now.toISOString() });
    const first = buildEliteHomeModel(document, { kind: "day", dateKey: "2026-09-03" }, now);
    expect(first.instincts.map(({ id }) => id)).not.toEqual(expect.arrayContaining(["rain", "uv", "sunset"]));
    expect(first.instincts[0]?.id).toBe("clear-focus-window");
    document.instinctState.lastShownAt["clear-focus-window"] = now.toISOString();
    const repeated = buildEliteHomeModel(document, { kind: "day", dateKey: "2026-09-03" }, now);
    expect(repeated.instincts[0]?.id).toBe("commitments");
  });
});
