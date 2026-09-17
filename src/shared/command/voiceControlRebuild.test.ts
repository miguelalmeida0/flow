import { describe, expect, it } from "vitest";
import type { LifeContext } from "../../domain/life-model";
import { createInitialPlan } from "../../features/day-planner/seed";
import { interpretTranscript } from "../../features/day-planner/parser";
import { resolveEventReference } from "../../features/day-planner/scheduling/resolution";
import { resolveGlobalCommand } from "./globalInterpreter";

const day = "2026-09-08";
const nowMs = Date.parse(`${day}T09:00:00Z`);
const calendar: LifeContext = { route: "calendar", nowMs, selected: { kind: "calendar-event", id: "email", at: nowMs } };
const journal: LifeContext = { route: "journal", topic: "journal", activeJournalEntryId: "journal-regression", voiceMode: "journal-longform", nowMs };
const plan = createInitialPlan(day);
const resolve = (text: string, context = calendar) => resolveGlobalCommand(text, context, day, [], 1020, plan).intent;

describe("September 8 exact control regressions", () => {
  it.each([
    "Maya said the words 'cancel my appointment'; that wasn't my instruction.",
    "Maya said hi.", "Maya said she would not call tomorrow.",
    "I did not tell Maya I would send the proposal by Friday.",
    "The sentence 'I am waiting for Daniel's contract confirmation' is just an example, not a request.",
    "'I need to send Miguel the proposal' is a phrase I am quoting, not a task to save.",
    "Maya said 'Do not move Deep Work'; I am only recounting what she said.",
  ])("requires outer authority, not a reported speech substring: %s", (text) => expect(resolve(text, { route: "people", nowMs })).toMatchObject({ type: "unsupported" }));
  it.each([
    ["Maya said she would call tomorrow.", { person: "Maya", title: "Call", direction: "waiting-on", dueAt: "2026-09-09T17:00:00.000Z" }],
    ["I told Maya I would send the proposal by Friday.", { person: "Maya", title: "Send the proposal", direction: "i-owe", dueAt: "2026-09-11T17:00:00.000Z" }],
    ["I am waiting for Daniel's contract confirmation.", { person: "Daniel", title: "Contract confirmation", direction: "waiting-on" }],
  ] as const)("preserves an asserted obligation: %s", (text, expected) => expect(resolve(text, { route: "people", nowMs })).toMatchObject({ type: "commitment-create", ...expected }));
  it("keeps reported speech as exact Journal content", () => expect(resolve("Maya said hi.", journal)).toEqual({ type: "journal-append", text: "Maya said hi." }));
  it.each([
    ["Make this fifteen minutes shorter", -15], ["Make this half an hour longer", 30],
  ] as const)("preserves comparative duration semantics: %s", (text, minutes) => expect(interpretTranscript(text, day)).toMatchObject({ status: "ready", request: { actions: [{ type: "resize", selector: { type: "selected" }, mode: "add", minutes }] } }));
  it("preserves raw label values and leaves the title alone", () => expect(interpretTranscript("Tag this meeting 'Board prep', and leave the title alone.", day)).toMatchObject({ status: "ready", request: { actions: [{ type: "update", selector: { type: "selected" }, patch: { addLabels: ["Board prep"] } }] } }));
  it.each(["go back to the homepage", "bring me back to the main screen", "take me back", "I want to go home"])("navigates Home globally: %s", (text) => {
    for (const route of ["home", "calendar", "journal", "plans", "people", "memories", "atmosphere", "inbox"] as const) expect(resolve(text, { ...calendar, route })).toMatchObject({ type: "navigate", route: "home" });
  });
  it.each([
    ["scroll down", "down", 0.45], ["I need to scroll down", "down", 0.45], ["scroll up", "up", 0.45], ["scroll back up", "up", 0.45], ["page down", "down", 0.85], ["go to the top", "top", 0], ["take me to the end", "bottom", 1],
  ])("uses exact viewport slots: %s", (text, direction, fraction) => expect(resolve(String(text))).toMatchObject({ type: "scroll", direction, fraction }));
  it("continues only a fresh same-viewport scroll", () => {
    expect(resolve("more", { ...calendar, lastViewportAction: { direction: "up", fraction: 0.85, route: "calendar", at: nowMs } })).toMatchObject({ type: "scroll", direction: "up", fraction: 0.85 });
    expect(resolve("more", { ...calendar, lastViewportAction: { direction: "up", fraction: 0.85, route: "journal", at: nowMs } }).type).not.toBe("scroll");
    expect(resolve("more", { ...calendar, lastViewportAction: { direction: "up", fraction: 0.85, route: "calendar", at: nowMs - 120_001 } }).type).not.toBe("scroll");
  });
  it("retains the already supported literal week route", () => expect(resolve("open calendar for the full week")).toMatchObject({ type: "navigate-temporal", route: "calendar", scope: { kind: "week" } }));
  it("uses the same configured week boundary as the visible time control", () => expect(resolve("This Week", { ...calendar, weekStartsOn: 0 })).toMatchObject({ type: "temporal", scope: { dateKey: "2026-09-06", endDateKey: "2026-09-12" } }));
  it("recognizes the specified named delivery obligation without reviving generic goal creation", () => expect(resolve("I need to send Miguel the proposal", { ...calendar, route: "home" })).toMatchObject({ type: "commitment-create", person: "Miguel", title: "Send the proposal", direction: "i-owe" }));
  it.each(["I need to renew my passport", "I need to scroll down", "help me prepare to travel", "my goal is a quieter month"])("never creates an implicit Outcome: %s", (text) => expect(resolve(text).type).not.toBe("outcome-create"));
  it.each(["delete the current journal entry", "discard this entry", "delete the journal I'm writing"])("routes Journal deletion, never Calendar: %s", (text) => expect(resolve(text, journal)).toMatchObject({ type: "journal-delete" }));
  it.each(["I'm finished", "that's all", "hold on", "bookmark this moment"])("keeps recording control out of prose: %s", (text) => expect(resolve(text, journal).type).not.toBe("journal-append"));
  it("retains already-supported Home interruption without prose", () => expect(resolve("go to homepage", journal)).toMatchObject({ type: "navigate", route: "home" }));
  it.each(["I want to go home", "I need to scroll down", "I'd like to open the calendar"])("does not dictate a complete polite global instruction: %s", (text) => {
    expect(resolve(text, journal).type).not.toBe("journal-append");
  });
  it.each(["I was thinking about going home", "Call it luck, but I felt at home"])("preserves non-instruction narrative: %s", (text) => expect(resolve(text, journal)).toEqual({ type: "journal-append", text }));
  it("retains quoted narrative exactly", () => expect(resolve("and then he told me to go home because it was late", journal)).toEqual({ type: "journal-append", text: "and then he told me to go home because it was late" }));
});

