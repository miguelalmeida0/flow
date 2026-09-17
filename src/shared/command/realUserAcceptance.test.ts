import { describe, expect, it } from "vitest";
import type { LifeContext } from "../../domain/life-model";
import { resolveGlobalCommand } from "./globalInterpreter";
import { interpretTranscript } from "../../features/day-planner/parser";

const day = "2026-09-07";
const dictation: LifeContext = { route: "journal", topic: "journal", voiceMode: "journal-longform", activeJournalEntryId: "entry-real", nowMs: Date.parse(`${day}T12:00:00Z`) };

describe("real-user segment ownership", () => {
  it("holds two explicit navigation destinations as clarification, not prose", () => {
    expect(resolveGlobalCommand("open the calendar or journal", dictation, day)).toMatchObject({ intent: { type: "clarification" }, segment: { classification: "AMBIGUOUS", destination: "clarification" } });
  });
  it.each(["go home", "go to home", "go to homepage", "take me home", "back home", "return home", "open home", "open the homepage", "open calendar", "show calendar", "show my calendar", "open my calendar", "go to calendar", "open journal"])("routes complete navigation during dictation: %s", (text) => {
    const result = resolveGlobalCommand(text, dictation, day);
    expect(result.intent).toMatchObject({ type: "navigate" });
    expect(result.candidates.some(({ definitionId }) => definitionId.startsWith("navigation."))).toBe(true);
  });
  it.each(["go to the homepage", "return to home", "please go to the home page", "can you take me home please", "Flow, home", "open the calendar", "go to the journal", "take me to journal"])("resolves global navigation variants without a selected surface: %s", (text) => {
    expect(resolveGlobalCommand(text, dictation, day).intent.type).toBe("navigate");
  });
  it.each(["Today I went for a walk.", "It was cool.", "I said go home, but she stayed.", "I wanted to open calendar tomorrow.", "Go home after the long day", "Move slowly through the thought", "Delete this someday from my mind", "Open the memory I kept from childhood", "Capture this as an idea", "We went home", "If I could go home", "Do not go home", "I wish I could undo the morning", "My eight am dentist appointment was lovely"])("keeps prose out of control routing: %s", (text) => {
    expect(resolveGlobalCommand(text, dictation, day).intent).toEqual({ type: "journal-append", text });
  });
  it.each(["She said “go home” and I laughed", "I wanted to go to homepage but stayed here", "The bookmark was on the table", "I stopped recording my worries in my head", "Home felt quiet today", "I called the dentist at eight", "I wanted to play Sunday evening", "We should stop the recording tomorrow"])("retains negative narrative evidence exactly: %s", (text) => {
    expect(resolveGlobalCommand(text, dictation, day).intent).toEqual({ type: "journal-append", text });
  });
  it.each([
    ["bookmark that", "journal-bookmark"], ["bookmark here", "journal-bookmark"],
    ["pause recording", "journal-recording"], ["resume recording", "journal-recording"],
    ["stop recording", "journal-recording"], ["finish recording", "journal-recording"],
    ["save this", "journal-save"], ["discard recording", "journal-recording"],
    ["undo", "history"], ["redo", "history"], ["pause listening", "session"],
    ["undo that", "history"], ["redo that", "history"],
    ["bookmark that and go home", "studio-compound"], ["pause recording then go home", "studio-compound"],
    ["play Sunday evening", "atmosphere-play"],
  ])("keeps an explicit control out of prose: %s", (text, type) => {
    expect(resolveGlobalCommand(text!, dictation, day).intent.type).toBe(type);
  });
});

describe("independent Calendar temporal and title extraction", () => {
  it.each([
    "book an 8:00 a.m. meeting calls dentist", "book an 8 a.m. meeting called Dentist",
    "book a meeting at 8 a.m. called Dentist", "schedule Dentist for 8", "add Dentist at 8 this morning",
    "create a Dentist appointment at 8", "8 a.m. dentist", "book dentist at eight", "schedule Dentist at eight", "add Dentist at 8",
  ])("preserves the explicit 8 AM and removes consumed temporal/name spans: %s", (text) => {
    const parsed = interpretTranscript(text, day);
    expect(parsed.status).toBe("ready");
    if (parsed.status !== "ready") return;
    expect(parsed.request.actions[0]).toMatchObject({ type: "create", destination: { type: "absolute", minutes: 480 } });
    const action = parsed.request.actions[0];
    if (action?.type === "create") {
      expect(action.title.toLowerCase()).toMatch(/dentist/);
      expect(action.title.toLowerCase()).not.toMatch(/\b(?:8|eight|am|called|calls|for|morning)\b/);
    }
  });
  it("preserves location and duration rather than treating title numbers as times", () => {
    const dinner = interpretTranscript("Book dinner at Pizzeria Roma tomorrow at eight", day);
    expect(dinner).toMatchObject({ status: "ready", request: { actions: [{ title: "dinner at Pizzeria Roma", durationMinutes: 60, destination: { type: "absolute", minutes: 1200, date: "tomorrow" } }] } });
    expect(interpretTranscript("Book a 30 minute meeting in Room 8", day).status).toBe("unsupported");
  });
});
