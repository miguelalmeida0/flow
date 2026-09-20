import { describe, it, expect } from "vitest";
import { sourceDateKey } from "./sourceDates";

/**
 * Documents (does not assume) exactly how a bare, unqualified weekday
 * reference ("Thursday", no "this/next/last") resolves — see FINAL
 * REPORT's physical-test repair F: on Saturday September 19 2026, "cancel
 * the dentist appointment on Thursday" selected Thursday September 17 (in
 * the past) rather than the coming Thursday September 24.
 */
describe("sourceDateKey: bare weekday resolution", () => {
  const TODAY = "2026-09-19"; // a Saturday.

  it("without a visible week in scope, a bare weekday always resolves FORWARD to the next occurrence (never the past)", () => {
    // Thursday is 5 days after Saturday Sep 19 -> Sep 24, not Sep 17.
    expect(sourceDateKey({ weekday: 4, relation: "named" }, TODAY)).toBe("2026-09-24");
  });

  it("explicit 'next Thursday' also resolves forward", () => {
    expect(sourceDateKey({ weekday: 4, relation: "next" }, TODAY)).toBe("2026-09-24");
  });

  it("explicit 'last Thursday' resolves to the past occurrence", () => {
    expect(sourceDateKey({ weekday: 4, relation: "last" }, TODAY)).toBe("2026-09-17");
  });

  it("explicit 'this Thursday' resolves within the current week even if it's already past", () => {
    expect(sourceDateKey({ weekday: 4, relation: "this" }, TODAY)).toBe("2026-09-17");
    expect(sourceDateKey({ weekday: 4, relation: "this" }, "2026-09-20")).toBe("2026-09-17");
  });

  it("WHEN a week view is the active visible scope, a bare weekday resolves to THAT week's occurrence — this is where a past date can legitimately come from, and it is a deliberate 'the week I'm looking at' interpretation, not a bug in the resolver itself", () => {
    // The week of Sun Sep 13 - Sat Sep 19 (the week containing "today").
    const visibleWeekStart = "2026-09-13";
    expect(sourceDateKey({ weekday: 4, relation: "named" }, TODAY, visibleWeekStart)).toBe("2026-09-17");
  });

  it("a DIFFERENT visible week (e.g. next week) shifts the bare-weekday resolution accordingly", () => {
    const nextWeekStart = "2026-09-20"; // Sunday after today.
    expect(sourceDateKey({ weekday: 4, relation: "named" }, TODAY, nextWeekStart)).toBe("2026-09-24");
  });
});
