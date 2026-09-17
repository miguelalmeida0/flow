import { describe, expect, it } from "vitest";
import { interpretGlobalCommand, rankGlobalTranscript, resolveGlobalCommand, type GlobalIntent } from "./globalInterpreter";
import type { LifeContext, LifeRoute, PlanStep } from "../../domain/life-model";
import { createInitialLifePlan } from "../../features/day-planner/seed";

const dateKey = "2026-09-03";
const thursday = "2026-09-10";
const friday = "2026-09-04";
const monday = "2026-09-07";
const contexts: Record<"home" | "calendar" | "inbox" | "plans", LifeContext> = {
  home: { route: "home" },
  calendar: { route: "calendar" },
  inbox: { route: "inbox", focusedEntityId: "capture-passport" },
  plans: { route: "plans", activePlanId: "plan-senegal", focusedEntityId: "step-documents" },
};
const knownSteps: Array<Pick<PlanStep, "id" | "planId" | "title">> = [
  { id: "step-documents", planId: "plan-senegal", title: "Documents" },
  { id: "step-photos", planId: "plan-senegal", title: "Photos" },
];

type ExpectedIntent = { type: GlobalIntent["type"] } & Record<string, unknown>;
type CorpusRow = [utterance: string, context: keyof typeof contexts, expected: ExpectedIntent];

