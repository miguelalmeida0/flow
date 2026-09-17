import { describe, expect, it } from "vitest";
import type {
  CalendarAction, CalendarConstraint, CalendarRequest, Destination, EventSelector,
} from "./model";
import {
  interpretTranscript, normalizeTranscript, parseClockExpression,
  parseDurationExpression, splitClauses,
} from "./parser";

const today = "2026-09-02";
type Semantics = Pick<CalendarRequest, "actions" | "constraints">;
type CorpusSample = { utterance: string; expected: Semantics } | { utterance: string; error: string };

const title = (query: string): EventSelector => ({ type: "title", query });
const selected: EventSelector = { type: "selected" };
const all = (options: Omit<Extract<EventSelector, { type: "all" }>, "type"> = {}): EventSelector => ({ type: "all", ...options });
const at = (minutes: number): Destination => ({ type: "absolute", minutes });
const relative = (relation: "before" | "after", query: string): Destination => ({ type: "relative", relation, anchor: title(query) });
const move = (selector: EventSelector, destination: Destination): CalendarAction => ({ type: "move", selector, destination });
const shift = (selector: EventSelector, deltaMinutes: number): CalendarAction => ({ type: "shift", selector, deltaMinutes });
const create = (eventTitle: string, durationMinutes: number, destination: Destination): CalendarAction => ({ type: "create", title: eventTitle, durationMinutes, destination });
const fit = (eventTitle: string, durationMinutes: number, destination: Destination): CalendarAction => ({ type: "fit", title: eventTitle, durationMinutes, destination });
const resize = (selector: EventSelector, mode: "set" | "add", minutes: number): CalendarAction => ({ type: "resize", selector, mode, minutes });
const protect = (selector: EventSelector): CalendarAction => ({ type: "protect", selector });
const unprotect = (selector: EventSelector): CalendarAction => ({ type: "unprotect", selector });
const recover = (delayMinutes: number, assumedDelay = false): CalendarAction => ({ type: "recover", delayMinutes, assumedDelay });
const defer = (selector: EventSelector, date: "tomorrow" | { dateKey: string }, part?: "morning" | "afternoon"): CalendarAction => ({ type: "defer", selector, date, ...(part ? { part } : {}) });
const keep = (selector: EventSelector, minutes?: number): CalendarConstraint => ({ type: "keep", selector, ...(minutes === undefined ? {} : { at: minutes }) });
const expected = (actions: CalendarAction[], constraints: CalendarConstraint[] = []): Semantics => ({ actions, constraints });
const dayPart = (part: "morning" | "afternoon"): Destination => ({ type: "dayPart", date: "tomorrow", part });
const window = (start: number, end: number): Destination => ({ type: "window", start, end });
const nextFree: Destination = { type: "nextFree" };
const unresolved: Destination = { type: "unresolved", kind: "time" };
const source = (options: Omit<Extract<EventSelector, { type: "source" }>, "type">): EventSelector => ({ type: "source", ...options });
const lightWork: EventSelector = { type: "filter", cardinality: "many", mobility: "light" };
const breathingRoom = (durationMinutes: number, destination: Destination): CalendarAction => ({ type: "createBreathingRoom", durationMinutes, destination, label: "Breathing room", protected: true });
const reflow: CalendarAction = { type: "reflow", reason: "make-room" };

