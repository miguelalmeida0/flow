import { describe, expect, it } from "vitest";
import { interpretTranscript } from "../features/day-planner/interpretation/interpreter";
import { contextualCalendarFixture, contextualToday, contextualWeek } from "../test/contextualCalendarFixture";
import { calendarReferenceScope, calendarRequestSourceDate } from "./calendarCommandScope";
import { resolveEventReference } from "../features/day-planner/scheduling/resolution";
import { resolveGlobalCommand } from "../shared/command/globalInterpreter";
import type { CalendarAction } from "../features/day-planner/model";

const today = "2026-09-08";
describe("screenshot source references", () => {
  it("separates Wednesday from the lunch title", () => {
    expect(interpretTranscript("cancel the lunch at Wednesday", today)).toMatchObject({ status: "ready", request: { actions: [{ type: "delete", selector: { query: "lunch", date: { dateKey: "2026-09-09" } } }] } });
  });
  it("consumes from only as part of the source clock", () => {
    expect(interpretTranscript("cancel the review meeting from 11:00 a.m.", today)).toMatchObject({ status: "ready", request: { actions: [{ type: "delete", selector: { query: "review meeting", at: 660 } }] } });
  });
  it("already interprets the screenshot move", () => {
    expect(interpretTranscript("change the creative Review to 2pm", today)).toMatchObject({ status: "ready", request: { actions: [{ type: "move", selector: { query: "creative review" }, destination: { type: "absolute", minutes: 840 } }] } });
  });
});

type Sample = { text: string; type: CalendarAction["type"]; id: string; minutes?: number; mode?: string; destinationDate?: string };
const corpus: Sample[] = [
  ...[
    "Cancel the lunch at Wednesday", "Cancel lunch on Wednesday", "Remove Wednesday's lunch", "Delete my lunch from Wednesday",
    "Cancel tomorrow's lunch", "Please cancel lunch on Wednesday", "Could you delete the lunch on Wednesday?", "Actually, cancel Wednesday’s lunch.",
    "Uh, remove lunch on Wednesday", "I need you to cancel tomorrow's lunch", "Cancel lunch Wednesday", "Cancel the lunch for Wednesday",
    "Cancel lunch on 2026-09-09", "Cancel lunch on Wednesday at 12:30 pm", "Cancel Wednesday's lunch from half past twelve",
    "Remove the event starting at 12:30 pm on Wednesday", "Cancel the appointment at 12:30 pm on Wednesday",
  ].map((text) => ({ text, type: "delete" as const, id: "lunch-wed" })),
  ...[
    "Cancel Wednesday's review meeting from 11am", "Delete the review from eleven am on Wednesday", "Cancel the event starting at 11am on Wednesday",
    "Cancel the event that starts at 11am on Wednesday", "Cancel the eleven o'clock review meeting on Wednesday", "Cancel the review meeting from 11:00 a.m. on Wednesday",
    "Remove the review appointment at 11 on Wednesday", "Cancel tomorrow's email at eleven", "Delete the email review on Wednesday",
  ].map((text) => ({ text, type: "delete" as const, id: "email-wed" })),
  ...[
    "Change the creative Review to 2pm", "Please move my creative review to two p.m.", "Reschedule creative review for 14:00",
    "Move creative review from 4pm to 2pm", "Move Wednesday's creative review to 2pm", "Move creative review on Wednesday to 2pm",
    "Put Creative Review at two pm", "Can you shift Creative Review to 14:00?", "Push Creative Review back to 2pm",
    "Actually move creative review to two o'clock", "Move creative review at 16:00 to 14:00", "Move creative review from Wednesday to Thursday at 2pm",
  ].map((text) => ({ text, type: "move" as const, id: "creative-wed", minutes: 840, ...(text.includes("Thursday") ? { destinationDate: "2026-09-10" } : {}) })),
  ...[
    "Protect lunch on Wednesday", "Lock Wednesday's lunch", "Do not move lunch on Wednesday", "Keep Wednesday's lunch fixed",
    "Please protect tomorrow's lunch", "Don't touch lunch on Wednesday",
  ].map((text) => ({ text, type: "protect" as const, id: "lunch-wed" })),
  ...[
    "Release lunch on Wednesday", "Unprotect Wednesday's lunch", "Unlock lunch on Wednesday", "Let Wednesday's lunch move again",
  ].map((text) => ({ text, type: "unprotect" as const, id: "lunch-wed" })),
  ...[
    "Make email on Wednesday 20 minutes", "Make Wednesday's email twenty minutes", "Shorten email on Wednesday to 20 minutes",
    "Reduce Wednesday's email to twenty minutes", "Change Wednesday's email to 20 minutes", "Make the email from 11am on Wednesday twenty minutes",
  ].map((text) => ({ text, type: "resize" as const, id: "email-wed", minutes: 20, mode: "set" })),
  ...[
    "Extend Wednesday's email by half an hour", "Add thirty minutes to Wednesday's email", "Give email on Wednesday another half an hour",
    "Make Wednesday's email thirty minutes longer",
  ].map((text) => ({ text, type: "resize" as const, id: "email-wed", minutes: 30, mode: "add" })),
  ...[
    "Shorten Wednesday's email by fifteen minutes", "Take fifteen minutes off Wednesday's email", "Reduce email on Wednesday by 15 minutes",
  ].map((text) => ({ text, type: "resize" as const, id: "email-wed", minutes: -15, mode: "add" })),
  { text: "Move Wednesday's creative review to Friday morning", type: "defer", id: "creative-wed", destinationDate: "2026-09-11" },
  { text: "Move creative review from Wednesday to Friday", type: "defer", id: "creative-wed", destinationDate: "2026-09-11" },
  { text: "Rename Wednesday's email to Correspondence", type: "update", id: "email-wed" },
  { text: "Make Wednesday's email green", type: "update", id: "email-wed" },
];

