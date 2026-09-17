import { describe, expect, it, vi } from "vitest";
import { formatTime } from "./time";

describe("calendar clock labels", () => {
  it("preserves every supported minute and midnight boundary exactly", () => {
    for (let minutes = 0; minutes <= 24 * 60; minutes += 1) {
      const hour = Math.floor(minutes / 60);
      const minute = minutes % 60;
      const previous = new Intl.DateTimeFormat("en", { hour: "numeric", minute: minute === 0 ? undefined : "2-digit" })
        .format(new Date(2026, 0, 1, hour, minute));
      expect(formatTime(minutes), `minute ${minutes}`).toBe(previous);
    }
  });

  it("reuses the two formatters across repeated calendar and history renders", () => {
    formatTime(540);
    formatTime(795);
    const constructor = vi.spyOn(Intl, "DateTimeFormat");
    const format = vi.spyOn(Intl.DateTimeFormat.prototype as { readonly format: unknown }, "format", "get");
    try {
      for (let iteration = 0; iteration < 60; iteration += 1) {
        expect(formatTime(540)).toBe("9 AM");
        expect(formatTime(795)).toBe("1:15 PM");
      }
      expect(constructor).not.toHaveBeenCalled();
      expect(format).not.toHaveBeenCalled();
    } finally {
      format.mockRestore();
      constructor.mockRestore();
    }
  });

  it("preserves uncached fractional, out-of-range and invalid input behavior", () => {
    for (const minutes of [-1, 1441, 1560, 60.5]) {
      const minute = minutes % 60;
      const previous = new Intl.DateTimeFormat("en", { hour: "numeric", minute: minute === 0 ? undefined : "2-digit", timeZone: "UTC" })
        .format(new Date(Date.UTC(2026, 0, 1, Math.floor(minutes / 60), minute)));
      expect(formatTime(minutes)).toBe(previous);
    }
    expect(() => formatTime(Number.NaN)).toThrow(RangeError);
    expect(() => formatTime(Infinity)).toThrow(RangeError);
  });
});