const corpus: CorpusRow[] = [
  ["Home", "home", { type: "navigate", route: "home" }],
  ["Go home", "home", { type: "navigate", route: "home" }],
  ["Calendar", "home", { type: "navigate", route: "calendar" }],
  ["Open Today", "home", { type: "navigate", route: "calendar" }],
  ["See full day", "home", { type: "navigate", route: "calendar" }],
  ["Today", "home", { type: "temporal" }],
  ["Show me my calendar", "home", { type: "navigate", route: "calendar" }],
  ["Inbox", "home", { type: "navigate", route: "inbox" }],
  ["Open my inbox", "home", { type: "navigate", route: "inbox" }],
  ["Plans", "home", { type: "navigate", route: "plans" }],
  ["People", "home", { type: "navigate", route: "people" }],
  ["Now", "home", { type: "navigate", route: "now" }],
  ["Take me to Now", "home", { type: "navigate", route: "now" }],
  ["Go back", "home", { type: "navigate", route: "back" }],
  ["Open Senegal plan", "home", { type: "navigate-plan", query: "senegal" }],
  ["Open the passport plan", "home", { type: "navigate-plan", query: "passport" }],
  ["Show me the travel plan", "home", { type: "navigate-plan", query: "travel" }],
  ["Undo", "home", { type: "history", direction: "undo" }],
  ["Undo that", "home", { type: "history", direction: "undo" }],
  ["Redo", "home", { type: "history", direction: "redo" }],
  ["Redo that", "home", { type: "history", direction: "redo" }],
  ["What changed?", "home", { type: "what-changed" }],
  ["Flow sleep", "home", { type: "session", mode: "sleep" }],
  ["Stop listening", "home", { type: "session", mode: "sleep" }],
  ["Start Flow Live", "home", { type: "session", mode: "start" }],
  ["Flow Live", "home", { type: "session", mode: "start" }],
  ["Show the meeting at two", "home", { type: "calendar-inspect", selector: { type: "source", at: 840, query: "meeting" } }],
  ["Open the two PM meeting", "home", { type: "calendar-inspect", selector: { type: "source", at: 840, query: "meeting" } }],
  ["What fits right now?", "home", { type: "query-now", excluded: [] }],
  ["What can I do now?", "home", { type: "query-now", excluded: [] }],
  ["What am I forgetting?", "home", { type: "query-now", excluded: [] }],
  ["Please, what am I forgetting?", "calendar", { type: "query-now", excluded: [] }],
  ["Actually, what am I forgetting?", "inbox", { type: "query-now", excluded: [] }],
  ["WHAT AM I FORGETTING?", "plans", { type: "query-now", excluded: [] }],
  ["What fits before the next meeting?", "home", { type: "query-now", excluded: [] }],
  ["Something under 20 minutes", "home", { type: "query-now", excluded: [], maxMinutes: 19 }],
  ["Nothing administrative", "home", { type: "query-now", excluded: ["admin", "email", "documents"] }],
  ["No calls", "home", { type: "query-now", excluded: ["call"] }],
  ["Why these?", "home", { type: "why-now" }],
  ["Why these recommendations?", "home", { type: "why-now" }],
  ["Keep the time free", "home", { type: "keep-free" }],
  ["I have twenty-five minutes—what fits?", "home", { type: "query-now", excluded: [], maxMinutes: 25 }],
  ["Leave the time free", "home", { type: "keep-free" }],
  ["Renew passport before Senegal", "home", { type: "unsupported" }],
  ["Create an outcome called Renew passport before Senegal", "home", { type: "outcome-create", title: "Renew passport before Senegal" }],
  ["Capture renew passport before Senegal", "home", { type: "capture-create", title: "renew passport before Senegal" }],
  ["Remember to renew my passport", "home", { type: "capture-create", title: "renew my passport" }],
  ["Add to Inbox: renew passport", "home", { type: "capture-create", title: "renew passport" }],
  ["Jot down visa photos", "home", { type: "capture-create", title: "visa photos" }],
  ["Uh, I need to renew my passport", "home", { type: "unsupported" }],
  ["Buy travel adapters", "inbox", { type: "unsupported" }],
  ["Check passport expiry", "inbox", { type: "unsupported" }],
  ["Turn that into a plan", "inbox", { type: "capture-convert" }],
  ["Turn the passport item into an outcome", "inbox", { type: "capture-convert", query: "passport" }],
  ["Make this a plan", "inbox", { type: "capture-convert" }],
  ["Turn latest capture into plan", "inbox", { type: "capture-convert" }],
  ["Create plan from passport note", "inbox", { type: "capture-convert", query: "passport" }],
  ["Plan selected capture", "inbox", { type: "capture-convert" }],
  ["Convert passport capture into a plan", "inbox", { type: "capture-convert", query: "passport" }],
  ["Turn this capture into a 30 minute event tomorrow at nine", "inbox", { type: "capture-convert-event", scheduleText: "tomorrow at nine", durationMinutes: 30 }],
  ["Turn this capture into a waiting on commitment with Daniel", "inbox", { type: "capture-convert-commitment", person: "Daniel", direction: "waiting-on" }],
  ["Rename this plan to Senegal preparation", "plans", { type: "plan-rename", title: "Senegal preparation" }],
  ["Add a Documents step", "plans", { type: "step-add", title: "Documents", minutes: 25 }],
  ["Add a 25 minute Photos step", "plans", { type: "step-add", title: "Photos", minutes: 25 }],
  ["Mark Documents complete", "plans", { type: "step-complete", query: "Documents" }],
  ["Finish Documents", "plans", { type: "step-complete", query: "Documents" }],
  ["Add Book appointment after Documents", "plans", { type: "step-add", title: "Book appointment", afterQuery: "Documents" }],
  ["Finish this step", "plans", { type: "step-complete", query: "this" }],
  ["Rename Documents to Gather documents", "plans", { type: "step-rename", query: "Documents", title: "Gather documents" }],
  ["Reopen Documents", "plans", { type: "step-complete", query: "documents", reopen: true }],
  ["Move Photos before Documents", "plans", { type: "step-reorder", query: "Photos", beforeQuery: "Documents" }],
  ["Defer Photos until Monday", "plans", { type: "step-defer", query: "Photos", dateKey: monday }],
  ["Unschedule Documents", "plans", { type: "step-unschedule", query: "Documents" }],
  ["Schedule Documents Friday at ten", "plans", { type: "step-schedule", query: "Documents", dateKey: friday, minutes: 600, protect: false }],
  ["Put Documents on Friday at 10 AM", "plans", { type: "step-schedule", query: "Documents", dateKey: friday, minutes: 600, protect: false }],
  ["Add Documents to calendar Friday at ten", "plans", { type: "step-schedule", query: "Documents", dateKey: friday, minutes: 600, protect: false }],
  ["Move scheduled Documents to Friday at eleven", "plans", { type: "step-schedule", query: "Documents", dateKey: friday, minutes: 660, protect: false }],
  ["Schedule this step Friday morning at ten", "plans", { type: "step-schedule", query: "this", dateKey: friday, minutes: 600, protect: false }],
  ["Add a 25 minute Photos step and schedule it after lunch", "plans", { type: "step-add-schedule", title: "Photos", minutes: 25, anchorQuery: "lunch" }],
  ["Schedule Documents Friday at ten and protect it", "plans", { type: "step-schedule", query: "Documents", dateKey: friday, minutes: 600, protect: true }],
  ["Pause this plan", "plans", { type: "plan-status", status: "paused" }],
  ["Complete this plan", "plans", { type: "plan-status", status: "completed" }],
  ["Complete Senegal plan", "plans", { type: "plan-status", status: "completed", query: "senegal" }],
  ["I promised Maya I'd send the proposal by Friday", "home", { type: "commitment-create", person: "Maya", title: "Send the proposal", direction: "i-owe", status: "open", dueAt: `${friday}T17:00:00.000Z` }],
  ["I promised Maya I’d send the proposal by Friday", "home", { type: "commitment-create", person: "Maya", title: "Send the proposal", direction: "i-owe", status: "open", dueAt: `${friday}T17:00:00.000Z` }],
  ["I told Maya I would send the proposal by Friday", "home", { type: "commitment-create", person: "Maya", title: "Send the proposal", direction: "i-owe", status: "open", dueAt: `${friday}T17:00:00.000Z` }],
  ["I owe Maya proposal by Friday", "home", { type: "commitment-create", person: "Maya", title: "Proposal", direction: "i-owe", status: "open", dueAt: `${friday}T17:00:00.000Z` }],
  ["I owe Daniel a clear answer about the budget draft no later than Thursday", "home", { type: "commitment-create", person: "Daniel", title: "A clear answer about the budget draft", direction: "i-owe", status: "open", dueAt: `${thursday}T17:00:00.000Z` }],
  ["Maya promised she'd send photos by Monday", "home", { type: "commitment-create", person: "Maya", title: "Send photos", direction: "waiting-on", status: "open", dueAt: `${monday}T17:00:00.000Z` }],
  ["Maya said she would call tomorrow", "home", { type: "commitment-create", person: "Maya", title: "Call", direction: "waiting-on", status: "open", dueAt: `${friday}T17:00:00.000Z` }],
  ["Waiting on Maya for signed proposal", "home", { type: "commitment-create", person: "Maya", title: "Signed proposal", direction: "waiting-on", status: "open" }],
  ["Add a promise to Maya to send draft tomorrow", "home", { type: "commitment-create", person: "Maya", title: "Send draft", direction: "i-owe", status: "open", dueAt: `${friday}T17:00:00.000Z` }],
  ["Mark proposal promise to Maya done", "home", { type: "commitment-complete", query: "proposal", person: "Maya" }],
  ["Delete proposal promise to Maya", "home", { type: "commitment-delete", query: "proposal", person: "Maya" }],
  ["Confirm", "home", { type: "confirm" }],
  ["Cancel", "home", { type: "cancel" }],
  ["Link Maya promise to Senegal plan", "home", { type: "commitment-link-plan", person: "Maya", planQuery: "Senegal" }],
  ["Move proposal deadline to Monday", "home", { type: "commitment-due", query: "proposal", dueAt: `${monday}T17:00:00.000Z` }],
  ["Reserve 30 minutes for the proposal promise to Maya Friday at ten", "home", { type: "commitment-schedule", person: "Maya", query: "proposal", dateKey: friday, minutes: 600, durationMinutes: 30 }],
  ["Find time for the proposal promise to Maya", "home", { type: "commitment-find-time", person: "Maya", query: "proposal" }],
  ["Schedule Documents", "plans", { type: "clarification", title: "When should I schedule Documents?" }],
  ["Add renew passport", "home", { type: "clarification", title: "Should I capture that in Inbox or schedule it?" }],
  ["Maya by Friday", "home", { type: "clarification", title: "What did you promise Maya?" }],
  ["Add a 30 minute product meeting at 10", "calendar", { type: "calendar", request: { actions: [{ type: "create", title: "product meeting", durationMinutes: 30, destination: { type: "absolute", minutes: 600 } }] } }],
  ["Push customer research back to six pm", "calendar", { type: "calendar", request: { actions: [{ type: "move", selector: { type: "title", query: "customer research" }, destination: { type: "absolute", minutes: 1080 } }] } }],
  ["Give mentor call another 15 minutes", "calendar", { type: "calendar", request: { actions: [{ type: "resize", selector: { type: "title", query: "mentor call" }, mode: "add", minutes: 15 }] } }],
  ["Take 15 minutes off email review", "calendar", { type: "calendar", request: { actions: [{ type: "resize", selector: { type: "title", query: "email review" }, mode: "add", minutes: -15 }] } }],
  ["Add 15 minutes to reading session", "calendar", { type: "calendar", request: { actions: [{ type: "resize", selector: { type: "title", query: "reading session" }, mode: "add", minutes: 15 }] } }],
  ["Schedule a 30 minute product meeting Friday at ten", "calendar", { type: "calendar", request: { actions: [{ type: "create", title: "product meeting", durationMinutes: 30, destination: { type: "absolute", minutes: 600, date: { dateKey: friday } } }] } }],
  ["Add a 30 minute hiring meeting at 3", "calendar", { type: "calendar", request: { actions: [{ type: "create", title: "hiring meeting", durationMinutes: 30, destination: { type: "absolute", minutes: 900 } }] } }],
  ["Put workout at 25", "calendar", { type: "unsupported", title: "Nothing changed", detail: "That time is outside a valid 24-hour clock." }],
  ["Start roadmap", "calendar", { type: "calendar", request: { actions: [{ type: "update", patch: { status: "active" } }] } }],
  ["Reopen strategy review", "calendar", { type: "calendar", request: { actions: [{ type: "reopen" }] } }],
  ["Make the 2 PM meeting important and red, give me 20 minutes before it, and move anything flexible out of the way", "calendar", { type: "calendar", request: { actions: [{ type: "update" }, { type: "createBreathingRoom" }, { type: "reflow" }] } }],
  ["Split deep work into two 45-minute sessions and keep one before lunch", "calendar", { type: "calendar", request: { actions: [{ type: "split" }, { type: "move" }] } }],
  ["I'm done at six today", "calendar", { type: "calendar", request: { actions: [{ type: "setDayBoundary" }, { type: "reflow" }] } }],
  ["Batch all three admin tasks", "calendar", { type: "calendar", request: { actions: [{ type: "merge", expectedCount: 3 }] } }],
];

