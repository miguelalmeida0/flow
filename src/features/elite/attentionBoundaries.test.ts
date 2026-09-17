import { expect, it } from "vitest";
import { acceptanceFixture } from "../voice-intelligence/acceptanceFixtures";
import { buildEliteHomeModel } from "./eliteViewModel";
import { selectNowCandidates } from "../../domain/life-selectors";
import { resolveGlobalCommand } from "../../shared/command/globalInterpreter";

it("describes usable current work without calling it empty time before a later anchor", () => {
  const { snapshot, context } = acceptanceFixture("legacy-seed");
  const model = buildEliteHomeModel(snapshot.document, snapshot.temporal!.scope, new Date(context.nowMs!));
  expect(model.focusWindow).toMatchObject({ minutes: 60, start: 840, end: 900 });
  expect(model.summary).toBe("You have 60 minutes available in Planning — Q3 roadmap, until 3 PM.");
  expect(model.instincts.find(({ id }) => id === "clear-focus-window")!.provenance).toBe("60 usable minutes in Planning — Q3 roadmap, until 3 PM.");
});

it.each([
  ["something under half an hour", 29, ["step-29"]],
  ["something under one minute", 0, []],
  ["I have thirty minutes what fits", 30, ["step-29", "step-30"]],
] as const)("retains the strict or inclusive threshold: %s", (text, maximum, ids) => {
  const { snapshot, context } = acceptanceFixture("calendar-near");
  const at = new Date(context.nowMs!).toISOString();
  snapshot.document.plans = [29, 30].map((minutes) => ({ id: `plan-${minutes}`, kind: "plan", title: `Task ${minutes}`, outcome: "Ready", status: "active", stepIds: [`step-${minutes}`], createdAt: at, updatedAt: at }));
  snapshot.document.steps = [29, 30].map((minutes) => ({ id: `step-${minutes}`, kind: "plan-step", title: `Task ${minutes}`, planId: `plan-${minutes}`, status: "planned", estimatedMinutes: minutes, createdAt: at, updatedAt: at }));
  const before = structuredClone(snapshot);
  const intent = resolveGlobalCommand(text, context, snapshot.document.calendar.dateKey).intent;
  expect(intent).toMatchObject({ type: "query-now", excluded: [], maxMinutes: maximum });
  if (intent.type !== "query-now") throw new Error("Expected a read-only query");
  expect(selectNowCandidates(snapshot.document, new Date(context.nowMs!), intent).map(({ id }) => id)).toEqual(ids);
  expect(snapshot).toEqual(before);
});