describe("contextual utterance corpus", () => {
  it("covers at least sixty natural requests", () => expect(corpus.length).toBeGreaterThanOrEqual(60));
  it.each(corpus)("$text", ({ text, type, id, minutes, mode, destinationDate }) => {
    const fixture = contextualCalendarFixture();
    const parsed = interpretTranscript(text, today, contextualWeek.dateKey);
    expect(parsed.status).toBe("ready");
    if (parsed.status !== "ready") throw new Error(parsed.detail);
    const action = parsed.request.actions[0]!;
    expect(action.type).toBe(type);
    if (!("selector" in action)) throw new Error("Expected an existing-event operation");
    const pool = calendarReferenceScope(fixture.document, contextualWeek);
    expect(resolveEventReference(pool, action.selector, undefined, 480, false, type === "delete")).toMatchObject({ status: "resolved", events: [{ id }] });
    expect(calendarRequestSourceDate(fixture.document, contextualWeek, parsed.request)).toEqual({ dateKey: "2026-09-09" });
    if (action.type === "move") {
      expect(action.destination).toMatchObject({ type: "absolute", minutes });
      if (destinationDate) expect(action.destination).toMatchObject({ date: { dateKey: destinationDate } });
      else expect(action.destination).not.toHaveProperty("date");
    }
    if (action.type === "resize") expect(action).toMatchObject({ minutes, mode });
    if (action.type === "defer" && destinationDate) expect(action.date).toEqual({ dateKey: destinationDate });
    const global = resolveGlobalCommand(text, { route: "calendar", currentTimeScope: contextualWeek }, contextualToday, [], 1020, pool);
    expect(global.intent.type).toBe("calendar");
    expect(fixture.past).toHaveLength(0);
  });
});

describe("safe event grounding", () => {
  const pool = () => calendarReferenceScope(contextualCalendarFixture().document, contextualWeek);
  const selector = (text: string) => {
    const result = interpretTranscript(text, today, contextualWeek.dateKey);
    if (result.status !== "ready" || !("selector" in result.request.actions[0]!)) throw new Error("Expected selector");
    return result.request.actions[0].selector;
  };
  it.each(["Cancel lunch", "Cancel the review meeting from 11:00 a.m."])("clarifies repeated visible events: %s", (text) => {
    const result = resolveEventReference(pool(), selector(text), undefined, 480, false, true);
    expect(result.status).toBe("clarification");
    if (result.status !== "clarification") return;
    expect(result.choices).toHaveLength(2);
    expect(result.choices[0]?.label).toContain("Tuesday, Sep 8");
    expect(result.choices[1]?.label).toContain("Wednesday, Sep 9");
    expect(resolveGlobalCommand("the Wednesday one", { route: "calendar", pending: "clarification", pendingChoices: result.choices, currentTimeScope: contextualWeek }, today, [], 1020, pool()).intent).toMatchObject({ type: "pending-choice", choiceId: result.choices[1]?.id });
  });
  it.each(["Cancel Creative Review at 11am", "Cancel Wednesday's lunch at 11am", "Cancel lunch on 2026-02-30", "Cancel the nonexistent meeting"])("never drops contradictory or invalid qualifiers: %s", (text) => {
    expect(resolveEventReference(pool(), selector(text), undefined, 480, false, true).status).toBe("missing");
  });
  it("explicit dates can find events outside the visible range", () => {
    expect(resolveEventReference(pool(), selector("Cancel lunch on 2026-09-16"))).toMatchObject({ status: "resolved", events: [{ id: "lunch-next" }] });
  });
  it.each(["Wednesday Club", "Project 2", "Dinner at Six", '"Notes from Wednesday"', "Notes from Paris"])("preserves literal title %s", (title) => {
    const plan = pool(); plan.events = [{ ...plan.events[0]!, id: "literal", title: title.replaceAll('"', ""), start: 540, end: 600 }];
    expect(resolveEventReference(plan, selector(`Cancel ${title}`))).toMatchObject({ status: "resolved", events: [{ id: "literal" }] });
  });
  it("uses actual Tuesday for tomorrow even when viewing Monday-start week", () => {
    const fixture = contextualCalendarFixture();
    const result = resolveGlobalCommand("Move creative review to tomorrow morning", { route: "calendar", currentTimeScope: contextualWeek }, today, [], 1020, pool());
    expect(result.intent).toMatchObject({ type: "calendar", request: { actions: [{ type: "defer", date: { dateKey: "2026-09-09" } }] } });
    const scoped = calendarReferenceScope(fixture.document, { kind: "day", dateKey: "2026-09-09" });
    expect(resolveEventReference(scoped, selector("Cancel lunch"))).toMatchObject({ status: "resolved", events: [{ id: "lunch-wed" }] });
  });
});
