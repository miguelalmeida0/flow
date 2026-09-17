import { describe, expect, it, vi } from "vitest";
import { dateForKey, formatCompactScopeDate, formatScopeDate } from "./temporal";

describe("Home date labels", () => {
  it("preserves full and compact labels across leap days and year boundaries", () => {
    for (const dateKey of ["2024-02-29", "2026-09-04", "2026-12-31", "2027-01-01"]) {
      const date = dateForKey(dateKey);
      expect(formatScopeDate({ kind: "day", dateKey })).toBe(new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(date));
      expect(formatCompactScopeDate(dateKey)).toBe(new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(date));
    }
    expect(formatScopeDate({ kind: "week", dateKey: "2026-12-28", endDateKey: "2027-01-03" })).toBe("Dec 28 – Jan 3");
  });

  it("reuses day formatters across Home feedback and navigation renders", () => {
    const constructor = vi.spyOn(Intl, "DateTimeFormat");
    try {
      for (let index = 0; index < 60; index += 1) {
        expect(formatScopeDate({ kind: "day", dateKey: "2026-09-04" })).toBe("Friday, September 4");
        expect(formatCompactScopeDate("2026-09-04")).toBe("Fri, Sep 4");
      }
      expect(constructor).not.toHaveBeenCalled();
    } finally {
      constructor.mockRestore();
    }
  });
});