// Every row asserts the complete parsed meaning, not merely an intent label.
const corpus: CorpusSample[] = [
  { utterance: "Move my workout to 6.", expected: expected([move(title("workout"), at(1080))]) },
  { utterance: "Put the workout at six pm.", expected: expected([move(title("workout"), at(1080))]) },
  { utterance: "Reschedule deep work for 2:30.", expected: expected([move(title("deep work"), at(870))]) },
  { utterance: "Move email before lunch.", expected: expected([move(title("email"), relative("before", "lunch"))]) },
  { utterance: "Put the selected event after the interview.", expected: expected([move(selected, relative("after", "interview"))]) },
  { utterance: "Shift everything after lunch 30 minutes later.", expected: expected([shift(all({ after: title("lunch") }), 30)]) },
  { utterance: "Move all flexible work after 2.", expected: expected([move(lightWork, at(840))]) },
  { utterance: "Push the afternoon back by half an hour.", expected: expected([shift(all({ period: "afternoon" }), 30)]) },
  { utterance: "Move workout to 18:00", expected: expected([move(title("workout"), at(1080))]) },
  { utterance: "Shift the meeting twenty minutes earlier", expected: expected([shift(title("meeting"), -20)]) },
  { utterance: "Move this after lunch", expected: expected([move(selected, relative("after", "lunch"))]) },
  { utterance: "Move my workout at half past six", expected: expected([move(title("workout"), at(1110))]) },
  { utterance: "Move workout to quarter to four", expected: expected([move(title("workout"), at(945))]) },
  { utterance: "Push email 15 minutes later", expected: expected([shift(title("email"), 15)]) },
  { utterance: "reschedule roadmap to 4 PM", expected: expected([move(title("roadmap"), at(960))]) },
  { utterance: "Move flexible work after two", expected: expected([move(lightWork, at(840))]) },
  { utterance: "put interview at 5", expected: expected([move(title("interview"), at(1020))]) },
  { utterance: "Could you move deep work to 2:30 and keep lunch fixed?", expected: expected([move(title("deep work"), at(870))], [keep(title("lunch"))]) },
  { utterance: "Move my workout to 6 and protect dinner", expected: expected([move(title("workout"), at(1080)), protect(title("dinner"))]) },
  { utterance: "I need you to shift my afternoon by thirty minutes", expected: expected([shift(all({ period: "afternoon" }), 30)]) },

  { utterance: "Add a 30 minute walk at 5", expected: expected([create("walk", 30, at(1020))]) },
  { utterance: "Schedule a 25 minute break between 3 and 5", expected: expected([create("break", 25, window(900, 1020))]) },
  { utterance: "Block one hour for reading tomorrow morning", expected: expected([create("reading", 60, dayPart("morning"))]) },
  { utterance: "Create lunch at 12:30", expected: expected([create("lunch", 30, at(750))]) },
  { utterance: "Add gym tomorrow morning", expected: expected([create("gym", 30, dayPart("morning"))]) },
  { utterance: "Schedule a twenty minute break before the interview", expected: expected([create("break", 20, relative("before", "interview"))]) },
  { utterance: "Find the next free 45 minute slot for study", expected: expected([fit("study", 45, nextFree)]) },
  { utterance: "Fit a 40 minute workout before dinner", expected: expected([fit("workout", 40, relative("before", "dinner"))]) },
  { utterance: "Fit one hour client debrief in the next free slot", expected: expected([fit("client debrief", 60, nextFree)]) },
  { utterance: "Make room for a 25 minute break between 3 and 5", expected: expected([fit("break", 25, window(900, 1020))]) },
  { utterance: "Block an hour for focus at 10 am", expected: expected([create("focus", 60, at(600))]) },
  { utterance: "Add a call at 4", expected: expected([create("call", 30, at(960))]) },
  { utterance: "Create a tea break after lunch", expected: expected([create("tea break", 30, relative("after", "lunch"))]) },
  { utterance: "Schedule a walk at six oclock", expected: expected([create("walk", 30, at(1080))]) },
  { utterance: "Add reading tomorrow afternoon", expected: expected([create("reading", 30, dayPart("afternoon"))]) },
  { utterance: "Uh, can you fit a quick twenty minute walk before dinner?", expected: expected([fit("walk", 20, relative("before", "dinner"))]) },

  { utterance: "Make email 20 minutes", expected: expected([resize(title("email"), "set", 20)]) },
  { utterance: "Shorten the selected event by 15 minutes", expected: expected([resize(selected, "add", -15)]) },
  { utterance: "Extend deep work by half an hour", expected: expected([resize(title("deep work"), "add", 30)]) },
  { utterance: "Make the workout one hour long", expected: expected([resize(title("workout"), "set", 60)]) },
  { utterance: "Reduce email by twenty minutes", expected: expected([resize(title("email"), "add", -20)]) },
  { utterance: "Shorten this to 30 minutes", expected: expected([resize(selected, "set", 30)]) },
  { utterance: "Make the workout an hour", expected: expected([resize(title("workout"), "set", 60)]) },
  { utterance: "Extend roadmap by 15 minutes", expected: expected([resize(title("roadmap"), "add", 15)]) },
  { utterance: "Make lunch 45 minutes", expected: expected([resize(title("lunch"), "set", 45)]) },
  { utterance: "Reduce this by 5 minutes", expected: expected([resize(selected, "add", -5)]) },
  { utterance: "Take 15 minutes off email review", expected: expected([resize(title("email review"), "add", -15)]) },
  { utterance: "Add 15 minutes to reading session", expected: expected([resize(title("reading session"), "add", 15)]) },

  { utterance: "Protect lunch", expected: expected([protect(title("lunch"))]) },
  { utterance: "Do not move the interview", expected: expected([protect(title("interview"))], [keep(title("interview"))]) },
  { utterance: "Keep dinner at 7", expected: expected([protect(title("dinner"))], [keep(title("dinner"), 1140)]) },
  { utterance: "Make the selected event flexible again", expected: expected([unprotect(selected), { type: "update", selector: selected, patch: { mobility: "light" } }]) },
  { utterance: "Unprotect the workout", expected: expected([unprotect(title("workout"))]) },
  { utterance: "Unlock lunch", expected: expected([unprotect(title("lunch"))]) },
  { utterance: "Release the selected event", expected: expected([unprotect(selected)]) },
  { utterance: "Lock the interview", expected: expected([protect(title("interview"))]) },
  { utterance: "Fix dinner", expected: expected([protect(title("dinner"))]) },
  { utterance: "Keep lunch where it is", expected: expected([protect(title("lunch"))], [keep(title("lunch"))]) },

  { utterance: "I'm 35 minutes behind", expected: expected([recover(35)]) },
  { utterance: "I'm running half an hour late; save my afternoon", expected: expected([recover(30)]) },
  { utterance: "I lost 45 minutes. Move low priority work to tomorrow", expected: expected([recover(45), defer(all({ priority: "low" }), "tomorrow")]) },
  { utterance: "I'm late. Give me 20 minutes to breathe before the interview", expected: expected([recover(30, true), breathingRoom(20, relative("before", "interview")), reflow]) },
  { utterance: "Recover the day without moving lunch or dinner", expected: expected([recover(30, true)], [keep(title("lunch")), keep(title("dinner"))]) },
  { utterance: "Push what can move and protect my fixed appointments", expected: expected([recover(30, true), protect({ type: "filter", cardinality: "many", mobility: "anchored" })]) },
  { utterance: "Save my afternoon", expected: expected([recover(30, true)]) },
  { utterance: "I'm forty minutes behind", expected: expected([recover(40)]) },
  { utterance: "I'm running 20 minutes late", expected: expected([recover(20)]) },
  { utterance: "I lost half an hour", expected: expected([recover(30)]) },

  { utterance: "Move the roadmap to tomorrow morning", expected: expected([defer(title("roadmap"), "tomorrow", "morning")]) },
  { utterance: "Defer low priority work until tomorrow", expected: expected([defer(all({ priority: "low" }), "tomorrow")]) },
  { utterance: "Defer low priority work", expected: expected([defer(all({ priority: "low" }), "tomorrow")]) },
  { utterance: "Move email to tomorrow", expected: expected([defer(title("email"), "tomorrow")]) },
  { utterance: "Push low priority work to Friday", expected: expected([defer(all({ priority: "low" }), { dateKey: "2026-09-04" })]) },
  { utterance: "Move this to tomorrow", expected: expected([defer(selected, "tomorrow")]) },
  { utterance: "Move everything flexible after lunch to tomorrow", expected: expected([defer(all({ mobility: "light", after: title("lunch") }), "tomorrow")]) },
  { utterance: "Cancel the dentist appointment", expected: expected([{ type: "delete", selector: title("dentist appointment") }]) },
  { utterance: "Delete the selected event", expected: expected([{ type: "delete", selector: selected }]) },
  { utterance: "Remove workout", expected: expected([{ type: "delete", selector: title("workout") }]) },
  { utterance: "Defer roadmap until Monday", expected: expected([defer(title("roadmap"), { dateKey: "2026-09-07" })]) },

  { utterance: "Undo", expected: expected([{ type: "undo" }]) },
  { utterance: "Undo that", expected: expected([{ type: "undo" }]) },
  { utterance: "Redo", expected: expected([{ type: "redo" }]) },
  { utterance: "What changed?", expected: expected([{ type: "whatChanged" }]) },
  { utterance: "Start over", expected: expected([{ type: "reset" }]) },
  { utterance: "Never mind", expected: expected([{ type: "cancel" }]) },
  { utterance: "Confirm", expected: expected([{ type: "confirm" }]) },

  { utterance: "Move flexible work after 2, protect lunch, and fit 40 minutes of exercise before dinner", expected: expected([move(lightWork, at(840)), protect(title("lunch")), fit("exercise", 40, relative("before", "dinner"))]) },
  { utterance: "I'm 35 minutes behind, keep dinner at 7 and move the roadmap to tomorrow", expected: expected([recover(35), defer(title("roadmap"), "tomorrow")], [keep(title("dinner"), 1140)]) },
  { utterance: "Move the roadmap tomorrow, but please don't touch the interview", expected: expected([defer(title("roadmap"), "tomorrow")], [keep(title("interview"))]) },
  { utterance: "Keep dinner where it is and make room for a break", expected: expected([fit("break", 30, nextFree)], [keep(title("dinner"))]) },

  { utterance: "Put workout at 25", error: "That time is outside a valid 24-hour clock." },
  { utterance: "Shorten dentist", error: "How long should that event be?" },
  { utterance: "Dance around the calendar", error: "I couldn't resolve an action from “dance around the calendar”." },
  { utterance: "Add a walk", error: "When should I schedule it?" },
];

