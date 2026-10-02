import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it } from "vitest";
import { FlowEnvironmentApp } from "./FlowEnvironmentApp";
import { createFreshLifeSnapshot, LIFE_STORAGE_KEY } from "../domain/life-storage";
import type { LifeSnapshot } from "../domain/life-model";
import seeds from "../features/voice-intelligence/curatedLanguageSeeds.json";
import { interpretTranscript } from "../features/day-planner/parser";
import { executeRequest } from "../features/day-planner/scheduling/engine";

// Independently authored slots for existing source utterances. The occupied
// fixture is retained; successful creation has an explicitly empty tomorrow.
const rows = [
  ["0097", "Tax preparation", 660, 30],
  ["0194", "Team retro meeting", 660, 40],
  ["0336", "Doctor's appointment", 960, 30],
  ["0478", "Presentation practice", 660, 45],
  ["0563", "Grocery planning", 660, 25],
  ["0618", "Writing workshop", 660, 20],
  ["0945", "Garden planning", 660, 30],
  ["0962", "Travel planning session", 660, 30],
  ["0987", "Passport paperwork block", 660, 25],
] as const;
const read = () => JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
function command(text: string) {
  const input = screen.getByLabelText("Tell Flow what to change");
  fireEvent.change(input, { target: { value: text } });
  fireEvent.submit(input.closest("form")!);
}
beforeEach(() => { localStorage.clear(); window.history.replaceState({}, "", "/today"); });
for (const [suffix, title, start, duration] of rows) {
  const utterance = seeds.find(({ id }) => id === `curated-${suffix}`)!.utterance;
  for (const occupied of [false, true]) it(`${suffix} preserves exact creation slots with tomorrow ${occupied ? "occupied" : "available"}`, async () => {
    const initial = createFreshLifeSnapshot("2026-09-05");
    if (!occupied) initial.document.calendars["2026-09-06"] = { dateKey: "2026-09-06", events: [], deferred: [], breathingRooms: [] };
    localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(initial));
    render(<FlowEnvironmentApp now={() => new Date("2026-09-05T12:00:00.000Z")} />);
    const before = read();
    // Booking a professional appointment intentionally requires reasoning.
    // Exercise explicit calendar intent here; the original phrase's parser
    // and scheduler contract is checked separately below.
    command(suffix === "0336" ? utterance.replace(/^book/, "add") : utterance);
    await waitFor(() => expect(document.querySelector("[data-flow-feedback]")).toHaveAttribute("data-feedback-phase", occupied ? "error" : "completed"));
    if (occupied) {
      expect(screen.getByText("That time is unavailable")).toBeInTheDocument();
      expect(read()).toEqual(before);
      return;
    }
    const after = read();
    expect(after.document.calendars["2026-09-06"]?.events).toEqual([expect.objectContaining({ title, dateKey: "2026-09-06", start, end: start + duration })]);
    expect(after.document.calendars["2026-09-05"]).toEqual(before.document.calendars["2026-09-05"]);
    expect(after.past).toEqual([...before.past, { document: before.document }]);
    expect(after.future).toEqual([]);
    command("Undo");
    const restored = { ...before.document, calendar: before.document.calendars["2026-09-06"] };
    await waitFor(() => expect(read().document).toEqual(restored));
    expect(read().past).toEqual(before.past);
    expect(read().future).toHaveLength(1);
    command("Redo");
    await waitFor(() => expect(read().document).toEqual(after.document));
  });
}
it.each([false, true])("keeps the original appointment phrase's exact calendar interpretation with occupied=%s", (occupied) => {
  const initial = createFreshLifeSnapshot("2026-09-05");
  const utterance = seeds.find(({ id }) => id === "curated-0336")!.utterance;
  const parsed = interpretTranscript(utterance, "2026-09-05");
  expect(parsed.status).toBe("ready");
  if (parsed.status !== "ready") throw new Error("Expected explicit time and calendar title");
  expect(parsed.request.actions).toEqual([expect.objectContaining({ type: "create", title: "doctor's appointment", durationMinutes: 30, destination: { type: "absolute", minutes: 960, date: "tomorrow" } })]);
  const plan = structuredClone(initial.document.calendar);
  plan.deferred = occupied ? structuredClone(initial.document.calendars["2026-09-06"]!.events) : [];
  const before = structuredClone(plan);
  const result = executeRequest(plan, parsed.request);
  expect(plan).toEqual(before);
  expect(result.status).toBe(occupied ? "conflict" : "success");
  if (result.status === "success") {
    expect(result.plan.events).toEqual(before.events);
    expect(result.plan.deferred).toEqual([expect.objectContaining({ title: "Doctor's appointment", dateKey: "2026-09-06", start: 960, end: 990 })]);
  }
});
