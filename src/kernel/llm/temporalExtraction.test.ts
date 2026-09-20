import { describe, it, expect } from "vitest";
import { extractClockTime, extractRelativeDate, timeToMinutes } from "./temporalExtraction";

describe("extractClockTime", () => {
  it("resolves an explicit am/pm marker", () => {
    expect(extractClockTime("move dinner to 8pm")).toEqual({ hour: 20, minute: 0, confidence: "explicit" });
    expect(extractClockTime("wake up at 6am")).toEqual({ hour: 6, minute: 0, confidence: "explicit" });
  });

  it("resolves minutes and 24h-shaped hours", () => {
    expect(extractClockTime("at 9:30am")).toEqual({ hour: 9, minute: 30, confidence: "explicit" });
    expect(extractClockTime("at 14:00")).toEqual({ hour: 14, minute: 0, confidence: "explicit" });
  });

  it("infers pm from dinner/evening context for a bare hour word", () => {
    expect(extractClockTime("move dinner to eight")).toEqual({ hour: 20, minute: 0, confidence: "contextual" });
  });

  it("infers am from breakfast/gym context for a bare hour word", () => {
    expect(extractClockTime("move the gym session to eight")).toEqual({ hour: 8, minute: 0, confidence: "contextual" });
  });

  it("reports ambiguous when there's no marker or context", () => {
    expect(extractClockTime("move it to eight")).toEqual({ hour: 8, minute: 0, confidence: "ambiguous" });
  });

  it("returns null when there's no time expression at all", () => {
    expect(extractClockTime("move dinner earlier")).toBeNull();
  });

  it("handles midnight and noon", () => {
    expect(extractClockTime("set it for noon")).toEqual({ hour: 12, minute: 0, confidence: "explicit" });
    expect(extractClockTime("set it for midnight")).toEqual({ hour: 0, minute: 0, confidence: "explicit" });
  });

  it("converts to minutes-since-midnight", () => {
    expect(timeToMinutes({ hour: 20, minute: 30, confidence: "explicit" })).toBe(1230);
  });
});

describe("extractRelativeDate", () => {
  // A fixed Tuesday for deterministic weekday-offset math.
  const today = new Date("2026-09-15T09:00:00");

  it("resolves today/tonight and tomorrow", () => {
    expect(extractRelativeDate("dinner tonight", today)).toEqual({ dateKey: "2026-09-15", confidence: "explicit" });
    expect(extractRelativeDate("dinner tomorrow", today)).toEqual({ dateKey: "2026-09-16", confidence: "explicit" });
  });

  it("resolves a bare upcoming weekday name", () => {
    // today is Tuesday; "Friday" should be 3 days out.
    expect(extractRelativeDate("book it for friday", today)).toEqual({ dateKey: "2026-09-18", confidence: "explicit" });
  });

  it("resolves 'next <weekday>' even when it equals today's weekday, a full week out", () => {
    expect(extractRelativeDate("next tuesday", today)).toEqual({ dateKey: "2026-09-22", confidence: "explicit" });
  });

  it("falls back to today when nothing date-shaped is present", () => {
    expect(extractRelativeDate("move it to eight", today)).toEqual({ dateKey: "2026-09-15", confidence: "implicit-today" });
  });

  it("accepts an explicit ISO date", () => {
    expect(extractRelativeDate("on 2026-12-01", today)).toEqual({ dateKey: "2026-12-01", confidence: "explicit" });
  });
});
