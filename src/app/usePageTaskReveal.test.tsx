import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { pageTaskEntity, taskScrollTop, usePageTaskReveal, type PageNavigation } from "./usePageTaskReveal";
import { pageFocusFixture } from "../test/pageFocusFixture";
import { executeViewportScroll } from "../shared/command/viewportCapability";

const rect = (top: number, height: number) => ({ top, bottom: top + height, left: 0, right: 800, width: 800, height, x: 0, y: top, toJSON: () => ({}) } as DOMRect);
const frames = new Map<number, FrameRequestCallback>(); let sequence = 0;
const scroll = vi.fn(function (this: HTMLElement, options: ScrollToOptions) { this.scrollTop = options.top ?? this.scrollTop; this.scrollLeft = options.left ?? this.scrollLeft; this.dispatchEvent(new Event("scroll")); });
beforeEach(() => {
  frames.clear(); scroll.mockClear(); window.history.replaceState({}, "", "/people");
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) { return this.hasAttribute("data-primary-content-rect") ? rect(100, 500) : rect(Number(this.dataset.top ?? this.closest<HTMLElement>("[data-top]")?.dataset.top ?? 700), this.tagName === "BUTTON" ? 44 : 180); });
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: scroll });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function flush() { await act(async () => { const current = [...frames.values()]; frames.clear(); current.forEach((callback) => callback(0)); }); }
function Harness({ entity, navigation = { id: 0, kind: "open" }, top = 700, reduced = false, present = true, left = 0 }: { entity?: string; navigation?: PageNavigation; top?: number; reduced?: boolean; present?: boolean; left?: number }) {
  usePageTaskReveal("people", entity, navigation, reduced);
  return <main data-primary-content-rect ref={(node) => { if (node && left) node.scrollLeft = left; }}><div data-space-shell="people">{present && <button data-life-entity-id={entity} data-top="300">Earlier card</button>}<div data-page-task="body" data-top="200">Page body</div>{present && <section data-page-task="conversation" data-task-entity-id={entity} data-top={top}><h2>Message to Sarah</h2><button data-top={top + 60}>Review message</button><textarea aria-label="Message" /></section>}</div></main>;
}
it("measures the task heading and first action against the actual main viewport", async () => {
  expect(taskScrollTop(rect(100, 500), rect(160, 900), 230, rect(250, 44))).toBeUndefined();
  expect(taskScrollTop(rect(100, 500), rect(700, 200), 230, rect(760, 44))).toBe(814);
  expect(taskScrollTop(rect(100, 300), rect(700, 1400), 230, rect(1450, 44))).toBe(1564);
});
it("prioritizes the composer over an earlier entity card, keeps horizontal position and never focuses an input", async () => {
  render(<Harness entity="sarah" left={23} />);
  const input = document.querySelector("textarea")!; input.focus(); await flush();
  expect(scroll).toHaveBeenLastCalledWith({ top: 584, left: 23, behavior: "auto" }); expect(document.activeElement).toBe(input);
});
it("does not jump when the task and first action already fit", async () => { render(<Harness entity="sarah" top={180} />); await flush(); expect(scroll).not.toHaveBeenCalled(); });
it.each(["wheel", "touchstart", "pointerdown", "key", "voice"])("manual %s cancels the pending reveal", async (kind) => {
  render(<Harness entity="sarah" present={false} />); const main = document.querySelector("main")!;
  if (kind === "key") fireEvent.keyDown(document, { key: "PageDown" });
  else if (kind === "voice") { executeViewportScroll({ type: "scroll", direction: "down", fraction: 0.45 }, true); scroll.mockClear(); }
  else fireEvent(main, new Event(kind));
  await flush(); expect(scroll).not.toHaveBeenCalled();
});
it("same entity rerenders and reduced preference changes preserve manual orientation and input selection", async () => {
  const view = render(<Harness entity="sarah" />); await flush(); const input = document.querySelector("textarea")!; input.focus(); input.value = "My words"; input.setSelectionRange(3, 6); scroll.mockClear();
  view.rerender(<Harness entity="sarah" reduced />); await flush(); expect(scroll).not.toHaveBeenCalled(); expect(input.selectionStart).toBe(3); expect(input.value).toBe("My words");
});
it("restores an entry-specific Back position, then lets a new same-route entity take priority", async () => {
  const view = render(<Harness entity="sarah" />); await flush();
  window.history.replaceState({ flowPageKey: "old-entry", flowPagePosition: { top: 325, left: 9 } }, "", "/people");
  view.rerender(<Harness entity="john" navigation={{ id: 1, kind: "back" }} />); await flush(); expect(scroll).toHaveBeenLastCalledWith({ top: 325, left: 9, behavior: "instant" });
  scroll.mockClear(); view.rerender(<Harness entity="sarah" top={900} navigation={{ id: 1, kind: "back" }} />); await flush(); expect(scroll).toHaveBeenCalledWith({ top: 1109, left: 9, behavior: "auto" });
});
it("a newer navigation cancels the old frame and reduced motion reveals the new target immediately", async () => {
  const view = render(<Harness entity="sarah" present={false} />); view.rerender(<Harness entity="john" top={850} navigation={{ id: 1, kind: "open" }} reduced />); await flush();
  expect(scroll).toHaveBeenCalledTimes(1); expect(scroll).toHaveBeenLastCalledWith({ top: 734, left: 0, behavior: "instant" });
});
it("waits only for a bounded missing destination and reveals it when it mounts", async () => {
  const view = render(<Harness entity="sarah" present={false} />); expect(scroll).not.toHaveBeenCalled();
  view.rerender(<Harness entity="sarah" />); await flush(); expect(scroll).toHaveBeenCalledTimes(1);
  view.rerender(<Harness entity="missing" present={false} />); scroll.mockClear();
  for (let index = 0; index < 25; index++) await flush();
  expect(frames.size).toBe(0); expect(scroll.mock.calls.length).toBeLessThanOrEqual(1);
});
it("ignores another person's stale note and unrelated focused entities on Friends", () => {
  const { document } = pageFocusFixture();
  document.friends!.voiceNotes.push({ id: "sarah-note", kind: "voice-note", recipient: { kind: "person", id: "sarah" }, title: "To Sarah", text: "", status: "draft", recordingState: "idle", recordingDurationMs: 0, transcriptSegments: [], markers: [], createdAt: "2026-09-12", updatedAt: "2026-09-12" });
  expect(pageTaskEntity(document, "people", { route: "people", focusedPersonId: "john", activeVoiceNoteId: "sarah-note" })).toBe("john");
  expect(pageTaskEntity(document, "people", { route: "people", activeVoiceNoteId: "sarah-note" }, "unrelated-capture")).toBeUndefined();
});
