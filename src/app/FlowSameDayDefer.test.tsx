import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it } from "vitest";
import { FlowEnvironmentApp } from "./FlowEnvironmentApp";
import { calendarDialogueFixture } from "../features/voice-intelligence/calendarDialogueFixture";
import { LIFE_STORAGE_KEY } from "../domain/life-storage";
import type { LifeSnapshot } from "../domain/life-model";
import { executeRequest } from "../features/day-planner/scheduling/engine";

const read = () => JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
function command(text: string) {
  const input = screen.getByLabelText("Tell Flow what to change");
  fireEvent.change(input, { target: { value: text } }); fireEvent.submit(input.closest("form")!);
}
beforeEach(() => { localStorage.clear(); window.history.replaceState({}, "", "/today"); });
it.each([
  ["Move the roadmap to tomorrow afternoon", 900, "completed"],
  ["Move the roadmap to tomorrow at one thirty pm", 810, "completed"],
  ["Move the roadmap to tomorrow at ten thirty am", 630, "completed"],
] as const)("preserves the civil day and full transaction boundary: %s", async (text, expectedStart, phase) => {
  localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(calendarDialogueFixture()));
  render(<FlowEnvironmentApp now={() => new Date("2026-09-05T12:00:00.000Z")} />);
  command("Open tomorrow");
  const before = read();
  expect(before.document.calendar.dateKey).toBe("2026-09-06");
  expect(before.document.calendar.events.find(({ id }) => id === "dialogue-roadmap")).toMatchObject({ dateKey: "2026-09-06", start: 630, end: 660 });
  command(text);
  await waitFor(() => {
    const feedback = document.querySelector("[data-flow-feedback]");
    expect(feedback?.getAttribute("data-feedback-phase"), feedback?.textContent ?? "Missing feedback").toBe(phase);
  });
  if (expectedStart === 630) { expect(read()).toEqual(before); return; }
  const expected = structuredClone(before.document);
  for (const plan of [expected.calendar, expected.calendars["2026-09-06"]!]) {
    Object.assign(plan.events.find(({ id }) => id === "dialogue-roadmap")!, { start: expectedStart, end: expectedStart + 30 });
    plan.events.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  }
  expect(read().document).toEqual(expected);
  expect(read().past).toEqual([...before.past, { document: before.document }]);
  command("Undo"); await waitFor(() => expect(read().document).toEqual(before.document));
  command("Redo"); await waitFor(() => expect(read().document).toEqual(expected));
});
it.each([600, 630, 810])("uses exact same-day placement for defer.atMinutes=%s", (atMinutes) => {
  const before = calendarDialogueFixture().document.calendars["2026-09-06"]!;
  const plan = structuredClone(before);
  const result = executeRequest(plan, { transcript: "Explicit same-day deferral", normalized: "explicit same-day deferral", constraints: [], actions: [{ type: "defer", selector: { type: "id", id: "dialogue-roadmap" }, date: { dateKey: "2026-09-06" }, atMinutes }] });
  expect(plan).toEqual(before);
  expect(result.status).toBe(atMinutes === 600 ? "conflict" : "success");
  if (result.status !== "success") return;
  const expected = structuredClone(before);
  expected.breathingRooms = [];
  Object.assign(expected.events.find(({ id }) => id === "dialogue-roadmap")!, { start: atMinutes, end: atMinutes + 30 });
  expected.events.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  expect(result.plan).toEqual(expected);
  expect(result.plan.deferred).toEqual([]);
});
