import { describe, expect, it } from "vitest";
import { contextualCalendarFixture, contextualClock, contextualToday, contextualWeek } from "../test/contextualCalendarFixture";
import { interpretTranscript } from "../features/day-planner/interpretation/interpreter";
import { applyLifeTransaction } from "../domain/life-transaction";
import { allCalendarEvents, allCalendarPlans } from "../domain/life-calendar-world";
import { validatePlan } from "../features/day-planner/scheduling/invariants";
import { validateLifeDocument } from "../domain/life-invariants";
import { calendarRequestSourceDate } from "./calendarCommandScope";
import type { LifeAction } from "../domain/life-actions";

function request(text: string): LifeAction {
  const parsed = interpretTranscript(text, contextualToday, contextualWeek.dateKey);
  if (parsed.status !== "ready") throw new Error(parsed.detail);
  const source = calendarRequestSourceDate(contextualCalendarFixture().document, contextualWeek, parsed.request);
  if (!("dateKey" in source)) throw new Error(source.detail);
  return { type: "calendar.request", request: parsed.request, sourceDateKey: source.dateKey };
}

describe("dated schedule transactions and invariants", () => {
  it.each([
    "Cancel lunch on Wednesday", "Move creative review on Wednesday to 2pm", "Move creative review from Wednesday to Friday at 2pm",
    "Make Wednesday's email 20 minutes", "Protect email on Wednesday", "Unprotect lunch on Wednesday", "Move Wednesday's email to Friday",
    "Move creative review to 2pm and make it 45 minutes",
    "Move creative review from Wednesday to Friday at 2pm and make it 45 minutes",
  ])("keeps IDs, dates, protection and untouched sparse future events intact: %s", (text) => {
    const before = contextualCalendarFixture().document;
    const frozenBefore = structuredClone(before);
    const action = request(text);
    const first = applyLifeTransaction(before, [action], contextualClock);
    expect(before).toEqual(frozenBefore);
    if (first.status === "confirmation") expect(allCalendarEvents(before)).toHaveLength(6);
    const result = first.status === "confirmation" && action.type === "calendar.request"
      ? applyLifeTransaction(before, [{ ...action, confirmed: first.authorizationKey }], contextualClock) : first;
    expect(result.status).toBe("success");
    if (result.status !== "success") throw new Error(result.detail);
    expect(validateLifeDocument(result.document)).toBeNull();
    for (const day of allCalendarPlans(result.document)) expect(validatePlan(day)).toBeNull();
    const beforeEvents = allCalendarEvents(before), after = allCalendarEvents(result.document);
    expect(new Set(after.map(({ id }) => id)).size).toBe(after.length);
    expect(after.map(({ id }) => id).sort()).toEqual(beforeEvents.map(({ id }) => id).filter((id) => !text.startsWith("Cancel") || id !== "lunch-wed").sort());
    expect(result.document.calendars["2026-09-16"]).toEqual(before.calendars["2026-09-16"]);
    expect(result.document.calendars["2026-09-08"]).toEqual(before.calendars["2026-09-08"]);
    if (text.includes("Friday at 2pm")) expect(after.find(({ id }) => id === "creative-wed")).toMatchObject({ dateKey: "2026-09-11", start: 840, end: text.includes("45 minutes") ? 885 : 900 });
  });
  it("rejects genuine conflicting identities instead of treating them as harmless mirrors", () => {
    const before = contextualCalendarFixture().document;
    before.calendars["2026-09-16"]!.events[0]!.id = "creative-wed";
    const copy = structuredClone(before);
    const result = applyLifeTransaction(before, [request("Cancel lunch on Wednesday")], contextualClock);
    expect(result.status).toBe("conflict"); expect(before).toEqual(copy);
  });
  it("does not partially move a protected source when a compound request collides with an anchor", () => {
    const before = contextualCalendarFixture().document;
    const action = request("Move creative review to 12:30 pm and make it 45 minutes");
    const result = applyLifeTransaction(before, [{ ...action, confirmed: true } as LifeAction], contextualClock);
    expect(result.status).not.toBe("success");
    expect(allCalendarEvents(before).find(({ id }) => id === "creative-wed")).toMatchObject({ start: 960, end: 1020 });
  });
  it.each(["fixed", "flexible"] as const)("rejects a cross-day resize into a %s destination event atomically", (kind) => {
    const before = contextualCalendarFixture().document;
    before.calendars["2026-09-11"] = { dateKey: "2026-09-11", events: [{ id: "destination", title: "Friday appointment", dateKey: "2026-09-11", start: 900, end: 960, kind, priority: "medium" }], deferred: [] };
    const copy = structuredClone(before);
    const action = request("Move creative review from Wednesday to Friday at 2pm and make it 90 minutes");
    const result = applyLifeTransaction(before, [{ ...action, confirmed: true } as LifeAction], contextualClock);
    expect(result.status).toBe("conflict");
    if (result.status !== "conflict") throw new Error("Expected the complete request to conflict");
    expect(result.detail).toContain("overlap"); expect(before).toEqual(copy);
  });
  it("rejects a cross-day resize beyond the supported day atomically", () => {
    const before = contextualCalendarFixture().document;
    const copy = structuredClone(before);
    const action = request("Move creative review from Wednesday to Friday at 8pm and make it 90 minutes");
    const result = applyLifeTransaction(before, [{ ...action, confirmed: true } as LifeAction], contextualClock);
    expect(result.status).toBe("conflict"); expect(before).toEqual(copy);
  });
  it.each([
    { kind: "fixed" as const, resize: "" }, { kind: "flexible" as const, resize: "" },
    { kind: "fixed" as const, resize: " and make it 90 minutes" }, { kind: "flexible" as const, resize: " and make it 90 minutes" },
  ])("never substitutes a later clock for an occupied explicit cross-day time: $kind / $resize", ({ kind, resize }) => {
    const before = contextualCalendarFixture().document;
    before.calendars["2026-09-11"] = { dateKey: "2026-09-11", events: [{ id: "destination", title: "Friday appointment", dateKey: "2026-09-11", start: 885, end: 930, kind, priority: "medium" }], deferred: [] };
    const copy = structuredClone(before);
    const action = request(`Move creative review from Wednesday to Friday at 2pm${resize}`);
    const preview = applyLifeTransaction(before, [action], contextualClock);
    if (preview.status === "confirmation") expect(preview.detail).not.toContain("3:30 PM");
    const result = applyLifeTransaction(before, [{ ...action, confirmed: true } as LifeAction], contextualClock);
    expect(result.status).toBe("conflict");
    if (result.status !== "conflict") throw new Error("Expected the exact requested clock to remain authoritative");
    expect(result.detail).toContain("2 PM"); expect(result.detail).toContain("Friday appointment");
    expect(before).toEqual(copy);
  });
});