describe("natural-language semantic corpus", () => {
  it(`covers ${corpus.length} table-driven utterances with complete outcomes`, () => {
    expect(corpus.length).toBeGreaterThanOrEqual(80);
    for (const sample of corpus) {
      const result = interpretTranscript(sample.utterance, today);
      if ("error" in sample) {
        expect(result.status, sample.utterance).toBe("unsupported");
        if (result.status === "unsupported") expect(result.detail, sample.utterance).toBe(sample.error);
        continue;
      }
      expect(result.status, sample.utterance).toBe("ready");
      if (result.status !== "ready") continue;
      expect(
        { actions: result.request.actions, constraints: result.request.constraints },
        sample.utterance,
      ).toEqual(sample.expected);
      expect(result.request.transcript, sample.utterance).toBe(sample.utterance.trim());
    }
  });

  it("preserves compound actions and negative constraints", () => {
    const result = interpretTranscript("I'm 35 minutes behind, keep dinner at 7, move low priority work to tomorrow, and give me 20 minutes before the interview.", today);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.request.actions.map((action) => action.type)).toEqual(["recover", "defer", "createBreathingRoom", "reflow"]);
    expect(result.request.constraints).toHaveLength(1);
    expect(result.request.constraints[0]).toMatchObject({ type: "keep", at: 19 * 60 });
  });
});