describe("global living-environment language corpus", () => {
  it.each(corpus)("preserves the semantics of %s", (utterance, contextName, expected) => {
    expect(interpretGlobalCommand(utterance, contexts[contextName], dateKey, knownSteps)).toMatchObject(expected);
  });

  it("exposes the Calendar resize candidate for duration-first subtraction", () => {
    const resolution = resolveGlobalCommand("Take 15 minutes off email review", contexts.calendar, dateKey);
    expect(resolution.candidates).toEqual(expect.arrayContaining([expect.objectContaining({ definitionId: "calendar.resize", score: 96 })]));
    expect(resolution).toMatchObject({
      intent: { type: "calendar" },
      selected: { definitionId: "calendar.resize" },
    });
  });

  it("starts focus from the Focus space and only extends when the user says more", () => {
    const focusContext: LifeContext = { route: "focus", topic: "focus" };
    expect(interpretGlobalCommand("Give me five minutes", focusContext, dateKey, knownSteps)).toMatchObject({ type: "focus-request", minutes: 5 });
    expect(interpretGlobalCommand("Give me five more minutes", focusContext, dateKey, knownSteps)).toMatchObject({ type: "focus-extend", minutes: 5 });
    expect(interpretGlobalCommand("Add ten minutes", focusContext, dateKey, knownSteps)).toMatchObject({ type: "focus-extend", minutes: 10 });
  });

  it("keeps the exact Studio restore control out of browser-history navigation", () => {
    const journalContext: LifeContext = { route: "home", topic: "workspace", previousRoute: "journal" };
    const resolution = resolveGlobalCommand("Go back to what I was doing", journalContext, dateKey);
    expect(resolution).toMatchObject({
      intent: { type: "workspace", operation: "restore" },
      selected: { definitionId: "studio.workspace", domain: "workspace" },
    });
    expect(resolution.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ definitionId: "studio.workspace" }),
    ]));
    expect(resolution.candidates).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ definitionId: "navigation.back" }),
    ]));
  });

  it.each([["Previous day", "2026-09-04"], ["Next day", "2026-09-06"], ["Show previous day", "2026-09-04"], ["Open next day", "2026-09-06"]])("speaks the current-scope date control: %s", (utterance, expectedDate) => {
    const context: LifeContext = { route: "home", nowMs: new Date("2026-09-03T09:00:00").getTime(), currentTimeScope: { kind: "day", dateKey: "2026-09-05" } };
    expect(interpretGlobalCommand(utterance, context, "2026-09-05")).toMatchObject({ type: "temporal", scope: { kind: "day", dateKey: expectedDate } });
  });
});

