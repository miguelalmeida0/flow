import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it } from "vitest";
import { FlowEnvironmentApp } from "./FlowEnvironmentApp";
import { LIFE_STORAGE_KEY } from "../domain/life-storage";
import type { LifeSnapshot } from "../domain/life-model";
import { acceptanceClock, acceptanceFixture } from "../features/voice-intelligence/acceptanceFixtures";
import { FakeRecognitionAdapter } from "../features/day-planner/voice/fakeRecognition";

beforeEach(() => { localStorage.clear(); window.history.replaceState({}, "", "/journal"); });
it.each(["typed", "voice"] as const)("%s identical edits preserve timestamps, redo and history after clock advancement", async (mode) => {
  const before = acceptanceFixture("journal-editing").snapshot;
  before.document.studio.journalEntries[0]!.updatedAt = "2026-01-01T00:00:00.000Z";
  before.past = [{ document: structuredClone(before.document) }]; before.future = [{ document: structuredClone(before.document) }];
  localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(before));
  let now = acceptanceClock; let sequence = 0;
  const adapter = new FakeRecognitionAdapter(); render(<FlowEnvironmentApp now={() => now} recognitionAdapter={adapter}/>);
  const read = () => JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
  async function command(text: string) {
    const prior = window.__FLOW_COMMAND_TRACE__?.interpretedAt;
    if (mode === "typed") {
      if (!screen.queryByLabelText("Tell Flow what to change")) fireEvent.click(screen.getByRole("button", { name: "Open Flow command" }));
      const field = screen.getByLabelText("Tell Flow what to change"); fireEvent.change(field, { target: { value: text } }); fireEvent.submit(field.closest("form")!);
    } else {
      if (!adapter.startCount) { fireEvent.click(screen.getByRole("button", { name: "Start Flow Live" })); await waitFor(() => expect(adapter.startCount).toBe(1)); }
      act(() => adapter.emitFinal(text, `noop-${++sequence}`));
    }
    await waitFor(() => {
      expect(window.__FLOW_COMMAND_TRACE__?.interpretedAt).not.toBe(prior);
      expect(window.__FLOW_COMMAND_TRACE__?.transcript).toBe(text);
      if (text.startsWith("Rename")) expect(window.__FLOW_COMMAND_TRACE__?.actions).toEqual([{ type: "journal.update", entryId: "J1", patch: { title: text.slice("Rename this journal to ".length) } }]);
      const feedback = document.querySelector("[data-flow-feedback]");
      expect(feedback).toHaveAttribute("data-feedback-transcript", text);
      expect(feedback).toHaveAttribute("data-feedback-phase", "completed");
      expect(feedback).toHaveAttribute("data-pending-change", "false");
    });
  }
  await command("Rename this journal to My Journey"); expect(read()).toEqual(before);
  now = new Date(now.getTime() + 60000);
  await command("Rename this journal to My Journey"); expect(read()).toEqual(before);
  await command("Rename this journal to A changed title");
  const changed = structuredClone(before.document);
  Object.assign(changed.studio.journalEntries[0]!, { title: "A changed title", updatedAt: now.toISOString() });
  expect(read().document).toEqual(changed); expect(read().past).toEqual([...before.past, { document: before.document }]); expect(read().future).toEqual([]);
  // Storage intentionally compacts duplicate before/after documents out of
  // transaction records; the exact documents are asserted in history above.
  expect(read().lastTransaction).toMatchObject({ actionTypes: ["journal.update"], transcript: "Rename this journal to A changed title", at: now.toISOString() });
  await command("Undo"); const undone = read(); expect(undone.document).toEqual(before.document);
  expect(undone.future).toHaveLength(1); expect(undone.future[0]!.document).toEqual(changed);
  expect(undone.future[0]!.lastTransaction).toMatchObject({ actionTypes: ["journal.update"], transcript: "Rename this journal to A changed title", at: now.toISOString() });
  now = new Date(now.getTime() + 60000);
  await command("Rename this journal to My Journey"); expect(read()).toEqual(undone);
  await command("Redo"); expect(read().document).toEqual(changed); expect(read().past).toEqual([...before.past, { document: before.document }]);
});