describe("source values and approximate references", () => {
  it.each([
    ["create an event called Interview Prep tomorrow at four", "Interview Prep", 960, 30],
    ["tomorrow at three add Walk Dog", "Walk Dog", 900, 30],
    ["add Investor Call at ten for thirty minutes", "Investor Call", 600, 30],
    ['Create an event called "Research and Development" tomorrow at four', "Research and Development", 960, 30],
    ['Add an event named "iPhone repair" at ten for thirty minutes', "iPhone repair", 600, 30],
  ] as const)("preserves a creation's exact source title: %s", (text, title, minutes, durationMinutes) => expect(interpretTranscript(text, day)).toMatchObject({ status: "ready", request: { actions: [{ type: "create", title, durationMinutes, destination: { type: "absolute", minutes } }] } }));
  it.each([
    "rename it to Dog Walking", "change its title to Dog Walking", "call this one Dog Walking", "make it say Dog Walking", "edit the eleven a.m. meeting name and change it to Dog Walking", "Shareholders should be called Dog Walking",
  ])("preserves first-class rename value: %s", (text) => expect(interpretTranscript(text, day)).toMatchObject({ status: "ready", request: { actions: [{ type: "update", patch: { title: "Dog Walking" } }] } }));
  it.each(["Fucking finally", "Miguel and Sarah planning", "Fixed again and move mountains", "No, Actually Fine", "Buy milk for mum"])("preserves arbitrary value untouched: %s", (title) => {
    const parsed = interpretTranscript(`rename email to ${title}`, day);
    expect(parsed).toMatchObject({ status: "ready", request: { actions: [{ type: "update", patch: { title } }] } });
    if (parsed.status === "ready") expect(parsed.request.actions).toHaveLength(1);
  });
  it("applies compatible color correction without losing action", () => expect(resolve("make it green — wait, blue")).toMatchObject({ type: "calendar", request: { actions: [{ type: "update", patch: { color: "blue" } }] } }));
  it("considers one event starting thirty minutes after the source time", () => {
    const near = { ...plan, events: [{ ...plan.events[2]!, title: "Shareholders", start: 690, end: 720 }] };
    expect(resolveEventReference(near, { type: "source", at: 660, query: "meeting" })).toMatchObject({ status: "resolved", events: [{ id: "email" }] });
  });
  it("clarifies two plausible neighbors instead of blindly taking nearest", () => {
    const near = { ...plan, events: [{ ...plan.events[2]!, start: 650, end: 660 }, { ...plan.events[3]!, start: 690, end: 720 }] };
    expect(resolveEventReference(near, { type: "source", at: 670, query: "meeting" })).toMatchObject({ status: "clarification" });
  });
});