const navigationCorpus: Array<{ utterance: string; route: LifeRoute | "back" }> = [
  { utterance: "Home", route: "home" }, { utterance: "Go home", route: "home" }, { utterance: "Open home", route: "home" },
  { utterance: "Show home", route: "home" }, { utterance: "Take me home", route: "home" }, { utterance: "Back home", route: "home" },
  { utterance: "Calendar", route: "calendar" }, { utterance: "Open the calendar", route: "calendar" }, { utterance: "Open calendar", route: "calendar" },
  { utterance: "Show my calendar", route: "calendar" }, { utterance: "Go to the calendar", route: "calendar" }, { utterance: "Take me to calendar", route: "calendar" },
  { utterance: "Inbox", route: "inbox" }, { utterance: "Open the inbox", route: "inbox" }, { utterance: "Open inbox", route: "inbox" },
  { utterance: "Show me my inbox", route: "inbox" }, { utterance: "Go to inbox", route: "inbox" }, { utterance: "Take me to the inbox", route: "inbox" },
  { utterance: "Plans", route: "plans" }, { utterance: "Open my plans", route: "plans" }, { utterance: "Open the plans container", route: "plans" },
  { utterance: "Show me the plans", route: "plans" }, { utterance: "Go to plans", route: "plans" }, { utterance: "Take me to the plans", route: "plans" },
  { utterance: "People", route: "people" }, { utterance: "Open people", route: "people" }, { utterance: "Show me my people", route: "people" },
  { utterance: "Go to the people", route: "people" }, { utterance: "Take me to people", route: "people" },
  { utterance: "Now", route: "now" }, { utterance: "Open now", route: "now" }, { utterance: "Show me now", route: "now" }, { utterance: "Go to now", route: "now" },
  { utterance: "Back", route: "back" }, { utterance: "Go back", route: "back" }, { utterance: "Take me back", route: "home" },
  { utterance: "Previous space", route: "back" }, { utterance: "Return", route: "back" },
];

