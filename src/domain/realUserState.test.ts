import { describe, expect, it } from "vitest";
import { appendJournalProse } from "./journalProse";
import { createLifeSnapshot, LIFE_STORAGE_KEY, readLifeSnapshot } from "./life-storage";
import { scopeLabel } from "../features/elite/temporal";

describe("acceptance prose and temporal coherence", () => {
  it("composes sentence finals as prose and preserves intentional paragraphs", () => {
    expect(appendJournalProse("Today I went for a walk.", "It was cool.")).toBe("Today I went for a walk. It was cool.");
    expect(appendJournalProse("today I went for a walk", "it was cool")).toBe("today I went for a walk. It was cool");
    expect(appendJournalProse("First paragraph.\n\n", "Another paragraph.")).toBe("First paragraph.\n\nAnother paragraph.");
  });
  it("rolls a current-week range together, never advances only the start", () => {
    const snapshot = createLifeSnapshot("2026-08-31");
    snapshot.temporal = { todayDateKey: "2026-08-31", scope: { kind: "week", dateKey: "2026-08-31", endDateKey: "2026-09-06" } };
    localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(snapshot));
    expect(readLifeSnapshot("2026-09-07")?.temporal).toMatchObject({ todayDateKey: "2026-09-07", scope: { kind: "week", dateKey: "2026-09-07", endDateKey: "2026-09-13" } });
    localStorage.clear();
  });
  it("does not label a historical week as This Week", () => {
    expect(scopeLabel({ kind: "week", dateKey: "2026-08-31", endDateKey: "2026-09-06" }, "2026-09-07")).not.toBe("This Week");
  });
});
