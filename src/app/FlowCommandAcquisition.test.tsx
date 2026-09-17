import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";
import { FlowEnvironmentApp } from "./FlowEnvironmentApp";
import { LIFE_STORAGE_KEY } from "../domain/life-storage";
import type { LifeSnapshot } from "../domain/life-model";
import { acceptanceClock, acceptanceFixture } from "../features/voice-intelligence/acceptanceFixtures";
import { FakeRecognitionAdapter } from "../features/day-planner/voice/fakeRecognition";

it.each(["typed", "voice"] as const)("binds the %s command's selected target before the document lock is available", async (mode) => {
  localStorage.clear(); window.history.replaceState({}, "", "/today");
  const before = acceptanceFixture("calendar-reference").snapshot;
  localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(before));
  const descriptor = Object.getOwnPropertyDescriptor(navigator, "locks"), queued: (() => unknown)[] = [];
  Object.defineProperty(navigator, "locks", { configurable: true, value: { request: (_name: string, _options: unknown, callback: () => unknown) => new Promise((resolve) => queued.push(() => resolve(callback()))) } });
  try {
    const adapter = new FakeRecognitionAdapter(); render(<FlowEnvironmentApp now={() => acceptanceClock} recognitionAdapter={adapter}/>);
    fireEvent.click(document.querySelector('button[data-event-id="E1"]')!);
    const text = "Rename this event to Original target";
    if (mode === "typed") {
      if (!screen.queryByLabelText("Tell Flow what to change")) fireEvent.click(screen.getByRole("button", { name: "Open Flow command" }));
      const input = screen.getByLabelText("Tell Flow what to change"); fireEvent.change(input, { target: { value: text } }); fireEvent.submit(input.closest("form")!);
    } else {
      fireEvent.click(screen.getByRole("button", { name: "Start Flow Live" })); await waitFor(() => expect(adapter.startCount).toBe(1));
      act(() => adapter.emitFinal(text, "bound-rename"));
    }
    await waitFor(() => expect(queued).toHaveLength(1));
    fireEvent.click(document.querySelector('button[data-event-id="E2"]')!);
    await act(async () => { queued.shift()!(); });
    await waitFor(() => expect((JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot).past).toHaveLength(1));
    const after = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot, expected = structuredClone(before.document);
    expected.calendar.events[0]!.title = "Original target"; expected.calendars["2026-09-08"]!.events[0]!.title = "Original target";
    expect(after.document).toEqual(expected); expect(after.past[0]!.document).toEqual(before.document); expect(after.future).toEqual([]);
    expect(window.__FLOW_COMMAND_TRACE__?.contextUsed.selected?.id).toBe("E1");
  } finally { cleanup(); if (descriptor) Object.defineProperty(navigator, "locks", descriptor); else Reflect.deleteProperty(navigator, "locks"); }
});