const systemCorpus: Array<{ utterance: string; type: GlobalIntent["type"] }> = [
  { utterance: "Undo", type: "history" }, { utterance: "Undo that", type: "history" }, { utterance: "Undo last change", type: "history" },
  { utterance: "Go back one change", type: "history" }, { utterance: "Redo", type: "history" }, { utterance: "Redo that", type: "history" },
  { utterance: "Redo last change", type: "history" }, { utterance: "Do that again", type: "history" }, { utterance: "What changed?", type: "what-changed" },
  { utterance: "What just changed", type: "what-changed" }, { utterance: "Show last change", type: "what-changed" },
  { utterance: "Flow sleep", type: "session" }, { utterance: "Stop listening", type: "session" }, { utterance: "Pause listening", type: "session" },
  { utterance: "Pause", type: "session" }, { utterance: "Go to sleep", type: "session" }, { utterance: "Turn off Flow Live", type: "session" },
  { utterance: "Start Flow Live", type: "session" }, { utterance: "Flow Live", type: "session" }, { utterance: "Start listening", type: "session" },
  { utterance: "Resume listening", type: "session" }, { utterance: "Wake up Flow", type: "session" }, { utterance: "Confirm", type: "confirm" },
  { utterance: "Yes please", type: "confirm" }, { utterance: "Go ahead", type: "confirm" }, { utterance: "Cancel", type: "cancel" },
  { utterance: "Never mind", type: "cancel" }, { utterance: "Help", type: "help" }, { utterance: "What can I say", type: "help" },
];

