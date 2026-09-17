import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FlowEnvironmentApp } from "./FlowEnvironmentApp";
import { FakeRecognitionAdapter } from "../features/day-planner/voice/fakeRecognition";
import { LIFE_STORAGE_KEY } from "../domain/life-storage";
import { pageFocusClock, pageFocusFixture } from "../test/pageFocusFixture";
import * as media from "../features/studio/mediaRepository";
import type { LifeSnapshot } from "../domain/life-model";

const read = () => JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
const main = () => document.querySelector<HTMLElement>("[data-primary-content-rect]")!;
const scroll = vi.fn(function (this: HTMLElement, options: ScrollToOptions) { this.scrollTop = options.top ?? this.scrollTop; this.dispatchEvent(new Event("scroll")); });
beforeEach(() => {
  localStorage.clear(); localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(pageFocusFixture())); window.history.replaceState({}, "", "/today"); scroll.mockClear();
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: scroll });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const isMain = this.hasAttribute("data-primary-content-rect"), task = this.closest<HTMLElement>("[data-page-task]");
    const top = isMain ? 100 : task ? 700 + (this === task ? 0 : 70) - (main()?.scrollTop ?? 0) : 150;
    const height = isMain ? 500 : this.matches("button,input,textarea,audio") ? 48 : 220;
    return { top, bottom: top + height, left: 0, right: 800, width: 800, height, x: 0, y: top, toJSON: () => ({}) };
  });
  vi.spyOn(media, "getStudioMedia").mockResolvedValue(new Blob(["audio bytes"])); vi.spyOn(media, "removeOrphanedStudioMedia").mockResolvedValue(undefined);
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:focus-audio" }); Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => undefined });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined); vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());
async function mount() {
  const adapter = new FakeRecognitionAdapter(), view = render(<FlowEnvironmentApp now={pageFocusClock} recognitionAdapter={adapter} />); let sequence = 0;
  await waitFor(() => expect(adapter.startCount).toBe(1));
  const command = async (text: string, source: "typed" | "voice" = "typed") => {
    if (source === "voice") await act(async () => adapter.emitFinal(text, `page-focus-${++sequence}`));
    else await act(async () => { if (!screen.queryByLabelText("Tell Flow what to change")) fireEvent.click(screen.getByRole("button", { name: "Open Flow command" })); const field = screen.getByLabelText("Tell Flow what to change"); fireEvent.change(field, { target: { value: text } }); fireEvent.submit(field.closest("form")!); });
    await waitFor(() => { expect(document.querySelector("[data-last-transcript]")).toHaveAttribute("data-last-transcript", text); expect(document.querySelector("[data-flow-feedback]")).toHaveAttribute("data-feedback-transcript", text); expect(document.querySelector("[data-flow-feedback]")).not.toHaveAttribute("data-feedback-phase", "understanding"); });
  };
  return { ...view, command };
}
function expectTaskVisible(kind: string) {
  const task = document.querySelector<HTMLElement>(`[data-page-task="${kind}"]`)!, bounds = main().getBoundingClientRect();
  expect(task.getBoundingClientRect().top).toBeGreaterThanOrEqual(bounds.top);
  const control = task.querySelector("button,input,textarea,audio")!; expect(control.getBoundingClientRect().bottom).toBeLessThanOrEqual(bounds.bottom);
}
it.each(["typed", "voice", "pointer", "reload"] as const)("opens Friends on its usable directory through %s without a domain mutation", async (mode) => {
  if (mode === "pointer") window.history.replaceState({}, "", "/people/person/sarah");
  if (mode === "reload") window.history.replaceState({}, "", "/people");
  const { command } = await mount(), before = read();
  if (mode === "pointer") fireEvent.click(screen.getByRole("button", { name: "← All friends" }));
  else if (mode !== "reload") await command("Open Friends", mode);
  await screen.findByTestId("friends-space"); await waitFor(() => expectTaskVisible("directory"));
  const form = screen.getByLabelText("Friend name").closest("form")!, secondary = screen.getByRole("navigation", { name: "Friends collections" });
  expect(form.compareDocumentPosition(secondary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); expect(read()).toEqual(before);
});
it("opens a long conversation at its identified composer and Back restores the original entry position", async () => {
  window.history.replaceState({}, "", "/people"); await mount(); main().scrollTop = 340; fireEvent.scroll(main());
  fireEvent.click(screen.getByRole("button", { name: /Sarah.*open commitments/ }));
  const input = await screen.findByLabelText("Message to Sarah"); await waitFor(() => expectTaskVisible("conversation"));
  expect(input.compareDocumentPosition(screen.getByText("Earlier conversation 0")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Go back" }));
  await screen.findByLabelText("Friend name"); await waitFor(() => expect(main().scrollTop).toBe(340));
});
it.each(["typed", "voice"] as const)("same-route Memory selection binds subsequent %s editing, while media controls preserve manual scrolling", async (mode) => {
  window.history.replaceState({}, "", "/memories"); const { command } = await mount();
  await command("Open memory Morning", mode); await waitFor(() => expectTaskVisible("memory"));
  main().scrollTop = 1400; fireEvent.scroll(main()); fireEvent.change(screen.getByLabelText("Current memory"), { target: { value: "memory-1" } });
  await waitFor(() => expect(screen.getByRole("heading", { name: "Evening" })).toBeInTheDocument()); await waitFor(() => expectTaskVisible("memory"));
  const before = read(); await command("Larger", mode); await waitFor(() => expect(read().document.studio.memories[1]!.textScale).toBeGreaterThan(1)); expect(read().document.studio.memories[0]!.textScale).toBe(1);
  main().scrollTop = 1100; fireEvent.scroll(main()); scroll.mockClear(); const key = window.history.state.flowPageKey;
  await command("Pause", mode); await command("Play", mode);
  await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalled());
  expect(scroll).not.toHaveBeenCalled(); expect(main().scrollTop).toBe(1100); expect(window.history.state.flowPageKey).toBe(key); expect(read().past).toHaveLength(before.past.length + 1);
});
it("manual voice scrolling and unrelated capture leave the Friends viewport alone", async () => {
  window.history.replaceState({}, "", "/people"); const { command } = await mount(); Object.defineProperty(main(), "clientHeight", { configurable: true, value: 500 });
  const initial = main().scrollTop; await command("Scroll down", "voice"); await command("Scroll down", "voice"); expect(main().scrollTop).toBe(initial + 450);
  scroll.mockClear(); await command("Capture a note for later", "voice"); expect(scroll).not.toHaveBeenCalled(); expect(main().scrollTop).toBe(initial + 450);
});
it("keeps Friends collections before a populated directory and opens group/voice panels without traversing it", async () => {
  const snapshot = read(); for (let index = 0; index < 30; index++) snapshot.document.people.push({ ...snapshot.document.people[0]!, id: `person-${index}`, name: `Person ${index}`, displayName: `Person ${index}` });
  localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(snapshot)); window.history.replaceState({}, "", "/people"); const { command } = await mount();
  const tabs = screen.getByRole("navigation", { name: "Friends collections" }); expect(tabs.compareDocumentPosition(screen.getByRole("button", { name: /Person 29.*open commitments/ })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  scroll.mockClear(); fireEvent.click(screen.getByRole("button", { name: /^Groups$/ })); await screen.findByLabelText("Group name"); expectTaskVisible("collections"); expect(scroll).not.toHaveBeenCalled(); expect(screen.queryByRole("button", { name: /Person 29.*open commitments/ })).not.toBeInTheDocument();
  await command("Show voice notes", "voice"); expect(screen.getByText("No voice notes yet.")).toBeInTheDocument(); expectTaskVisible("collections"); expect(read().past).toHaveLength(0);
});
it.each([false, true])("keeps the Journal entry selector alongside the active editor with quiet mode %s", async (quiet) => {
  const snapshot = read(); snapshot.document.studio.workspace.quiet = quiet; localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(snapshot));
  window.history.replaceState({}, "", "/journal"); await mount(); expectTaskVisible("journal");
  expect(screen.getByLabelText("Journal text").closest("article")!.classList.contains("lg:col-start-2")).toBe(!quiet);
  fireEvent.change(screen.getByLabelText("Current journal entry"), { target: { value: "entry-1" } });
  await waitFor(() => expect(screen.getByLabelText("Journal text")).toHaveValue("Evening words.")); expectTaskVisible("journal"); expect(read().past).toHaveLength(0);
});
