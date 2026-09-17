import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FlowEnvironmentApp } from "./FlowEnvironmentApp";
import { contextualCalendarFixture, contextualClock } from "../test/contextualCalendarFixture";
import { FakeRecognitionAdapter } from "../features/day-planner/voice/fakeRecognition";
import { LIFE_STORAGE_KEY } from "../domain/life-storage";
import type { LifeSnapshot } from "../domain/life-model";
import { allCalendarEvents } from "../domain/life-calendar-world";

const read = () => JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
const events = () => allCalendarEvents(read().document);
const event = (id: string) => events().find((item) => item.id === id);
const feedback = () => document.querySelector("[data-flow-feedback]")!;

beforeEach(() => {
  localStorage.clear(); window.history.replaceState({}, "", "/today");
  localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(contextualCalendarFixture()));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function setup(mode: "typed" | "voice") {
  const adapter = new FakeRecognitionAdapter();
  const view = render(<FlowEnvironmentApp now={contextualClock} recognitionAdapter={adapter} />);
  await waitFor(() => expect(adapter.startCount).toBe(1));
  let sequence = 0;
  async function command(text: string) {
    if (mode === "typed") {
      if (!screen.queryByLabelText("Tell Flow what to change")) fireEvent.click(screen.getByRole("button", { name: "Open Flow command" }));
      const field = screen.getByLabelText("Tell Flow what to change");
      fireEvent.change(field, { target: { value: text } }); fireEvent.submit(field.closest("form")!);
    } else act(() => adapter.emitFinal(text, `contextual-${++sequence}`));
    await waitFor(() => {
      expect(document.querySelector("[data-last-transcript]")).toHaveAttribute("data-last-transcript", text);
      expect(feedback()).not.toHaveAttribute("data-feedback-phase", "understanding");
      expect(feedback()).not.toHaveAttribute("data-feedback-phase", "listening");
    });
  }
  return { command, adapter, view };
}

for (const mode of ["typed", "voice"] as const) describe(`${mode} through the mounted command dock`, () => {
  it("moves the Wednesday anchored event with a visible preview, one history entry, exact undo/redo and reload", async () => {
    const { command, adapter, view } = await setup(mode);
    const before = read().document;
    await command("change the creative Review to 2pm");
    expect(feedback()).toHaveAttribute("data-feedback-phase", "confirmation");
    expect(feedback()).toHaveTextContent("fixed or protected");
    expect(feedback()).toHaveTextContent("Wednesday, Sep 9");
    expect(feedback()).toHaveTextContent("4 PM"); expect(feedback()).toHaveTextContent("2 PM");
    expect(event("creative-wed")?.start).toBe(960); expect(read().past).toHaveLength(0);
    act(() => adapter.emitInterim("go ahead"));
    expect(screen.getByLabelText("Tell Flow what to change")).toHaveValue("go ahead");
    expect(feedback()).toHaveAttribute("data-feedback-phase", "confirmation");
    expect(feedback()).toHaveTextContent("fixed or protected");
    await command("go ahead");
    expect(event("creative-wed")).toMatchObject({ start: 840, end: 900, dateKey: "2026-09-09", mobility: "anchored" });
    expect(read().past).toHaveLength(1); expect(events()).toHaveLength(6);
    const after = read().document;
    await command("Undo"); expect(read().document).toEqual(before);
    await command("Redo"); expect(read().document).toEqual(after);
    await act(async () => view.unmount());
    const reloadAdapter = new FakeRecognitionAdapter();
    const reloaded = render(<FlowEnvironmentApp now={contextualClock} recognitionAdapter={reloadAdapter} />);
    await waitFor(() => expect(reloadAdapter.startCount).toBe(1));
    expect(read().document).toEqual(after);
    await act(async () => reloaded.unmount());
  });

  it("understands the literal Wednesday cancellation, preserving Tuesday through confirmation and undo", async () => {
    const { command } = await setup(mode);
    const before = read().document;
    await command("cancel the lunch at Wednesday");
    expect(feedback()).toHaveAttribute("data-feedback-phase", "confirmation");
    expect(feedback()).toHaveTextContent("Wednesday, Sep 9");
    expect(screen.queryByRole("button", { name: "Move anyway" })).not.toBeInTheDocument();
    expect(events()).toHaveLength(6); expect(read().past).toHaveLength(0);
    await command("confirm removal");
    expect(event("lunch-wed")).toBeUndefined(); expect(event("lunch-tue")).toBeDefined();
    expect(read().past).toHaveLength(1);
    await command("Undo"); expect(read().document).toEqual(before);
  });

  it("asks dated choices for the 11 AM review, accepts a human answer, and allows correction before confirmation", async () => {
    const { command } = await setup(mode);
    await command("cancel the review meeting from 11:00 a.m.");
    expect(feedback()).toHaveAttribute("data-feedback-phase", "clarification");
    expect(screen.getByRole("button", { name: /email.*Tuesday, Sep 8.*11 AM/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /email.*Wednesday, Sep 9.*11 AM/ })).toBeInTheDocument();
    await command("the Wednesday one");
    expect(feedback(), feedback().textContent ?? "").toHaveAttribute("data-feedback-phase", "confirmation");
    expect(feedback()).toHaveTextContent("Wednesday, Sep 9");
    await command("no, the Tuesday one");
    expect(feedback()).toHaveAttribute("data-feedback-phase", "confirmation");
    expect(feedback()).toHaveTextContent("Tuesday, Sep 8");
    expect(events()).toHaveLength(6);
    await command("yes");
    expect(event("email-tue")).toBeUndefined(); expect(event("email-wed")).toBeDefined();
    expect(read().past).toHaveLength(1);
  });

  it("retires a pending move when a new command fails; yes cannot execute stale authority", async () => {
    const { command } = await setup(mode);
    const before = read().document;
    await command("change the creative Review to 2pm");
    expect(screen.getByRole("button", { name: "Move anyway" })).toBeInTheDocument();
    await command("cancel the nonexistent meeting");
    expect(feedback()).toHaveAttribute("data-pending-change", "false");
    expect(screen.queryByRole("button", { name: "Move anyway" })).not.toBeInTheDocument();
    await command("yes");
    expect(read().document).toEqual(before); expect(read().past).toHaveLength(0);
    expect(feedback()).toHaveTextContent(/Nothing to confirm|No pending/i);
  });

  it("replaces an anchored move with a different deletion and cancels it without touching either event", async () => {
    const { command } = await setup(mode);
    const before = read().document;
    await command("change the creative Review to 2pm");
    await command("Actually cancel Wednesday's lunch");
    expect(screen.queryByRole("button", { name: "Move anyway" })).not.toBeInTheDocument();
    expect(feedback()).toHaveTextContent("Remove Lunch?");
    await command("don't do that");
    expect(feedback()).toHaveAttribute("data-pending-change", "false");
    expect(read().document).toEqual(before); expect(read().past).toHaveLength(0);
  });

  it("keeps a compound move and resize atomic and rejects a multi-source-date request", async () => {
    const { command } = await setup(mode);
    const before = read().document;
    await command("Move creative review to 2pm and make it 45 minutes");
    expect(feedback()).toHaveTextContent("duration changes from 60 to 45 minutes");
    expect(events()).toHaveLength(6); expect(event("creative-wed")?.start).toBe(960);
    await command("confirm");
    expect(event("creative-wed")).toMatchObject({ start: 840, end: 885 }); expect(read().past).toHaveLength(1);
    await command("Undo"); expect(read().document).toEqual(before);
    await command("Cancel Wednesday's email and protect lunch on Tuesday");
    expect(feedback()).toHaveTextContent("one source day per request");
    expect(read().document).toEqual(before); expect(read().past).toHaveLength(0);
    await command("never mind"); expect(read().document).toEqual(before);
  });
});

it("native inherited-property final results use the same contextual pipeline, once", async () => {
  class NativeRecognition {
    static current: NativeRecognition;
    continuous = false; interimResults = false; maxAlternatives = 1; lang = "";
    onstart: (() => void) | null = null; onend: (() => void) | null = null; onerror = null;
    onresult: ((event: unknown) => void) | null = null;
    start() { NativeRecognition.current = this; this.onstart?.(); }
    stop() { this.onend?.(); } abort() { this.onend?.(); }
  }
  vi.stubGlobal("SpeechRecognition", NativeRecognition);
  render(<FlowEnvironmentApp now={contextualClock} />);
  await waitFor(() => expect(NativeRecognition.current).toBeDefined());
  const before = read().document;
  const transcript = "cancel the lunch at Wednesday";
  const alternative = Object.create(Object.defineProperties({}, { transcript: { get: () => transcript }, confidence: { get: () => 0.97 } }));
  act(() => NativeRecognition.current.onresult?.({ resultIndex: 0, results: [Object.assign([alternative], { isFinal: false })] }));
  expect(read().document).toEqual(before); expect(read().past).toHaveLength(0);
  act(() => {
    NativeRecognition.current.onresult?.({ resultIndex: 0, results: [Object.assign([alternative], { isFinal: true })] });
    NativeRecognition.current.onend?.(); NativeRecognition.current.onend?.();
  });
  await waitFor(() => expect(feedback()).toHaveAttribute("data-feedback-phase", "confirmation"));
  expect(feedback()).toHaveTextContent("Wednesday, Sep 9");
  expect(read().document).toEqual(before); expect(read().past).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Confirm removal" }));
  await waitFor(() => expect(event("lunch-wed")).toBeUndefined());
  expect(event("lunch-tue")).toBeDefined(); expect(read().past).toHaveLength(1);
});
