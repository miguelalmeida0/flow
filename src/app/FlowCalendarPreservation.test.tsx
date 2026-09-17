import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it } from "vitest";
import { FlowEnvironmentApp } from "./FlowEnvironmentApp";
import { LIFE_STORAGE_KEY } from "../domain/life-storage";
import type { LifeSnapshot } from "../domain/life-model";
import { acceptanceClock, acceptanceFixture } from "../features/voice-intelligence/acceptanceFixtures";
import { expectedDocument, type SemanticExpectation } from "../features/voice-intelligence/semanticExpectation";
import { FakeRecognitionAdapter } from "../features/day-planner/voice/fakeRecognition";

beforeEach(() => { localStorage.clear(); window.history.replaceState({}, "", "/today"); });
const cases: { text: string; oracle: SemanticExpectation }[] = [
  { text: "Move Deep Work to four; keep the scheduling unchanged", oracle: { historyDelta: 0 } },
  { text: "Rename Deep Work to Blue, but leave its title unchanged", oracle: { historyDelta: 0 } },
  { text: "Move Deep Work to tomorrow and don't move Deep Work", oracle: { historyDelta: 0 } },
  { text: "Make this green; keep its organizer unchanged", oracle: { historyDelta: 0 } },
  { text: "Make the selected event green and critical; keep the scheduling unchanged", oracle: { historyDelta: 1, eventChanges: [{ id: "E1", patch: { color: "green", importance: "critical" } }] } },
  { text: "Move Deep Work to tomorrow; keep its duration unchanged", oracle: { historyDelta: 1, datedEventChanges: [{ id: "E2", sourceDate: "2026-09-08", destinationDate: "2026-09-09", patch: {} }] } },
];
for (const mode of ["typed", "voice"] as const) it.each(cases)(`${mode} preserves the complete transaction contract: $text`, async ({ text, oracle }) => {
  const before = acceptanceFixture("calendar-reference").snapshot;
  before.past = [{ document: structuredClone(before.document) }]; before.future = [{ document: structuredClone(before.document) }];
  localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(before));
  const adapter = new FakeRecognitionAdapter(); render(<FlowEnvironmentApp now={() => acceptanceClock} recognitionAdapter={adapter}/>);
  fireEvent.click(document.querySelector('button[data-event-id="E1"]')!);
  const read = () => JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
  async function command(value: string) {
    if (mode === "typed") {
      if (!screen.queryByLabelText("Tell Flow what to change")) fireEvent.click(screen.getByRole("button", { name: "Open Flow command" }));
      const field = screen.getByLabelText("Tell Flow what to change"); fireEvent.change(field, { target: { value } }); fireEvent.submit(field.closest("form")!);
    } else {
      if (!adapter.startCount) { fireEvent.click(screen.getByRole("button", { name: "Start Flow Live" })); await waitFor(() => expect(adapter.startCount).toBe(1)); }
      act(() => adapter.emitFinal(value, `preservation-${value}`));
    }
    await waitFor(() => expect(document.querySelector("[data-last-transcript]")).toHaveAttribute("data-last-transcript", value));
  }
  const expected = expectedDocument(before.document, oracle, acceptanceClock.toISOString());
  await command(text);
  await waitFor(() => {
    const feedback = document.querySelector("[data-flow-feedback]");
    expect(feedback).toHaveAttribute("data-feedback-transcript", text);
    expect(feedback).toHaveAttribute("data-feedback-phase", oracle.historyDelta ? "completed" : "error");
    expect(feedback).toHaveAttribute("data-pending-change", "false");
  });
  await waitFor(() => expect(read().document).toEqual(expected));
  expect(read().past).toEqual(oracle.historyDelta ? [...before.past, { document: before.document }] : before.past);
  expect(read().future).toEqual(oracle.historyDelta ? [] : before.future);
  if (!oracle.historyDelta) return;
  await command("Undo"); await waitFor(() => expect(read().document).toEqual(before.document));
  expect(read().past).toEqual(before.past);
  await command("Redo"); await waitFor(() => expect(read().document).toEqual(expected));
  expect(read().past).toEqual([...before.past, { document: before.document }]); expect(read().future).toEqual([]);
});
