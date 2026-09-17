import { describe, expect, it } from "vitest";
import type { LifeContext, LifeRoute } from "../../domain/life-model";
import { interpretGlobalCommand } from "./globalInterpreter";

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

/** Regression coverage for the "bare journal entry" fix (studioSelection.ts):
 * allowing "latest entry" / "bookmarked entry" without a leading verb must not
 * let Journal steal turns from other domains, and must not weaken Calendar's
 * or Journal's existing mutual exclusivity. */
describe("post-fix adversarial collision matrix", () => {
  it.each([
    ["open journal", "navigate"],
    ["open calendar", "navigate"],
    ["open the latest entry", "studio-select"],
    ["open the bookmarked entry", "studio-select"],
    ["show my journal", "navigate"],
    ["show my day", "navigate"],
    ["go home", "navigate"],
    ["return home", "navigate"],
    ["scroll down", "scroll"],
  ] as const)("resolves %s to %s from home", (utterance, type) => {
    expect(interpretGlobalCommand(utterance, context("home"), dateKey).type).toBe(type);
  });

  it("open full week from home stays a soft temporal scope change (does not force navigation, by design)", () => {
    expect(interpretGlobalCommand("open full week", context("home"), dateKey).type).toBe("temporal");
  });

  it.each(["home", "plans", "people", "inbox"] as const)("bare 'latest entry' still resolves to a journal selection from %s ('entry' is a journal-owned noun app-wide)", (route) => {
    expect(interpretGlobalCommand("latest entry", context(route), dateKey).type).toBe("studio-select");
  });

  it.each([
    "open journal",
    "show my journal",
    "open the latest entry",
    "open the bookmarked entry",
    "latest entry",
    "last entry",
    "most recent entry",
    "bookmarked entry",
  ])("Calendar cannot steal '%s'", (utterance) => {
    const onCalendar = context("calendar", { topic: "calendar" });
    const result = interpretGlobalCommand(utterance, onCalendar, dateKey);
    expect(result.type).not.toBe("calendar");
    expect(["navigate", "studio-select"]).toContain(result.type);
  });

  it.each([
    "open calendar",
    "show calendar",
    "go to calendar",
    "take me to calendar",
    "calendar please",
  ])("Journal (active entry) cannot steal '%s'", (utterance) => {
    const inJournal = context("journal", { topic: "journal", activeJournalEntryId: "journal-1", voiceMode: "command" });
    expect(interpretGlobalCommand(utterance, inJournal, dateKey)).toMatchObject({ type: "navigate", route: "calendar" });
  });

  it("journal longform dictation treats entry-shaped prose as content, never a bare selection command", () => {
    const longform = context("journal", { topic: "journal", activeJournalEntryId: "journal-1", voiceMode: "journal-longform" });
    expect(interpretGlobalCommand("today was the latest entry in a long list of things I did", longform, dateKey)).toMatchObject({ type: "journal-append" });
  });

  it.each([
    "open journal",
    "show my journal",
    "journal please",
    "go to journal",
  ])("generic navigation '%s' stays 'navigate', never becomes a journal selection", (utterance) => {
    expect(interpretGlobalCommand(utterance, context("home"), dateKey)).toMatchObject({ type: "navigate", route: "journal" });
  });

  it.each(["open the latest entry", "latest entry", "bookmarked entry"])("Capture/Inbox cannot steal '%s'", (utterance) => {
    const onCapture = context("inbox", { topic: "capture" });
    expect(interpretGlobalCommand(utterance, onCapture, dateKey).type).toBe("studio-select");
  });

  it.each([
    ["Rename the meeting to \"Dog walking\"", "Dog walking"],
    ["Rename this to \"API Review\"", "API Review"],
    ["Call this \"Trip to Berlin\"", "Trip to Berlin"],
  ] as const)("payload preserved verbatim, untouched by normalization: %s", (utterance, expectedTitle) => {
    const onCalendar = context("calendar", { topic: "calendar", selected: { kind: "calendar-event", id: "evt-1", at: Date.parse("2026-09-05T11:00:00Z") } });
    const result = interpretGlobalCommand(utterance, onCalendar, dateKey) as { type: string; request?: { actions: Array<{ type: string; title?: string }> } };
    if (result.type === "calendar" && result.request) {
      const renameAction = result.request.actions.find((a) => a.type === "rename");
      if (renameAction) expect(renameAction.title).toBe(expectedTitle);
    }
  });

  it.each([
    "open my calendar entry",
    "show the calendar journal",
    "open journal for my calendar",
    "latest calendar entry please",
    "show the latest capture entry",
    "rename the latest entry to \"Trip notes\"",
  ])("multi-domain adversarial phrase '%s' resolves without throwing and never mis-fires as a bare journal selection off a real calendar/capture noun", (utterance) => {
    expect(() => interpretGlobalCommand(utterance, context("home"), dateKey)).not.toThrow();
  });

  it("'open my calendar entry' does not resolve as a bare journal-entry selection", () => {
    expect(interpretGlobalCommand("open my calendar entry", context("home"), dateKey).type).not.toBe("studio-select");
  });

  it("contextual sequence stays coherent end to end: open calendar -> show the whole week -> go home -> open journal -> latest entry", () => {
    const r1 = interpretGlobalCommand("open calendar", context("home"), dateKey);
    expect(r1).toMatchObject({ type: "navigate", route: "calendar" });
    const onCalendar = context("calendar", { topic: "calendar" });
    const r2 = interpretGlobalCommand("show the whole week", onCalendar, dateKey);
    expect(r2.type).toBe("temporal");
    const r3 = interpretGlobalCommand("go home", onCalendar, dateKey);
    expect(r3).toMatchObject({ type: "navigate", route: "home" });
    const r4 = interpretGlobalCommand("open journal", context("home"), dateKey);
    expect(r4).toMatchObject({ type: "navigate", route: "journal" });
    const inJournal = context("journal", { topic: "journal", activeJournalEntryId: "journal-1" });
    const r5 = interpretGlobalCommand("latest entry", inJournal, dateKey);
    expect(r5.type).toBe("studio-select");
  });
});
