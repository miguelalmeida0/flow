import { describe, expect, it } from "vitest";
import { resolveGlobalCommand } from "./globalInterpreter";
import { acceptanceFixture } from "../../features/voice-intelligence/acceptanceFixtures";

describe("incomplete explicit Calendar creation", () => {
  const fixture = acceptanceFixture("legacy-seed");
  const resolve = (text: string) => resolveGlobalCommand(text, fixture.context, "2026-09-05", [], 1020, fixture.snapshot.document.calendar);
  it.each([
    ["I want to schedule my visa interview at the U.S. embassy before our family travels to Europe next month", "Visa interview at the U.S. embassy"],
    ["Schedule a 25 minute passport check before the train leaves", "Passport check"],
  ])("retains the exact named subject while asking about an absent anchor: %s", (text, title) => {
    expect(resolve(text)).toMatchObject({ selected: { domain: "calendar" }, intent: { type: "clarification", continuation: { type: "calendar-create", title }, detail: expect.stringContaining("Nothing changed") } });
  });
  it("keeps the explicit request frame for a fully specified time", () => {
    expect(resolve("I want to schedule Interview Prep tomorrow at four").intent).toMatchObject({ type: "calendar", request: { actions: [{ type: "create", title: "Interview Prep", destination: { type: "absolute", minutes: 960, date: { dateKey: "2026-09-06" } } }] } });
  });
  it.each(["I wanted to schedule my interview someday", "I wonder whether I should schedule an interview", "The words 'I want to schedule an interview' were on the page"]) ("does not acquire authority from an inner verb: %s", (text) => {
    expect(resolve(text).intent.type).toBe("unsupported");
  });
});