const explicitCaptureCorpus = [
  { utterance: "Capture buy coffee", title: "buy coffee" }, { utterance: "Remember to buy coffee", title: "buy coffee" },
  { utterance: "Remember that Maya likes tea", title: "Maya likes tea" }, { utterance: "Note call the embassy", title: "call the embassy" },
  { utterance: "Note that the passport expires soon", title: "the passport expires soon" }, { utterance: "Jot down visa photos", title: "visa photos" },
  { utterance: "Write down book the hotel", title: "book the hotel" }, { utterance: "Log renew passport", title: "renew passport" },
  { utterance: "Save pack adapters", title: "pack adapters" }, { utterance: "Add coffee to inbox", title: "coffee" },
  { utterance: "Add renew passport in my inbox", title: "renew passport" }, { utterance: "Save itinerary to inbox", title: "itinerary" },
  { utterance: "Put visa check in inbox", title: "visa check" }, { utterance: "Log flight number to my inbox", title: "flight number" },
  { utterance: "Add to Inbox: call Maya", title: "call Maya" }, { utterance: "Capture check vaccination card", title: "check vaccination card" },
  { utterance: "Remember confirm accommodation", title: "confirm accommodation" }, { utterance: "Note buy sunscreen", title: "buy sunscreen" },
  { utterance: "Jot down Senegal packing list", title: "Senegal packing list" }, { utterance: "Write down ask about visa", title: "ask about visa" },
  { utterance: "Save restaurant ideas in inbox", title: "restaurant ideas" }, { utterance: "Log passport copy to inbox", title: "passport copy" },
];

const neverCaptureCorpus = [
  "Open the calendar", "Open inbox", "Open the plans container", "Show my calendar", "Back", "Pause listening", "Cancel", "Undo that",
  "Move the meeting", "Move it", "Schedule Documents", "Put workout at 25", "Make this red", "Give me time before it", "Delete",
  "Turn the item into a plan", "Maya by Friday", "Add something", "Maybe later", "Coffee", "Renew passport before Senegal",
  "Uh I need to renew my passport", "Tell me a joke", "Search the web", "Send an email", "Weather tomorrow", "Hello Flow",
  "Blah blah", "Open sesame", "Do the thing",
];

