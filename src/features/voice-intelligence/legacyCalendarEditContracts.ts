import type { CalendarEvent, Destination, EventSelector } from "../day-planner/model";
import type { SemanticExpectation } from "./semanticExpectation";
import resize from "./legacyResizeSlots.json";
import move from "./legacyMoveSlots.json";
import outcomes from "./legacyMoveOutcomes.json";

export type LegacyCalendarEditDeclaration = { text: string; line: number; title: string; semantic: (target: CalendarEvent) => SemanticExpectation };
export const legacyCalendarEdits = new Map<string, LegacyCalendarEditDeclaration>();
const base: SemanticExpectation = { historyDelta: 1, feedbackPhase: "completed", noCreation: true, noPending: true, commitCount: 1 };

for (const tuple of resize.rows) {
  const [suffix, line, text, title, flavor, value] = tuple as [string, number, string, string, string, number];
  const minutes = flavor === "R" ? -value : value, mode = flavor === "S" ? "set" : "add";
  const end = 900 + (mode === "set" ? minutes : 30 + minutes), changed = end !== 930;
  legacyCalendarEdits.set(`curated-${suffix}`, { text, line, title, semantic: (target) => ({
    ...base, historyDelta: Number(changed), commitCount: Number(changed), targetIds: [target.id], calendarActionTypes: ["resize"],
    actions: [{ type: "calendar.request", request: { actions: [{ type: "resize", mode, minutes }], constraints: [] } }],
    eventChanges: changed ? [{ id: target.id, patch: { end } }, ...(end > 930 ? [{ id: "workout", patch: { start: end, end: end + 60 } }] : [])] : [],
  }) });
}
for (const tuple of move.rows) {
  const [suffix, line, text, title, code] = tuple as [string, number, string, string, string | number];
  const geometry = outcomes.rows.find((row) => row[0] === code) as [string | number, number, number, number, { id: string; patch: Partial<CalendarEvent> } | null] | undefined;
  if (!geometry) throw new Error(`Unreviewed move geometry: ${suffix}`);
  const [, , start, end, collateral] = geometry;
  const anchor: EventSelector = { type: "title", query: "lunch" };
  const destination: Destination = typeof code === "number" ? { type: "absolute", minutes: code }
    : { type: "relative", relation: code === "B" ? "before" : "after", anchor };
  legacyCalendarEdits.set(`curated-${suffix}`, { text, line, title, semantic: (target) => ({
    ...base, targetIds: [target.id], calendarActionTypes: ["move"],
    actions: [{ type: "calendar.request", request: { actions: [{ type: "move", destination }], constraints: [] } }],
    eventChanges: [{ id: target.id, patch: { start, end } }, ...(collateral ? [collateral] : [])],
  }) });
}