const changeVariants: { utterance: string; action: CalendarAction; extraActions?: CalendarAction[]; constraints?: CalendarConstraint[] }[] = [
  { utterance: "change my 2:00 p.m. meeting to another time", action: move(source({ at: 840, query: "meeting" }), unresolved) },
  { utterance: "Change my 2 PM appointment to a different time", action: move(source({ at: 840, query: "appointment" }), unresolved) },
  { utterance: "change the two pm event to another slot", action: move(source({ at: 840, query: "event" }), unresolved) },
  { utterance: "Please change my 2 p.m. meeting to a new time.", action: move(source({ at: 840, query: "meeting" }), unresolved) },
  { utterance: "move my 2 pm meeting to another time", action: move(source({ at: 840, query: "meeting" }), unresolved) },
  { utterance: "reschedule my 2 pm appointment to a different slot", action: move(source({ at: 840, query: "appointment" }), unresolved) },
  { utterance: "move the meeting at 2 pm somewhere else", action: move(source({ at: 840, query: "meeting" }), unresolved) },
  { utterance: "change my afternoon meeting to another time", action: move(source({ period: "afternoon", query: "meeting" }), unresolved) },
  { utterance: "change my evening appointment to another slot", action: move(source({ period: "evening", query: "appointment" }), unresolved) },
  { utterance: "change this to another time", action: move(selected, unresolved) },
  { utterance: "change the selected event to a different slot", action: move(selected, unresolved) },
  { utterance: "change my fourteen hundred meeting to another time", action: move(source({ at: 840, query: "meeting" }), unresolved) },
  { utterance: "change my 14:00 meeting to another time", action: move(source({ at: 840, query: "meeting" }), unresolved) },
  { utterance: "change my two oclock appointment to another time", action: move(source({ at: 840, query: "appointment" }), unresolved) },
  { utterance: "change the planning meeting at 2 pm to another time", action: move(source({ at: 840, query: "planning meeting" }), unresolved) },
  { utterance: "change the roadmap meeting at 2 pm to another slot", action: move(source({ at: 840, query: "roadmap meeting" }), unresolved) },
  { utterance: "Could you please change my 2 PM meeting to another time?", action: move(source({ at: 840, query: "meeting" }), unresolved) },
  { utterance: "Actually, change my 2 PM meeting to another time", action: move(source({ at: 840, query: "meeting" }), unresolved) },
  { utterance: "I need to change my 2 PM meeting to another time", action: move(source({ at: 840, query: "meeting" }), unresolved) },
  { utterance: "CHANGE MY 2:00 P.M. CALENDAR EVENT TO ANOTHER TIME!", action: move(source({ at: 840, query: "calendar event" }), unresolved) },
  { utterance: "change my 2 pm meeting to four", action: move(source({ at: 840, query: "meeting" }), at(960)) },
  { utterance: "change the meeting at 2 pm to half past three", action: move(source({ at: 840, query: "meeting" }), at(930)) },
  { utterance: "change the selected event to flexible", action: unprotect(selected), extraActions: [{ type: "update", selector: selected, patch: { mobility: "light" } }] },
  { utterance: "change dinner to protected", action: protect(title("dinner")) },
  { utterance: "change email to twenty minutes", action: resize(title("email"), "set", 20) },
  { utterance: "change my 2 pm meeting to another time and keep lunch fixed", action: move(source({ at: 840, query: "meeting" }), unresolved), constraints: [keep(title("lunch"))] },
  { utterance: "change my 2 pm meeting to another time while you do not move dinner", action: move(source({ at: 840, query: "meeting" }), unresolved), constraints: [keep(title("dinner"))] },
  { utterance: "change the meeting at 2 pm to 4 pm", action: move(source({ at: 840, query: "meeting" }), at(960)) },
  { utterance: "reschedule the meeting at two pm to quarter to four", action: move(source({ at: 840, query: "meeting" }), at(945)) },
  { utterance: "change the meeting at 2 pm", action: move(source({ at: 840, query: "meeting" }), unresolved) },
  { utterance: "reschedule the meeting at 2 pm", action: move(source({ at: 840, query: "meeting" }), unresolved) },
  { utterance: "move the meeting at 2 pm", action: move(source({ at: 840, query: "meeting" }), unresolved) },
  { utterance: "shift the appointment at 2 pm", action: move(source({ at: 840, query: "appointment" }), unresolved) },
  { utterance: "reschedule roadmap", action: move(title("roadmap"), unresolved) },
  { utterance: "change my meeting to another time", action: move(title("meeting"), unresolved) },
];