describe("strict global router safety", () => {
  it.each(navigationCorpus)("routes $utterance without capture", ({ utterance, route }) => {
    expect(interpretGlobalCommand(utterance, contexts.inbox, dateKey)).toEqual({ type: "navigate", route });
  });
  it.each(systemCorpus)("handles $utterance as system intent", ({ utterance, type }) => {
    expect(interpretGlobalCommand(utterance, contexts.inbox, dateKey).type).toBe(type);
  });
  it.each(explicitCaptureCorpus)("captures only explicit $utterance", ({ utterance, title }) => {
    expect(interpretGlobalCommand(utterance, contexts.home, dateKey)).toEqual({ type: "capture-create", title });
  });
  it.each(neverCaptureCorpus)("never silently captures $utterance", (utterance) => {
    expect(interpretGlobalCommand(utterance, contexts.inbox, dateKey).type).not.toBe("capture-create");
  });
  it("keeps domain phrases distinct from whole-utterance system commands", () => {
    expect(interpretGlobalCommand("Pause this plan", contexts.plans, dateKey)).toMatchObject({ type: "plan-status", status: "paused" });
    expect(interpretGlobalCommand("Cancel dentist appointment", contexts.calendar, dateKey)).toMatchObject({ type: "calendar" });
  });
  it("extracts an explicit capture query instead of using unrelated focus", () => {
    expect(interpretGlobalCommand("Turn the passport item into a plan", contexts.inbox, dateKey)).toEqual({ type: "capture-convert", query: "passport" });
  });
  it("routes a complete Calendar create before cross-space step syntax and requires a real unique step", () => {
    expect(interpretGlobalCommand("Schedule a 30 minute product meeting Friday at ten", contexts.calendar, dateKey, knownSteps)).toMatchObject({
      type: "calendar",
      request: { actions: [{ type: "create", title: "product meeting", durationMinutes: 30 }] },
    });
    expect(interpretGlobalCommand("Schedule Documents Friday at ten", contexts.home, dateKey, knownSteps)).toMatchObject({ type: "step-schedule", query: "Documents" });
    expect(interpretGlobalCommand("Schedule Roadmap step Friday at ten", contexts.home, dateKey, knownSteps)).toMatchObject({ type: "clarification", title: "I can't find the Roadmap step." });
  });
  it("requires context for a leading pronoun but not for anaphors bound inside one atomic request", () => {
    expect(interpretGlobalCommand("Make it red", contexts.calendar, dateKey)).toMatchObject({ type: "clarification", title: "Which Today event do you mean?" });
    expect(interpretGlobalCommand("Add a workout at five, protect it, and give ten minutes before it", contexts.calendar, dateKey)).toMatchObject({ type: "calendar" });
  });
  it("resolves a person pronoun and a pending Focus refinement before generic domain fallback", () => {
    const nowMs = Date.parse("2026-09-03T09:00:00");
    const personContext: LifeContext = {
      route: "people", topic: "person", focusedPersonId: "person-sarah", nowMs,
      selected: { id: "person-sarah", kind: "person", at: nowMs },
    };
    expect(interpretGlobalCommand("What do I owe her?", personContext, dateKey)).toEqual({ type: "people-query", mode: "i-owe", personId: "person-sarah" });
    expect(interpretGlobalCommand("Actually make it 15.", { route: "focus", pending: "confirmation", topic: "focus" }, dateKey)).toEqual({ type: "focus-refine", minutes: 15 });
  });
  it("ranks a complete Calendar action above weak fuzzy navigation", () => {
    const plan = createInitialLifePlan(dateKey);
    expect(rankGlobalTranscript("Move deep work to four", contexts.home, dateKey, plan))
      .toBeGreaterThan(rankGlobalTranscript("Open focus aria", contexts.home, dateKey, plan));
  });
});
