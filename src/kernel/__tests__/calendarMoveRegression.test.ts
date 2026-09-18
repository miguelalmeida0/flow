import { describe, expect, it } from "vitest";
import { emptyDocument, fixedClock } from "./fixtures";
import { createDefaultRegistry } from "../capabilities";
import type { CapabilityContext } from "../types";

function contextFor(document = emptyDocument()): CapabilityContext {
  return { document, navigation: { route: "today" }, memory: [], history: [], historyPointer: -1, clock: fixedClock() };
}

describe("calendar.move regression — cross-day identity collision (found via live browser testing)", () => {
  const registry = createDefaultRegistry();

  it("fails gracefully instead of throwing when the multi-day world has a duplicate event id across dates", () => {
    // life-calendar-world.ts's normalizeCalendarWorld throws when the same
    // event id appears on two different dates without being byte-identical.
    // Live browser testing hit this exact class of error uncaught —
    // approving a calendar.move alternative against the real, richly
    // populated production document threw "Duplicate calendar identity
    // workout." straight out of the kernel and crashed the turn (the input
    // box would not respond to further input). This test constructs a
    // minimal reproduction of the same identity-collision family and
    // asserts the capability now converts it into an ordinary
    // CapabilityFailure instead of an uncaught exception.
    const document = emptyDocument();
    const otherDateKey = "2026-09-18";
    document.calendars[otherDateKey] = {
      dateKey: otherDateKey,
      events: [{ id: "workout", title: "Workout (different day)", dateKey: otherDateKey, start: 600, end: 660, kind: "flexible", priority: "medium" }],
      deferred: [],
    };

    const move = registry.get("calendar.move")!;
    const result = move.execute({ eventId: "workout", startMinutes: 10 * 60 }, contextFor(document));

    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.message).toContain("Duplicate identity");
  });
});
