import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { FlowEnvironmentApp } from "./FlowEnvironmentApp";
import { createLifeSnapshot, LIFE_STORAGE_KEY } from "../domain/life-storage";
import type { LifeSnapshot } from "../domain/life-model";
import { FakeRecognitionAdapter } from "../features/day-planner/voice/fakeRecognition";

const clock = () => new Date("2026-09-08T10:00:00");
const saved = () => JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
function fixture() {
  const snapshot = createLifeSnapshot("2026-09-08"), metadata = { createdAt: clock().toISOString(), updatedAt: clock().toISOString() };
  snapshot.document.people = [{ id: "P1", kind: "person", name: "Maya", ...metadata }, { id: "P2", kind: "person", name: "Daniel", ...metadata }];
  snapshot.document.commitments = [
    { id: "C1", kind: "commitment", personId: "P1", title: "Send sketch", direction: "i-owe", status: "open", ...metadata },
    { id: "C2", kind: "commitment", personId: "P2", title: "Invoice copy", direction: "waiting-on", status: "open", ...metadata },
    { id: "C3", kind: "commitment", personId: "P1", title: "Return keys", direction: "i-owe", status: "completed", ...metadata },
    { id: "C4", kind: "commitment", personId: "P2", title: "Workshop dates", direction: "next-conversation", status: "open", ...metadata },
    { id: "C5", kind: "commitment", personId: "P1", title: "Invoice confirmation", direction: "waiting-on", status: "deferred", deferredUntil: "2026-09-10", ...metadata },
  ];
  localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(snapshot)); return snapshot;
}
const matchedIds = () => [...document.querySelectorAll('[data-testid="people-space"] [data-commitment-id]')]
  .filter((card) => card.querySelector('[data-action-id="commitments.select"]'))
  .map((card) => card.getAttribute("data-commitment-id"));
function setup() {
  const adapter = new FakeRecognitionAdapter();
  const view = render(<FlowEnvironmentApp now={clock} recognitionAdapter={adapter}/>);
  const command = async (text: string, mode: "typed" | "voice") => {
    if (mode === "typed") {
      if (!screen.queryByLabelText("Tell Flow what to change")) fireEvent.click(screen.getByRole("button", { name: "Open Flow command" }));
      const input = screen.getByLabelText("Tell Flow what to change"); fireEvent.change(input, { target: { value: text } }); fireEvent.submit(input.closest("form")!);
    } else {
      if (!adapter.startCount) { fireEvent.click(screen.getByRole("button", { name: "Start Flow Live" })); await waitFor(() => expect(adapter.startCount).toBe(1)); }
      act(() => adapter.emitFinal(text, `view-${text}`));
    }
    await waitFor(() => expect(document.querySelector("[data-last-transcript]")).toHaveAttribute("data-last-transcript", text));
    await waitFor(() => expect(document.querySelector("[data-flow-feedback]")).not.toHaveAttribute("data-feedback-phase", "understanding"));
  };
  return { ...view, command };
}
beforeEach(() => { localStorage.clear(); window.history.replaceState({}, "", "/people?view=commitments"); });