describe("contextual change requests", () => {
  it.each(changeVariants)("interprets $utterance", ({ utterance, action, extraActions = [], constraints = [] }) => {
    const result = interpretTranscript(utterance, today);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.request.transcript).toBe(utterance);
    expect(result.request.actions).toEqual([action, ...extraActions]);
    expect(result.request.constraints).toEqual(constraints);
  });

  it("separates numeric source and destination spans explicitly", () => {
    const result = interpretTranscript("change the meeting at 2 pm to 4 pm", today);
    expect(result).toMatchObject({
      status: "ready",
      request: {
        actions: [{
          type: "move",
          selector: { type: "source", at: 14 * 60, query: "meeting" },
          destination: { type: "absolute", minutes: 16 * 60 },
        }],
      },
    });
  });
});

const boundaryNounVariants: { utterance: string; action: CalendarAction }[] = [
  { utterance: "move my deep work meeting to 3:00 p.m.", action: move(title("deep work meeting"), at(900)) },
  { utterance: "move the meeting deep work to three pm", action: move(title("meeting deep work"), at(900)) },
  { utterance: "reschedule deep work appointment to 3", action: move(title("deep work appointment"), at(900)) },
  { utterance: "reschedule appointment deep work to 3", action: move(title("appointment deep work"), at(900)) },
  { utterance: "move deep work task to 3", action: move(title("deep work task"), at(900)) },
  { utterance: "move task deep work to 3", action: move(title("task deep work"), at(900)) },
  { utterance: "move deep work event to 3", action: move(title("deep work event"), at(900)) },
  { utterance: "move event deep work to 3", action: move(title("event deep work"), at(900)) },
  { utterance: "move deep work block to 3", action: move(title("deep work block"), at(900)) },
  { utterance: "move block deep work to 3", action: move(title("block deep work"), at(900)) },
  { utterance: "protect deep work meeting", action: protect(title("deep work meeting")) },
  { utterance: "cancel deep work appointment", action: { type: "delete", selector: title("deep work appointment") } },
  { utterance: "make deep work task 20 minutes", action: resize(title("deep work task"), "set", 20) },
  { utterance: "shift deep work event 30 minutes later", action: shift(title("deep work event"), 30) },
  { utterance: "move deep work meeting at 9 to 3", action: move(source({ at: 540, query: "deep work meeting" }), at(900)) },
  { utterance: "protect product meeting", action: protect(title("product meeting")) },
  { utterance: "cancel dentist appointment", action: { type: "delete", selector: title("dentist appointment") } },
  { utterance: "protect planning block", action: protect(title("planning block")) },
  { utterance: "move client call to 3", action: move(title("client call"), at(900)) },
  { utterance: "move call to 3", action: move(title("call"), at(900)) },
  { utterance: "move meeting to 3", action: move(title("meeting"), at(900)) },
  { utterance: "move quarterly meeting to 3", action: move(title("quarterly meeting"), at(900)) },
  { utterance: "move deep work meeting to 8:00 p.m.", action: move(title("deep work meeting"), at(1200)) },
  { utterance: "move deep work meeting to 8:00 p. m.", action: move(title("deep work meeting"), at(1200)) },
  { utterance: "move deep work meeting to 8:00 a.m.", action: move(title("deep work meeting"), at(480)) },
  { utterance: "move deep work meeting to 8:00 a. m.", action: move(title("deep work meeting"), at(480)) },
  { utterance: "schedule a 30 minute product meeting at 5", action: create("product meeting", 30, at(1020)) },
  { utterance: "add a 30 minute planning block at 5", action: create("planning block", 30, at(1020)) },
];

