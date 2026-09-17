import { describe, expect, it } from "vitest";
import type { LifeContext, LifeRoute } from "../../domain/life-model";
import { globalActionManifest, globalIntentRegistry, interpretGlobalCommand, resolveGlobalCommand } from "./globalInterpreter";

const dateKey = "2026-09-05";
const routes: LifeRoute[] = ["home", "calendar", "inbox", "plans", "people", "focus", "weather-outfit", "good-to-know", "journal", "atmosphere", "memories"];
const context = (route: LifeRoute, patch: Partial<LifeContext> = {}): LifeContext => ({ route, nowMs: Date.parse("2026-09-05T12:00:00Z"), activeMode: "command", ...patch });

describe("voice-intelligence milestone matrix", () => {
  it.each(routes)("keeps the first-milestone language global from %s", (route) => {
    const here = context(route);
    expect(interpretGlobalCommand("new entry", here, dateKey)).toMatchObject({ type: "journal-create" });
    expect(interpretGlobalCommand("start with my voice", here, dateKey)).toMatchObject({ type: "journal-create", beginRecording: true });
    expect(interpretGlobalCommand("open my calendar for this week", here, dateKey)).toMatchObject({ type: "navigate-temporal", route: "calendar", scope: { kind: "week" } });
    expect(interpretGlobalCommand("open my calendar for the whole week", here, dateKey)).toMatchObject({ type: "navigate-temporal", route: "calendar", scope: { kind: "week" } });
    expect(interpretGlobalCommand("open the capture area", here, dateKey)).toMatchObject({ type: "navigate", route: "inbox" });
    expect(interpretGlobalCommand("open the outcomes area", here, dateKey)).toMatchObject({ type: "navigate", route: "plans" });
    expect(interpretGlobalCommand("open the commitments area", here, dateKey)).toMatchObject({ type: "navigate", route: "people" });
    expect(interpretGlobalCommand("open home area", here, dateKey)).toMatchObject({ type: "navigate", route: "home" });
    expect(interpretGlobalCommand("show me tomorrow", here, dateKey)).toMatchObject({ type: "temporal", scope: { kind: "day", dateKey: "2026-09-06" } });
    expect(interpretGlobalCommand("show me two days from today", here, dateKey)).toMatchObject({ type: "temporal", scope: { kind: "day", dateKey: "2026-09-07" } });
    expect(interpretGlobalCommand("show me the whole week", here, dateKey)).toMatchObject({ type: "temporal", scope: { kind: "week" } });
  });

  it("uses the latest compatible self-correction without executing both values", () => {
    expect(interpretGlobalCommand("open today—actually tomorrow", context("home"), dateKey)).toMatchObject({ type: "temporal", scope: { dateKey: "2026-09-06" } });
    expect(interpretGlobalCommand("open capture—sorry, journal", context("home"), dateKey)).toMatchObject({ type: "navigate", route: "journal" });
    expect(interpretGlobalCommand("move it to three, no four", context("calendar", { selected: { kind: "calendar-event", id: "deep-work", at: Date.parse("2026-09-05T11:59:00Z") } }), dateKey)).toMatchObject({ type: "calendar", request: { actions: [{ type: "move", destination: { type: "absolute", minutes: 16 * 60 } }] } });
  });

  it("keeps safe multi-clause route and time requests ordered", () => {
    expect(interpretGlobalCommand("show me tomorrow and then go back home", context("calendar"), dateKey)).toMatchObject({
      type: "global-sequence",
      steps: [{ type: "temporal", scope: { dateKey: "2026-09-06" } }, { type: "navigate", route: "home" }],
    });
    expect(interpretGlobalCommand("open my whole week then go back home", context("calendar"), dateKey)).toMatchObject({ type: "global-sequence" });
  });

  it("preserves a selected insight while asking for the missing day", () => {
    const week = { kind: "week" as const, dateKey: "2026-08-31", endDateKey: "2026-09-06" };
    expect(interpretGlobalCommand("put this in motion", context("good-to-know", { topic: "recommendation", currentTimeScope: week, selectedInsightId: "clear-focus-window" }), dateKey)).toMatchObject({
      type: "clarification",
      continuation: { type: "instinct-act", instinctId: "clear-focus-window" },
    });
    expect(interpretGlobalCommand("Friday", context("good-to-know", { topic: "recommendation", currentTimeScope: week, pendingIntent: { type: "instinct-act", instinctId: "clear-focus-window", expiresAt: Date.parse("2026-09-05T12:02:00Z") } }), dateKey)).toMatchObject({
      type: "instinct-act",
      instinctId: "clear-focus-window",
    });
  });

  it("publishes every scored candidate and its positive and negative evidence", () => {
    const resolution = resolveGlobalCommand("start with my voice", context("journal", { topic: "journal" }), dateKey);
    expect(resolution.selected).toMatchObject({ domain: "journal", intent: { type: "journal-create" } });
    expect(resolution.candidates.length).toBeGreaterThan(1);
    expect(resolution.candidates.every(({ positiveEvidence, negativeEvidence }) => Array.isArray(positiveEvidence) && Array.isArray(negativeEvidence))).toBe(true);
    const contextualCalendar = resolveGlobalCommand("make it red", context("calendar", { selected: { kind: "calendar-event", id: "deep-work", at: Date.parse("2026-09-05T11:59:00Z") } }), dateKey);
    expect(contextualCalendar.candidates.some(({ domain, positiveEvidence, negativeEvidence }) => domain === "calendar" && positiveEvidence.includes("fresh-calendar-reference") && negativeEvidence.length > 0)).toBe(true);
  });

  it("registers supported action families structurally instead of hiding them in one fallback definition", () => {
    const registered = new Set(globalIntentRegistry.flatMap(({ intentTypes }) => intentTypes));
    expect(globalIntentRegistry.map(({ id }) => id)).not.toContain("life.production");
    expect([...registered]).toEqual(expect.arrayContaining([
      "navigate", "navigate-temporal", "temporal", "calendar", "capture-create", "outcome-create",
      "commitment-create", "people-query", "journal-create", "journal-recording", "journal-append",
      "atmosphere-play", "atmosphere-save", "memory-create", "memory-update", "workspace", "history", "unsupported",
    ]));
    expect(globalIntentRegistry.every(({ id, domain, intentTypes, examples }) => Boolean(id && domain && intentTypes.length && examples.length))).toBe(true);
    expect(globalActionManifest.length).toBeGreaterThan(75);
    expect(new Set(globalActionManifest.map(({ id }) => id)).size).toBe(globalActionManifest.length);
    expect(globalActionManifest.filter(({ intentType }) => intentType === "calendar").map(({ calendarActionType }) => calendarActionType)).toEqual(expect.arrayContaining([
      "create", "move", "shift", "resize", "protect", "unprotect", "fit", "recover", "defer", "delete", "update",
      "createBreathingRoom", "split", "merge", "complete", "reopen", "setDayBoundary", "reflow", "commitPreview", "cancelPreview", "adjustPreview",
    ]));
  });
});
