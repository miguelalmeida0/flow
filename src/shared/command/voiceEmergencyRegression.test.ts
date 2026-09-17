import { describe, expect, it } from "vitest";
import type { LifeContext, LifeRoute } from "../../domain/life-model";
import { createLifeSnapshot } from "../../domain/life-storage";
import { globalActionManifest, globalIntentRegistry, interpretGlobalCommand, resolveGlobalCommand } from "./globalInterpreter";

const dateKey = "2026-09-05";

function context(route: LifeRoute, patch: Partial<LifeContext> = {}): LifeContext {
  return {
    route,
    currentWorld: route === "calendar" || route === "now" ? "today" : route === "inbox" ? "capture" : route === "plans" ? "outcomes" : route,
    nowMs: Date.parse("2026-09-05T12:00:00Z"),
    epoch: 0,
    ...patch,
  };
}

describe("voice intelligence stop-ship regressions", () => {
  it.each(["the first one", "choose the first option", "pick option one", "use the second one", "the third option"])("resolves natural pending-choice language without creating a new command: %s", (utterance) => {
    const pendingChoices = ["alpha", "beta", "gamma"].map((id) => ({ id, label: `${id} meeting` }));
    const choiceId = utterance.includes("second") ? "beta" : utterance.includes("third") ? "gamma" : "alpha";
    expect(interpretGlobalCommand(utterance, context("home", { pending: "clarification", pendingChoices }), dateKey)).toEqual({ type: "pending-choice", choiceId });
    expect(interpretGlobalCommand(utterance, context("home"), dateKey).type).not.toBe("pending-choice");
  });
  it("registers every Calendar action as a real candidate producer without an umbrella", () => {
    const calendarActions = globalActionManifest.filter(({ calendarActionType }) => calendarActionType);
    expect(globalIntentRegistry.map(({ id }) => id)).not.toContain("calendar.actions");
    expect(new Set(calendarActions.map(({ calendarActionType }) => calendarActionType)).size).toBe(27);
    expect(new Set(globalIntentRegistry.map(({ id }) => id)).size).toBe(globalIntentRegistry.length);
    const plan = createLifeSnapshot(dateKey).document.calendar;
    const resolution = resolveGlobalCommand("Protect lunch", context("calendar", { topic: "calendar" }), dateKey, [], 17 * 60, plan);
    expect(resolution.selected?.definitionId).toBe("calendar.protect");
    expect(resolution.candidates.filter(({ domain }) => domain === "calendar").map(({ definitionId }) => definitionId)).toContain("calendar.protect");
  });

  it("treats New entry as a Journal action on Journal", () => {
    expect(interpretGlobalCommand("new entry", context("journal", { topic: "journal" }), dateKey)).toMatchObject({
      type: "journal-create",
      beginRecording: false,
    });
  });

  it("treats Start with my voice as Journal create plus recording on Journal", () => {
    expect(interpretGlobalCommand("start with my voice", context("journal", { topic: "journal" }), dateKey)).toMatchObject({
      type: "journal-create",
      beginRecording: true,
    });
  });

  it.each([
    "open my calendar for this week",
    "open my calendar for the whole week",
  ])("composes the Calendar destination with the requested week for %s", (utterance) => {
    expect(interpretGlobalCommand(utterance, context("home"), dateKey)).toMatchObject({
      type: "navigate-temporal",
      route: "calendar",
      scope: { kind: "week" },
    });
  });

  it("keeps an incomplete add inside the active Commitments surface", () => {
    expect(interpretGlobalCommand("add Miguel", context("people", { peopleView: "commitments", topic: "commitment" }), dateKey)).toMatchObject({
      type: "clarification",
      title: "What are you committing to Miguel?",
    });
  });

  it("recognizes the speakable Good-to-know action label", () => {
    expect(interpretGlobalCommand("put this in motion", context("good-to-know", { topic: "recommendation" }), dateKey)).toMatchObject({
      type: "instinct-act",
    });
  });

  it.each([
    ["open the capture area", "inbox"],
    ["open the outcomes area", "plans"],
    ["open the commitments area", "people"],
    ["open home area", "home"],
  ] as const)("routes %s without falling into a mutation domain", (utterance, route) => {
    expect(interpretGlobalCommand(utterance, context("home"), dateKey)).toMatchObject({ type: "navigate", route });
  });

  it.each([
    ["show me tomorrow", { kind: "day", dateKey: "2026-09-06" }],
    ["show me two days from today", { kind: "day", dateKey: "2026-09-07" }],
    ["show me the whole week", { kind: "week" }],
  ] as const)("understands the temporal request %s", (utterance, scope) => {
    expect(interpretGlobalCommand(utterance, context("home"), dateKey)).toMatchObject({ type: "temporal", scope });
  });

  it.each([
    ["start with my voice", "journal-recording"],
    ["new entry", "journal-create"],
    ["less rain", "atmosphere-adjust"],
    ["bookmark that", "journal-bookmark"],
    ["show my whole week", "temporal"],
  ] as const)("does not let Calendar steal %s", (utterance, expectedType) => {
    const journal = context("journal", { topic: "journal", activeJournalEntryId: "journal-1", voiceMode: "command" });
    expect(interpretGlobalCommand(utterance, journal, dateKey).type).toBe(expectedType);
  });

  it("keeps long-form content as content but allows explicit recording interruptions", () => {
    const longform = context("journal", { topic: "journal", activeJournalEntryId: "journal-1", voiceMode: "journal-longform" });
    expect(interpretGlobalCommand("I kept thinking about the rain", longform, dateKey)).toMatchObject({ type: "journal-append" });
    expect(interpretGlobalCommand("bookmark that", longform, dateKey)).toMatchObject({ type: "journal-bookmark" });
    expect(interpretGlobalCommand("pause recording", longform, dateKey)).toMatchObject({ type: "journal-recording", mode: "pause" });
  });

  it.each([
    ["I need somewhere to get this down", "home", {}, "journal-create"],
    ["sound room", "home", {}, "navigate"],
    ["new outcome", "plans", { topic: "outcome" }, "clarification"],
    ["add an outcome", "plans", { topic: "outcome" }, "clarification"],
    ["what am I working toward", "plans", { topic: "outcome" }, "navigate"],
    ["add a commitment", "people", { peopleView: "commitments", topic: "commitment" }, "clarification"],
    ["new commitment", "people", { peopleView: "commitments", topic: "commitment" }, "clarification"],
  ] as const)("keeps ordinary domain language in its real product domain: %s", (utterance, route, patch, expectedType) => {
    expect(interpretGlobalCommand(utterance, context(route, patch), dateKey).type).toBe(expectedType);
  });

  it.each(["remove the noisy thought", "delete this someday", "protect that someday", "defer a vague thing"])("never executes an ungrounded destructive Calendar command on any route: %s", (utterance) => {
    const plan = createLifeSnapshot(dateKey).document.calendar;
    for (const route of ["home", "calendar", "journal", "people", "plans"] as const) {
      const result = interpretGlobalCommand(utterance, context(route, route === "calendar" ? { topic: "calendar" } : {}), dateKey, [], 17 * 60, plan);
      expect(result.type, route).not.toBe("calendar");
    }
  });

  it("allows a destructive Calendar request only when its target resolves exactly", () => {
    const plan = createLifeSnapshot(dateKey).document.calendar;
    expect(interpretGlobalCommand("Delete the dentist appointment", context("calendar", { topic: "calendar" }), dateKey, [], 17 * 60, plan)).toMatchObject({
      type: "calendar",
      request: { actions: [{ type: "delete" }] },
    });
  });

  it("keeps Journal dictation as content even when the sentence begins with another domain verb", () => {
    const longform = context("journal", { topic: "journal", activeJournalEntryId: "journal-1", voiceMode: "journal-longform" });
    expect(interpretGlobalCommand("move slowly through the thought", longform, dateKey)).toMatchObject({ type: "journal-append" });
    expect(interpretGlobalCommand("delete this someday from my mind", longform, dateKey)).toMatchObject({ type: "journal-append" });
    expect(interpretGlobalCommand("open the memory I kept from childhood", longform, dateKey)).toMatchObject({ type: "journal-append" });
    expect(interpretGlobalCommand("open calendar", longform, dateKey)).toMatchObject({ type: "navigate", route: "calendar" });
    expect(interpretGlobalCommand("capture this as an idea", longform, dateKey)).toMatchObject({ type: "journal-append" });
    expect(interpretGlobalCommand("go home after the long day", longform, dateKey)).toMatchObject({ type: "journal-append" });
  });

  it.each([
    "Make strategy review twenty minutes",
    "Make design critique half an hour",
    "Make client workshop forty minutes",
  ])("resizes arbitrary titled calendar events with spoken durations: %s", (utterance) => {
    expect(interpretGlobalCommand(utterance, context("calendar", { topic: "calendar" }), dateKey)).toMatchObject({
      type: "calendar",
      request: { actions: [{ type: "resize" }] },
    });
  });

  it("expires or replaces one-shot commitment context before it can consume unrelated speech", () => {
    const stale = context("people", { peopleView: "commitments", topic: "commitment", pendingIntent: { type: "commitment-create", person: "Miguel", expiresAt: Date.parse("2026-09-05T11:59:59Z") } });
    expect(interpretGlobalCommand("send the proposal Friday", stale, dateKey).type).not.toBe("commitment-create");
    const fresh = context("people", { peopleView: "commitments", topic: "commitment", pendingIntent: { type: "commitment-create", person: "Miguel", expiresAt: Date.parse("2026-09-05T12:02:00Z") } });
    expect(interpretGlobalCommand("send the proposal Friday", fresh, dateKey)).toMatchObject({ type: "commitment-create", person: "Miguel" });
    expect(interpretGlobalCommand("open the journal", fresh, dateKey)).toMatchObject({ type: "navigate", route: "journal" });
    expect(interpretGlobalCommand("new outcome", fresh, dateKey).type).toBe("clarification");
  });
});
