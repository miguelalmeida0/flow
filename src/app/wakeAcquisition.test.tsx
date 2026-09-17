import { StrictMode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FlowEnvironmentApp } from "./FlowEnvironmentApp";
import { LIFE_STORAGE_KEY } from "../domain/life-storage";

class NativeRecognition {
  static starts = 0;
  static current: NativeRecognition;
  static denied = false;
  continuous = false; interimResults = false; maxAlternatives = 1; lang = "";
  onstart: (() => void) | null = null; onend: (() => void) | null = null;
  onerror = null; onresult: ((event: unknown) => void) | null = null;
  start() {
    NativeRecognition.starts++; NativeRecognition.current = this;
    if (NativeRecognition.denied) throw new DOMException("Denied", "NotAllowedError");
    this.onstart?.();
  }
  stop() { this.onend?.(); }
  abort() { this.onend?.(); }
  final(transcript: string) {
    const alternative = Object.create(Object.defineProperties({}, {
      transcript: { get: () => transcript }, confidence: { get: () => 1 },
    }));
    this.onresult?.({ resultIndex: 0, results: [Object.assign([alternative], { isFinal: false })] });
    this.onresult?.({ resultIndex: 0, results: [Object.assign([alternative], { isFinal: true })] });
    this.onend?.();
  }
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function install() {
  localStorage.clear(); window.history.replaceState({}, "", "/?flowVoiceDebug=1");
  NativeRecognition.starts = 0; NativeRecognition.denied = false;
  vi.stubGlobal("SpeechRecognition", NativeRecognition);
  // Fresh-origin permission has not been granted. The native start owns prompting.
  vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { permissions: { query: vi.fn().mockResolvedValue({ state: "prompt" }) } }));
}

it.each([430, 1440])("acquires the native adapter once on the locked wake screen at %spx, including StrictMode", async (width) => {
  install(); vi.stubGlobal("innerWidth", width);
  const logs = vi.spyOn(console, "info").mockImplementation(() => undefined);
  const view = render(<StrictMode><FlowEnvironmentApp /></StrictMode>);
  await waitFor(() => expect(NativeRecognition.starts).toBe(1));
  await screen.findByRole("heading", { name: "Say “Flow” to wake me up." });
  expect(screen.getByTestId("home-space")).toHaveAttribute("data-home-entrance", "wake-armed");
  view.rerender(<StrictMode><FlowEnvironmentApp /></StrictMode>);
  expect(NativeRecognition.starts).toBe(1);
  const events = logs.mock.calls.filter(([prefix]) => prefix === "[flow-voice-debug]").map(([, json]) => JSON.parse(String(json)).event);
  expect(events).toEqual(expect.arrayContaining(["dock.mount", "session.mount", "adapter.kind", "ownership.request", "ownership.granted", "recognition.start.request", "recognition.start.success", "recognition.onstart"]));
  act(() => NativeRecognition.current.final("flow"));
  await waitFor(() => expect(screen.getByTestId("home-space")).not.toHaveAttribute("data-home-entrance", "wake-armed"));
  await waitFor(() => expect(screen.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "listening"));
  act(() => NativeRecognition.current.final("open the journal"));
  await waitFor(() => expect(window.location.pathname).toBe("/journal"));
}, 10000);

it("does not claim to hear the wake word when native microphone access is denied", async () => {
  install(); NativeRecognition.denied = true;
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  render(<FlowEnvironmentApp />);
  await waitFor(() => expect(NativeRecognition.starts).toBe(1));
  await waitFor(() => expect(screen.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "permission-denied"));
  expect(screen.queryByRole("heading", { name: "Say “Flow” to wake me up." })).not.toBeInTheDocument();
});

it.each([["open the journal", "/journal"], ["open atmosphere", "/atmosphere"], ["open memories", "/memories"], ["open calendar", "/today"]])("executes %s from wake-armed without requiring a separately recognized wake word", async (text, route) => {
  install(); vi.spyOn(console, "info").mockImplementation(() => undefined);
  render(<FlowEnvironmentApp />);
  await waitFor(() => expect(NativeRecognition.starts).toBe(1));
  expect(screen.getByTestId("home-space")).toHaveAttribute("data-home-entrance", "wake-armed");
  const before = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!);
  act(() => {
    const blank = Object.assign([{ transcript: "", confidence: 0 }], { isFinal: true });
    const alternative = Object.create(Object.defineProperties({}, {
      transcript: { get: () => text }, confidence: { get: () => 0.9521284103393555 },
    }));
    const native = NativeRecognition.current;
    native.onresult?.({ resultIndex: 0, results: [blank] });
    native.onresult?.({ resultIndex: 1, results: [blank, Object.assign([alternative], { isFinal: false })] });
    native.onresult?.({ resultIndex: 1, results: [blank, Object.assign([alternative], { isFinal: true })] });
    native.onend?.();
    native.onend?.();
  });
  await waitFor(() => expect(window.location.pathname).toBe(route));
  const after = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!);
  expect(after.document).toEqual(before.document);
  expect(after.past).toEqual(before.past);
});

it.each(["no", "FL", "open the jour", "rename my meeting to", "Capture buy milk"])("keeps pre-wake speech blocked: %s", async (text) => {
  install(); vi.spyOn(console, "info").mockImplementation(() => undefined);
  render(<FlowEnvironmentApp />);
  await waitFor(() => expect(NativeRecognition.starts).toBe(1));
  const before = localStorage.getItem(LIFE_STORAGE_KEY);
  act(() => NativeRecognition.current.final(text));
  await waitFor(() => expect(screen.getByLabelText("Global Flow command")).toHaveAttribute("data-last-transcript", text), { timeout: 2000 });
  expect(screen.getByTestId("home-space")).toHaveAttribute("data-home-entrance", "wake-armed");
  expect(localStorage.getItem(LIFE_STORAGE_KEY)).toBe(before);
});
