import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FlowEnvironmentApp } from "./FlowEnvironmentApp";
import { acceptanceClock, acceptanceFixture } from "../features/voice-intelligence/acceptanceFixtures";
import { FakeRecognitionAdapter } from "../features/day-planner/voice/fakeRecognition";
import { LIFE_STORAGE_KEY } from "../domain/life-storage";
import { deleteStudioMedia, putStudioMedia } from "../features/studio/mediaRepository";

beforeEach(() => {
  localStorage.clear(); window.history.replaceState({}, "", "/journal");
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:journal-original") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});
afterEach(() => vi.restoreAllMocks());
async function setup() {
  const before = acceptanceFixture("memory-source").snapshot;
  before.past = [{ document: structuredClone(before.document) }]; before.future = [{ document: structuredClone(before.document) }];
  const original = new Blob([new Uint8Array([26, 69, 223, 163, 0, 255, 17])], { type: "audio/webm" });
  await putStudioMedia("A1", original);
  localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(before));
  const adapter = new FakeRecognitionAdapter(); render(<FlowEnvironmentApp now={() => acceptanceClock} recognitionAdapter={adapter}/>);
  async function command(text: string, mode: "typed" | "voice") {
    if (mode === "typed") {
      if (!screen.queryByLabelText("Tell Flow what to change")) fireEvent.click(screen.getByRole("button", { name: "Open Flow command" }));
      const field = screen.getByLabelText("Tell Flow what to change"); fireEvent.change(field, { target: { value: text } }); fireEvent.submit(field.closest("form")!);
    } else {
      if (!adapter.startCount) { fireEvent.click(screen.getByRole("button", { name: "Start Flow Live" })); await waitFor(() => expect(adapter.startCount).toBe(1)); }
      act(() => adapter.emitFinal(text, `native-${text}`));
    }
    await waitFor(() => expect(document.querySelector("[data-last-transcript]")).toHaveAttribute("data-last-transcript", text));
  }
  function unchanged() {
    const after = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!);
    expect(after.document).toEqual(before.document); expect(after.past).toEqual(before.past); expect(after.future).toEqual(before.future);
  }
  return { command, original, unchanged };
}

it.each(["typed", "voice"] as const)("binds a drawing continuation without inventing strokes through %s", async (mode) => {
  const view = await setup(); await view.command("Draw on this journal entry", mode);
  const continuation = await screen.findByRole("button", { name: "Focus sketch" });
  view.unchanged();
  fireEvent.click(continuation);
  await waitFor(() => expect(screen.getByRole("img", { name: "Freehand journal annotation" })).toHaveFocus());
  view.unchanged();
});
it.each(["typed", "voice"] as const)("requests the exact original audio bytes only after its %s download continuation", async (mode) => {
  const view = await setup();
  const clicked = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  await view.command("Download the original recording", mode);
  const continuation = await screen.findByRole("button", { name: "Download audio" });
  expect(clicked).not.toHaveBeenCalled(); view.unchanged();
  vi.mocked(URL.createObjectURL).mockClear(); fireEvent.click(continuation);
  await waitFor(() => expect(clicked).toHaveBeenCalledOnce());
  expect(URL.createObjectURL).toHaveBeenCalledWith(view.original);
  expect(clicked.mock.instances[0]).toHaveProperty("download", "Original voice.webm");
  expect(document.querySelector("[data-command-feedback]")?.textContent ?? document.body.textContent).toContain("download was requested");
  view.unchanged();
});
it("requests the identical original Blob from the visible pointer download control", async () => {
  const view = await setup(); const clicked = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  fireEvent.click(screen.getByRole("button", { name: "Download original audio" }));
  await waitFor(() => expect(clicked).toHaveBeenCalledOnce());
  expect(URL.createObjectURL).toHaveBeenCalledWith(view.original);
  expect(clicked.mock.instances[0]).toHaveProperty("download", "Original voice.webm"); view.unchanged();
});
it.each(["typed", "voice"] as const)("reports missing original bytes without inventing a download through %s", async (mode) => {
  const view = await setup(); await deleteStudioMedia("A1");
  const clicked = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  await view.command("Download the original recording", mode);
  fireEvent.click(await screen.findByRole("button", { name: "Download audio" }));
  await waitFor(() => expect(document.body.textContent).toContain("The original recording is unavailable on this device. No download was requested."));
  expect(clicked).not.toHaveBeenCalled(); view.unchanged();
});
