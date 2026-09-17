import { describe, expect, it } from "vitest";
import type { LifeContext, LifeRoute } from "../../domain/life-model";
import { interpretGlobalCommand } from "../../shared/command/globalInterpreter";
import {
  generateNegativeNavigationCorpus,
  generatePositiveNavigationCorpus,
  NAVIGATION_COLLISION_NEGATIVE_COUNT,
  NAVIGATION_POSITIVE_VARIANT_COUNT,
} from "./generatedNavigationCorpus";

const routes: LifeRoute[] = ["home", "today", "focus", "weather-outfit", "people", "good-to-know", "capture", "outcomes"];
const context = (route: LifeRoute): LifeContext => ({ route, currentWorld: route === "calendar" || route === "now" ? "today" : route === "inbox" ? "capture" : route === "plans" ? "outcomes" : route, nowMs: Date.parse("2026-09-04T10:00:00Z"), epoch: 0 });
const expectedRoute = (world: string) => world === "today" ? "calendar" : world === "capture" ? "inbox" : world === "outcomes" ? "plans" : world;

describe("generated global navigation corpus", () => {
  const positiveRows = generatePositiveNavigationCorpus();
  const partitionCount = 8;

  it("keeps the generated positive navigation inventory complete", () => {
    expect(positiveRows).toHaveLength(NAVIGATION_POSITIVE_VARIANT_COUNT);
  });

  it.each([0, 1, 2, 3, 4, 5, 6, 7] as const)("routes positive navigation partition %s through the production global router", async (partition) => {
    const rows = positiveRows.map((row, index) => ({ row, index })).filter(({ index }) => index % partitionCount === partition);
    expect(rows).toHaveLength(Math.ceil((NAVIGATION_POSITIVE_VARIANT_COUNT - partition) / partitionCount));
    for (let start = 0; start < rows.length; start += 64) {
      for (const { row, index } of rows.slice(start, start + 64)) {
        const result = interpretGlobalCommand(row.utterance, context(routes[index % routes.length]!), "2026-09-04");
        expect(result.type, row.utterance).toBe("navigate");
        if (result.type !== "navigate") continue;
        expect(result.route, row.utterance).toBe(expectedRoute(row.target.world));
        if (row.target.world === "people" && row.target.view === "commitments") expect(result.target?.view, row.utterance).toBe("commitments");
      }
      // This corpus is intentionally CPU-heavy. Yield between fixed batches so
      // the Vitest parent receives worker progress without altering coverage.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }, 20_000);

  it("keeps exactly 216 transformed domain collisions out of navigation and capture on every world", () => {
    const rows = generateNegativeNavigationCorpus();
    expect(rows).toHaveLength(NAVIGATION_COLLISION_NEGATIVE_COUNT);
    for (const [index, utterance] of rows.entries()) {
      const result = interpretGlobalCommand(utterance, context(routes[index % routes.length]!), "2026-09-04");
      expect(result.type, utterance).not.toBe("navigate");
      expect(result.type, utterance).not.toBe("capture-create");
    }
  });

  it("recovers only unique framed navigation alternatives and keeps mutations exact", () => {
    expect(interpretGlobalCommand("open focus aria", context("capture"), "2026-09-04")).toMatchObject({ type: "navigate", route: "focus", recovered: true });
    expect(interpretGlobalCommand("bring up good to no", context("today"), "2026-09-04")).toMatchObject({ type: "navigate", route: "good-to-know", recovered: true });
    expect(interpretGlobalCommand("open weather and out fit", context("outcomes"), "2026-09-04")).toMatchObject({ type: "navigate", route: "weather-outfit", recovered: true });
    expect(interpretGlobalCommand("open commit mints", context("focus"), "2026-09-04")).toMatchObject({ type: "navigate", route: "people", target: { world: "people", view: "commitments" }, recovered: true });
    expect(interpretGlobalCommand("delete focus aria", context("home"), "2026-09-04").type).not.toBe("navigate");
  });

  it("preserves the event-inspection semantics hidden inside the collision corpus", () => {
    expect(interpretGlobalCommand("Show the meeting at two", context("people"), "2026-09-04")).toMatchObject({
      type: "calendar-inspect", selector: { type: "source", at: 14 * 60, query: "meeting" },
    });
    expect(interpretGlobalCommand("Open the two PM meeting", context("focus"), "2026-09-04")).toMatchObject({
      type: "calendar-inspect", selector: { type: "source", at: 14 * 60, query: "meeting" },
    });
  });
});
