import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FlowEnvironmentApp } from "./FlowEnvironmentApp";
import { LIFE_STORAGE_KEY } from "../domain/life-storage";
import { BrowserRecognitionAdapter } from "../features/day-planner/voice/recognition";
import { isCompleteNavigationAtNativeEnd } from "../shared/command/globalInterpreter";

class NativeRecognition {
  static current: NativeRecognition;
  continuous = true; interimResults = true; maxAlternatives = 5; lang = "en-US";
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror = null;
  onresult: ((event: unknown) => void) | null = null;
  start() { NativeRecognition.current = this; this.onstart?.(); }
  stop() { this.onend?.(); }
  abort() { this.onend?.(); }
  emit(transcript: string, isFinal: boolean) {
    this.onresult?.({ results: [Object.assign([{ transcript, confidence: 0.99 }], { isFinal })] });
    this.onend?.();
  }
}

afterEach(() => { Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: undefined }); });

it.each([false, true])("native end opens complete destinations through the production pipeline (isFinal=%s)", async (isFinal) => {
  localStorage.clear(); window.history.replaceState({}, "", "/");
  Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: NativeRecognition });
  render(<FlowEnvironmentApp />);
  await waitFor(() => expect(screen.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "listening"));
  act(() => NativeRecognition.current.emit("flow", true));
  await waitFor(() => expect(screen.getByTestId("home-space")).not.toHaveAttribute("data-home-entrance", "wake-armed"));
  for (const [text, route] of [
    ["open the journal", "/journal"], ["go home", "/"], ["open journal", "/journal"],
    ["open atmosphere", "/atmosphere"], ["open the atmosphere", "/atmosphere"],
    ["open memories", "/memories"], ["open my memories", "/memories"],
    ["open calendar", "/today"], ["open the calendar", "/today"],
    ["go to homepage", "/"], ["open journal", "/journal"], ["go back to the homepage", "/"],
  ]) {
    await waitFor(() => expect(screen.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "listening"));
    act(() => NativeRecognition.current.emit(text!, isFinal));
    await waitFor(() => expect(window.location.pathname).toBe(route), { timeout: 3000 });
    await waitFor(() => expect(document.querySelector("[data-last-transcript]")).toHaveAttribute("data-last-transcript", text));
    expect(screen.queryByText(/browser ended an unfinished phrase/)).not.toBeInTheDocument();
  }
  for (const text of ["open the jour", "rename the meeting to"]) {
    await waitFor(() => expect(screen.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "listening"));
    const before = localStorage.getItem(LIFE_STORAGE_KEY);
    act(() => NativeRecognition.current.emit(text, false));
    await screen.findByText(/browser ended an unfinished phrase/, {}, { timeout: 3500 });
    expect(window.location.pathname).toBe("/");
    expect(localStorage.getItem(LIFE_STORAGE_KEY)).toBe(before);
  }
}, 20000);

it("recovers once, retaining interim provenance and the native endpoint", () => {
  Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: NativeRecognition });
  const adapter = new BrowserRecognitionAdapter();
  const onFinal = vi.fn();
  adapter.start({ onStart() {}, onInterim() {}, onFinal, onError() {}, onEnd() {} }, {
    locale: "en-US", contextPhrases: [], isCompleteAtNativeEnd: isCompleteNavigationAtNativeEnd,
  });
  NativeRecognition.current.emit("open the journal", false);
  NativeRecognition.current.onend?.();
  expect(onFinal).toHaveBeenCalledTimes(1);
  expect(onFinal.mock.calls[0]?.[1].assembly).toMatchObject({
    rawPartials: ["open the journal"], finalSegments: [], assembledUtterance: "open the journal",
    endpoint: "native-end", status: "ASSEMBLED_COMPLETE",
  });
  adapter.abort();
});

it.each(["open the jour", "rename the meeting to", "open journal or memories", "open journal and rename the meeting to"])("does not authorize incomplete or ambiguous native text: %s", (text) => {
  expect(isCompleteNavigationAtNativeEnd(text)).toBe(false);
});

it("does not discard an incomplete suffix to recover a final navigation prefix", async () => {
  vi.useFakeTimers();
  Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: NativeRecognition });
  const adapter = new BrowserRecognitionAdapter(); const onFinal = vi.fn(); const onError = vi.fn();
  try {
    adapter.start({ onStart() {}, onInterim() {}, onFinal, onError, onEnd() {} }, {
      locale: "en-US", contextPhrases: [], isCompleteAtNativeEnd: isCompleteNavigationAtNativeEnd,
    });
    NativeRecognition.current.onresult?.({ results: [
      Object.assign([{ transcript: "open journal" }], { isFinal: true }),
      Object.assign([{ transcript: "and rename the meeting to" }], { isFinal: false }),
    ] });
    NativeRecognition.current.onend?.();
    await vi.advanceTimersByTimeAsync(2500);
    expect(onFinal).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("incomplete-utterance");
  } finally { adapter.abort(); vi.useRealTimers(); }
});