describe("boundary generic noun semantics", () => {
  it.each(boundaryNounVariants)("preserves the descriptive reference in $utterance", ({ utterance, action }) => {
    const result = interpretTranscript(utterance, today);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.request.actions).toEqual([action]);
    expect(result.request.transcript).toBe(utterance);
  });
});

describe("parsing primitives", () => {
  it("normalizes filler without changing the source transcript", () => {
    expect(normalizeTranscript("Uh, CAN you please move my workout to SIX? ")).toBe("move my workout to six");
  });
  it("canonicalizes dictated meridiem punctuation before clause splitting", () => {
    const normalized = normalizeTranscript("Change my 2:00 p.m. meeting to another time.");
    expect(normalized).toBe("change my 2:00 pm meeting to another time");
    expect(splitClauses(normalized)).toEqual(["change my 2:00 pm meeting to another time"]);
    expect(normalizeTranscript("change my 2 p.m meeting")).toBe("change my 2 pm meeting");
    expect(normalizeTranscript("change my 2 p. m. meeting")).toBe("change my 2 pm meeting");
    expect(normalizeTranscript("make a memory from this")).toBe("make a memory from this");
  });
  it("splits actions but preserves duration and window conjunctions", () => {
    expect(splitClauses("block one hour and fifteen minutes between 3 and 5 and protect lunch")).toEqual([
      "block one hour and fifteen minutes between 3 and 5", "protect lunch",
    ]);
    expect(splitClauses("move deep work before lunch while keeping lunch fixed")).toEqual([
      "move deep work before lunch", "keep lunch fixed",
    ]);
  });
  it("parses clocks and duration words", () => {
    expect(parseClockExpression("half past six")).toEqual({ status: "found", minutes: 18 * 60 + 30 });
    expect(parseClockExpression("six oclock")).toEqual({ status: "found", minutes: 18 * 60 });
    expect(parseClockExpression("18:00")).toEqual({ status: "found", minutes: 18 * 60 });
    expect(parseClockExpression("25")).toEqual({ status: "invalid" });
    expect(parseDurationExpression("one hour and fifteen minutes")).toBe(75);
  });

  it("treats an article plus one as one unit instead of summing both", () => {
    expect(parseDurationExpression("a one hour reading block")).toBe(60);
    expect(parseDurationExpression("an one hour block")).toBe(60);
    const result = interpretTranscript("Add a one hour reading block tomorrow afternoon", today);
    expect(result.status).toBe("ready");
    if (result.status === "ready") expect(result.request.actions[0]).toMatchObject({ type: "create", durationMinutes: 60, destination: { type: "dayPart", date: "tomorrow", part: "afternoon" } });
  });
});
