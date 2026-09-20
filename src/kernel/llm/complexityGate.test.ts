import { describe, it, expect } from "vitest";
import { assessComplexity } from "./complexityGate";

describe("assessComplexity", () => {
  it("flags a condition/exception clause so the action clause can't fire alone", () => {
    expect(assessComplexity("Move dinner to eight, unless that clashes with the call.").flagged).toBe(true);
    expect(assessComplexity("Clear an hour tonight, but leave dinner alone.").flagged).toBe(true);
    expect(assessComplexity("Find that note about the hotel, not the flight.").flagged).toBe(true);
  });

  it("flags hypothetical framing", () => {
    expect(assessComplexity("What would happen if I moved dinner?").flagged).toBe(true);
  });

  it("flags a negated action paired with an info request", () => {
    expect(assessComplexity("Don't move anything. Just show me the options.").flagged).toBe(true);
  });

  it("flags a quoted instruction embedded in a write/create verb", () => {
    expect(assessComplexity(`Write a note saying "delete everything".`).flagged).toBe(true);
  });

  it("flags an explanatory question with no action", () => {
    expect(assessComplexity("How does a JavaScript closure work?").flagged).toBe(true);
  });

  it("does not flag a plain single-clause command", () => {
    expect(assessComplexity("Push the thing with Daniel back half an hour.").flagged).toBe(false);
    expect(assessComplexity("Open full week.").flagged).toBe(false);
  });

  it("flags an ambiguous 'book ... appointment' request but not an ordinary calendar block", () => {
    // "Book a dentist appointment" is genuinely ambiguous between an EXTERNAL
    // booking Flow cannot make and recording an already-arranged appointment
    // — legacy's own calendar parser treats "book" as an unconditional
    // synonym for "add"/"create" and would otherwise silently fabricate a
    // calendar event for it with no capability actually backing it.
    expect(assessComplexity("Book a dentist appointment next Tuesday.").flagged).toBe(true);
    expect(assessComplexity("Book me a dentist appointment next Tuesday.").flagged).toBe(true);
    // Plain calendar-block phrasing with "book" as a synonym for
    // "schedule"/"add" is NOT ambiguous and stays on the deterministic path.
    expect(assessComplexity("Book breakfast at Café Luna tomorrow at eight.").flagged).toBe(false);
    expect(assessComplexity("Book an hour in my calendar for interview practice.").flagged).toBe(false);
  });

  it("does not flag a self-correction (already handled by selfCorrection.ts)", () => {
    expect(assessComplexity("Make it Friday—actually Saturday morning.").flagged).toBe(false);
  });

  it("flags a 'but ... if ...' compound fallback clause legacy's calendar creator silently drops", () => {
    // Verified by direct probe against the real interpreter (see FINAL
    // REPORT Phase 2): it executes "Add a meeting at 3" and drops the
    // entire "but call it something else if..." fallback with no trace.
    expect(assessComplexity("Add a meeting at 3, but call it something else if there's already something at 3.").flagged).toBe(true);
    // A plain "but" preservation clause with no "if" is legacy's own
    // already-working single-event field-preservation grammar and must
    // stay unflagged (see calendarCreationContext.ts / FlowCalendarPreservation.test.tsx).
    expect(assessComplexity("Move dinner to eight but keep it the same length.").flagged).toBe(false);
  });

  it("flags a communication verb conjoined onto a calendar command that legacy folds into the selector", () => {
    // Verified by direct probe: legacy's multi-action splitter has no
    // grammar for "text"/"message"/"email"/"call <name>", so it silently
    // absorbs the whole trailing clause into the calendar event selector
    // text instead of treating it as a second action or declining.
    expect(assessComplexity("Push the call back an hour and text Daniel about it.").flagged).toBe(true);
    expect(assessComplexity("Move dinner to eight and message Sofia.").flagged).toBe(true);
    expect(assessComplexity("Move dinner to eight and email the group.").flagged).toBe(true);
    // A second REAL calendar action legacy already decomposes correctly
    // must stay unflagged.
    expect(assessComplexity("Move dinner to eight and cancel drinks.").flagged).toBe(false);
    // "and call it X" is a renaming clause, not a communication verb.
    expect(assessComplexity("Add a meeting at three and call it Standup.").flagged).toBe(false);
  });

  it("flags a genuine question-plus-action mix, not a bare question or a bare action alone", () => {
    expect(assessComplexity("What's on tonight, and can you move dinner to six?").flagged).toBe(true);
    expect(assessComplexity("Remind me what I decided about Lisbon, then create a note called Lisbon follow-up.").flagged).toBe(true);
    // A bare recall question has no separate action clause — stays unflagged by this marker.
    expect(assessComplexity("What did I decide about Lisbon?").reasons).not.toContain("mixed-question-action");
  });
});