describe("rendered commitment view capability parity", () => {
  it.each(["Search commitments for Maya", "Capture Keep the original request"])("retains acquisition ordering for queued request: %s", async (olderRequest) => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, "locks"), queued: (() => unknown)[] = [];
    Object.defineProperty(navigator, "locks", { configurable: true, value: { request: (_name: string, _options: unknown, callback: () => unknown) => new Promise((resolve) => { queued.push(() => resolve(callback())); }) } });
    try {
      const before = fixture(), view = setup();
      const submit = (text: string) => {
        const command = screen.getByLabelText("Tell Flow what to change"); fireEvent.change(command, { target: { value: text } }); fireEvent.submit(command.closest("form")!);
      };
      submit(olderRequest); await waitFor(() => expect(queued).toHaveLength(1));
      if (olderRequest.startsWith("Search")) {
        submit("Search commitments for Daniel");
        await act(async () => { queued.shift()!(); });
        await waitFor(() => expect(queued).toHaveLength(1));
        await act(async () => { queued.shift()!(); });
        expect(screen.getByRole("textbox", { name: "Search commitments" })).toHaveValue("Daniel");
        expect(matchedIds()).toEqual(["C2", "C4"]); expect(saved().document).toEqual(before.document); expect(saved().past).toEqual([]);
      } else {
        fireEvent.change(screen.getByRole("textbox", { name: "Search commitments" }), { target: { value: "Daniel" } });
        await act(async () => { queued.shift()!(); });
        await waitFor(() => expect(saved().document.captures).toHaveLength(1));
        expect(saved().document.captures[0]?.title).toBe("Keep the original request");
        expect(saved().document.commitments).toEqual(before.document.commitments); expect(saved().past).toHaveLength(1);
      }
      view.unmount();
    } finally { cleanup(); if (descriptor) Object.defineProperty(navigator, "locks", descriptor); else Reflect.deleteProperty(navigator, "locks"); }
  });
  it.each(["typed", "voice"] as const)("does not let an older queued %s search overwrite a newer pointer search", async (mode) => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, "locks");
    const queued: (() => unknown)[] = [];
    Object.defineProperty(navigator, "locks", { configurable: true, value: { request: (_name: string, _options: unknown, callback: () => unknown) => new Promise((resolve) => { queued.push(() => resolve(callback())); }) } });
    try {
      const before = fixture(), adapter = new FakeRecognitionAdapter();
      const view = render(<FlowEnvironmentApp now={clock} recognitionAdapter={adapter}/>);
      if (mode === "typed") {
        if (!screen.queryByLabelText("Tell Flow what to change")) fireEvent.click(screen.getByRole("button", { name: "Open Flow command" }));
        const command = screen.getByLabelText("Tell Flow what to change"); fireEvent.change(command, { target: { value: "Search commitments for Maya" } }); fireEvent.submit(command.closest("form")!);
      } else {
        fireEvent.click(screen.getByRole("button", { name: "Start Flow Live" })); await waitFor(() => expect(adapter.startCount).toBe(1));
        act(() => adapter.emitFinal("Search commitments for Maya", "old-search"));
      }
      await waitFor(() => expect(queued).toHaveLength(1));
      const search = screen.getByRole("textbox", { name: "Search commitments" }); fireEvent.change(search, { target: { value: "Daniel" } });
      expect(search).toHaveValue("Daniel"); const feedback = document.querySelector("[data-flow-feedback]")?.textContent;
      await act(async () => { queued.shift()!(); });
      expect(search).toHaveValue("Daniel"); expect(matchedIds()).toEqual(["C2", "C4"]);
      expect(document.querySelector("[data-flow-feedback]")?.textContent).toBe(feedback);
      expect(saved().document).toEqual(before.document); expect(saved().past).toEqual([]); view.unmount();
    } finally { cleanup(); if (descriptor) Object.defineProperty(navigator, "locks", descriptor); else Reflect.deleteProperty(navigator, "locks"); }
  });
  it.each(["typed", "voice"] as const)("opens an exact filtered collection from Home through %s without touching nonempty history", async (mode) => {
    window.history.replaceState({}, "", "/"); const before = fixture();
    before.past = [{ document: structuredClone(before.document) }]; before.future = [{ document: structuredClone(before.document) }];
    localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(before)); const view = setup();
    await view.command("Show waiting-on commitments", mode);
    await waitFor(() => expect(matchedIds()).toEqual(["C2", "C5"]));
    expect(window.location.pathname + window.location.search).toBe("/people?view=commitments");
    expect(window.__FLOW_COMMAND_TRACE__?.intent).toEqual({ type: "commitment-view", patch: { lens: "waiting-on" } });
    expect(window.__FLOW_COMMAND_TRACE__?.actions).toEqual([]); expect(window.__FLOW_COMMAND_TRACE__?.entities).toEqual(["C2", "C5"]);
    expect(saved().document).toEqual(before.document); expect(saved().past).toEqual(before.past); expect(saved().future).toEqual(before.future);
  });
  it("keeps pointer search immediately editable while document Web Locks are occupied", () => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, "locks");
    Object.defineProperty(navigator, "locks", { configurable: true, value: { request: () => new Promise(() => undefined) } });
    try {
      const before = fixture(); const view = setup();
      const search = screen.getByRole("textbox", { name: "Search commitments" });
      fireEvent.change(search, { target: { value: "M" } }); expect(search).toHaveValue("M");
      fireEvent.change(search, { target: { value: "Maya" } }); expect(search).toHaveValue("Maya");
      expect(matchedIds()).toEqual(["C1", "C5"]); expect(saved().document).toEqual(before.document); expect(saved().past).toEqual([]);
      view.unmount();
    } finally {
      cleanup(); if (descriptor) Object.defineProperty(navigator, "locks", descriptor); else Reflect.deleteProperty(navigator, "locks");
    }
  });
  it.each([
    ["Open", "Show open commitments", ["C1", "C2", "C4", "C5"]],
    ["I owe", "Show commitments I owe", ["C1"]],
    ["Waiting on", "Show waiting-on commitments", ["C2", "C5"]],
    ["Next conversation", "Show next-conversation commitments", ["C4"]],
    ["Completed", "Show completed commitments", ["C3"]],
  ] as const)("matches the %s lens from pointer, type and final voice", async (label, utterance, ids) => {
    for (const mode of ["click", "typed", "voice"] as const) {
      cleanup(); localStorage.clear(); window.history.replaceState({}, "", "/people?view=commitments"); const before = fixture(); const view = setup();
      if (label === "Open") fireEvent.click(screen.getByRole("button", { name: "Completed" }));
      if (mode === "click") fireEvent.click(within(screen.getByRole("group", { name: "Commitment lenses" })).getByRole("button", { name: label }));
      else await view.command(utterance, mode);
      await waitFor(() => expect(matchedIds()).toEqual(ids));
      expect(window.__FLOW_COMMAND_TRACE__?.intent).toEqual({ type: "commitment-view", patch: { lens: label === "Open" ? "all" : label === "I owe" ? "i-owe" : label.toLowerCase().replace(" ", "-") } });
      expect(window.__FLOW_COMMAND_TRACE__?.actions).toEqual([]); expect(window.__FLOW_COMMAND_TRACE__?.entities).toEqual(ids);
      expect(within(screen.getByRole("group", { name: "Commitment lenses" })).getByRole("button", { name: label })).toHaveAttribute("aria-pressed", "true");
      expect(saved().document).toEqual(before.document); expect(saved().past).toEqual([]); expect(saved().future).toEqual([]);
      view.unmount();
    }
  });
  it("searches exact raw text and clears it without resetting the Completed lens or writing data", async () => {
    for (const mode of ["click", "typed", "voice"] as const) {
      cleanup(); localStorage.clear(); window.history.replaceState({}, "", "/people?view=commitments"); const before = fixture(); const view = setup();
      const search = screen.getByRole("textbox", { name: "Search commitments" });
      for (const [value, ids] of [["invoice", ["C2", "C5"]], ['Delete "everything" — please', []]] as const) {
        if (mode === "click") fireEvent.change(search, { target: { value } });
        else await view.command(`Search commitments for ${JSON.stringify(value)}`, mode);
        await waitFor(() => expect(search).toHaveValue(value)); expect(matchedIds()).toEqual(ids);
      }
      fireEvent.click(screen.getByRole("button", { name: "Completed" }));
      if (mode === "click") fireEvent.change(search, { target: { value: "" } });
      else await view.command("Clear the commitment search", mode);
      await waitFor(() => expect(search).toHaveValue("")); expect(matchedIds()).toEqual(["C3"]);
      expect(screen.getByRole("button", { name: "Completed" })).toHaveAttribute("aria-pressed", "true");
      expect(saved().document).toEqual(before.document); expect(saved().past).toEqual([]); expect(saved().future).toEqual([]); view.unmount();
    }
  });
});
