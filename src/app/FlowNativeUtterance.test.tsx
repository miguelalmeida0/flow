import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLifeSnapshot, LIFE_STORAGE_KEY } from "../domain/life-storage";
import type { LifeSnapshot } from "../domain/life-model";
import { BrowserRecognitionAdapter } from "../features/day-planner/voice/recognition";
import { FlowEnvironmentApp } from "./FlowEnvironmentApp";

/** Browser transport only is simulated; all interpretation, context, recorder
 * lifecycle, persistence and history run through the mounted production app. */
class NativeSpeech {
  static instance: NativeSpeech;
  started = false;
  continuous = true; interimResults = true; maxAlternatives = 5; lang = "en-US";
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onresult: ((event: { results: unknown[] }) => void) | null = null;
  constructor() { NativeSpeech.instance = this; }
  start() { this.started = true; this.onstart?.(); }
  stop() { this.started = false; this.onend?.(); }
  abort() { this.stop(); }
  finals(parts: (string | { transcript: string; confidence: number }[])[]) {
    this.onresult?.({ results: parts.map((part) => Object.assign(typeof part === "string" ? [{ transcript: part, confidence: 1 }] : part, { isFinal: true })) });
  }
}
class Recorder {
  static isTypeSupported() { return true; }
  state: RecordingState = "inactive"; mimeType = "audio/webm";
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onstop: (() => void) | null = null; onerror = null;
  start() { this.state = "recording"; } pause() { this.state = "paused"; } resume() { this.state = "recording"; }
  requestData() { this.ondataavailable?.({ data: new Blob(["recording"], { type: this.mimeType }) } as BlobEvent); }
  stop() { this.state = "inactive"; this.onstop?.(); }
}
const now = () => new Date("2026-09-08T10:00:00");
const saved = () => JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
const entry = (id = "j1") => saved().document.studio.journalEntries.find((item) => item.id === id);
const settleEndpoint = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 1350)); });

beforeEach(() => {
  localStorage.clear(); window.history.replaceState({}, "", "/");
  vi.stubGlobal("SpeechRecognition", NativeSpeech); vi.stubGlobal("MediaRecorder", Recorder);
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })) } });
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:native-proof" });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  const initial = createLifeSnapshot("2026-09-08");
  initial.document.studio.journalEntries = ["j1", "j2"].map((id) => ({ id, kind: "journal-entry", title: id === "j1" ? "First Page" : "Second Page", text: "", status: "draft", recordingState: "idle", recordingDurationMs: 0, photoAssetIds: [], bookmarks: [], transcriptSegments: [], drawings: [], tags: [], createdAt: now().toISOString(), updatedAt: now().toISOString() }));
  localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(initial));
});
afterEach(() => vi.unstubAllGlobals());

function setup() {
  render(<FlowEnvironmentApp now={now} recognitionAdapter={new BrowserRecognitionAdapter()} />);
  const command = async (text: string) => {
    if (!screen.queryByLabelText("Tell Flow what to change")) fireEvent.click(screen.getByRole("button", { name: "Open Flow command" }));
    const field = screen.getByLabelText("Tell Flow what to change");
    fireEvent.change(field, { target: { value: text } }); fireEvent.submit(field.closest("form")!);
    await waitFor(() => expect(document.querySelector("[data-last-transcript]")?.getAttribute("data-last-transcript")).toBe(text));
    await waitFor(() => expect(document.querySelector("[data-flow-feedback]")?.getAttribute("data-feedback-phase")).not.toBe("understanding"));
  };
  const start = async (record = true) => {
    await command("Open journal First Page");
    if (record) { await command("Start recording"); await waitFor(() => expect(entry()?.recordingState).toBe("recording")); }
    fireEvent.click(screen.getByRole("button", { name: "Start Flow Live" }));
    await waitFor(() => expect(NativeSpeech.instance?.started).toBe(true));
    return NativeSpeech.instance;
  };
  return { command, start };
}

describe("native acquisition context through production React", () => {
  it("deleting another entry never discards the still-active recorder's source", async () => {
    const { command, start } = setup();
    await start();
    await command("Open journal Second Page");
    const before = saved();
    await command("Delete entry");
    expect(saved().document).toEqual(before.document);
    await command("Confirm");
    await waitFor(() => expect(entry("j2")).toBeUndefined());
    expect(entry("j1")).toEqual(before.document.studio.journalEntries.find(({ id }) => id === "j1"));
    expect(entry("j1")?.recordingState).toBe("recording");
    expect(saved().past).toHaveLength(before.past.length + 1);
    await command("Open journal First Page");
    expect(screen.getByRole("button", { name: "Pause recording" })).toBeInTheDocument();
  });
  it("preserves final prose on its source entry when the pointer pauses and edits tags before endpoint", async () => {
    const { start } = setup(); const native = await start(); const before = saved();
    act(() => native.finals(["I enjoyed the walk."]));
    fireEvent.click(screen.getByRole("button", { name: "Pause recording" }));
    await waitFor(() => expect(entry()?.recordingState).toBe("paused"));
    const tags = screen.getByLabelText("Tags"); fireEvent.change(tags, { target: { value: "Kept" } }); fireEvent.blur(tags);
    await waitFor(() => expect(entry()?.tags).toEqual(["Kept"]));
    await settleEndpoint();
    expect(entry()).toMatchObject({ text: "I enjoyed the walk.", tags: ["Kept"], recordingState: "paused" });
    expect(entry("j2")).toEqual(before.document.studio.journalEntries[1]);
    expect(saved().document.calendar).toEqual(before.document.calendar);
    expect(saved().past).toHaveLength(before.past.length + 3);
  });

  it("keeps pending J1 prose on J1 after selecting J2, without restoring old data or stealing the editor", async () => {
    const { command, start } = setup(); const native = await start();
    act(() => native.finals(["I enjoyed the walk."]));
    await command("Open journal Second Page");
    const tags = screen.getByLabelText("Tags"); fireEvent.change(tags, { target: { value: "Second" } }); fireEvent.blur(tags);
    await waitFor(() => expect(entry("j2")?.tags).toEqual(["Second"]));
    const before = saved(); await settleEndpoint();
    expect(entry()?.text).toBe("I enjoyed the walk.");
    expect(entry("j2")).toEqual(before.document.studio.journalEntries.find(({ id }) => id === "j2"));
    expect(screen.getByLabelText("Entry title")).toHaveValue("Second Page");
    expect(saved().past).toHaveLength(before.past.length + 1);
  });

  it.each(["Open calendar", "Pause listening"])("separates completed prose from a later native control: %s", async (control) => {
    const { start } = setup(); const native = await start(); const before = saved();
    act(() => native.finals(["I enjoyed the walk."]));
    act(() => native.finals(["I enjoyed the walk.", control]));
    await settleEndpoint();
    await waitFor(() => expect(entry()?.text).toBe("I enjoyed the walk."));
    expect(saved().past).toHaveLength(before.past.length + 1);
    expect(saved().document.calendar).toEqual(before.document.calendar);
    if (control === "Open calendar") expect(window.location.pathname).toBe("/today");
    else expect(native.started).toBe(false);
  });

  it("retains selected alternative segment words through Journal partition, persistence, and trace", async () => {
    const { start } = setup(); const native = await start();
    act(() => native.finals([[{ transcript: "I enjoyed the noise.", confidence: 0.1 }, { transcript: "I enjoyed the peace.", confidence: 0.9 }], "Open calendar"]));
    await settleEndpoint();
    expect(entry()?.text).toBe("I enjoyed the peace.");
    expect(window.location.pathname).toBe("/today");
    expect(window.__FLOW_UTTERANCE_TRACES__?.at(-1)).toMatchObject({ finalSegments: ["I enjoyed the noise.", "Open calendar"], selectedFinalSegments: ["I enjoyed the peace.", "Open calendar"], selectedUtterance: "I enjoyed the peace. Open calendar" });
  });

  it("does not let an acquired Confirm authorize a different pending deletion", async () => {
    const { command, start } = setup(); const native = await start(false);
    await command("Delete the current journal entry");
    expect(screen.getByRole("button", { name: /Confirm/ })).toBeInTheDocument();
    const before = saved(); act(() => native.finals(["Confirm"]));
    await command("Open journal Second Page"); await command("Delete the current journal entry");
    await settleEndpoint();
    expect(saved().document).toEqual(before.document);
    expect(saved().past).toEqual(before.past);
    expect(screen.getByRole("button", { name: /Confirm/ })).toBeInTheDocument();
  });

  it("does not authorize a deletion that did not exist when Confirm began", async () => {
    const { command, start } = setup(); const native = await start(false); const before = saved();
    act(() => native.finals(["Confirm"]));
    await command("Delete the current journal entry"); await settleEndpoint();
    expect(saved().document).toEqual(before.document); expect(saved().past).toEqual(before.past);
    expect(screen.getByRole("button", { name: /Confirm/ })).toBeInTheDocument();
  });

  it("does not resurrect a source deleted before its pending prose endpoint", async () => {
    const { command, start } = setup(); const native = await start();
    act(() => native.finals(["I enjoyed the walk."]));
    await command("Delete the current journal entry"); await command("Confirm");
    await waitFor(() => expect(entry()).toBeUndefined());
    const deleted = saved(); await settleEndpoint();
    expect(saved().document).toEqual(deleted.document); expect(saved().past).toEqual(deleted.past);
    expect(entry("j2")?.text).toBe("");
  });

  it.each([
    ["He told me to", "go home", "He told me to go home"],
    ["I said", "delete the current journal entry", "I said delete the current journal entry"],
  ])("keeps reported speech across native indices as prose: %s / %s", async (first, second, expected) => {
    const { start } = setup(); const native = await start(); const before = saved();
    act(() => native.finals([first!, second!])); await settleEndpoint();
    expect(entry()?.text).toBe(expected); expect(window.location.pathname).toBe("/journal");
    expect(screen.queryByRole("button", { name: /Confirm/ })).not.toBeInTheDocument();
    expect(saved().past).toHaveLength(before.past.length + 1);
    expect(saved().document.calendar).toEqual(before.document.calendar);
  });

  it("shows a durable incomplete-phrase explanation after native restart without executing the prefix", async () => {
    const { start } = setup(); const native = await start(false); const before = saved();
    act(() => {
      native.onresult?.({ results: [Object.assign([{ transcript: "Rename it" }], { isFinal: true }), Object.assign([{ transcript: "Fish and" }], { isFinal: false })] });
      native.stop();
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 2600)); });
    expect(saved().document).toEqual(before.document); expect(saved().past).toEqual(before.past);
    expect(screen.getByText(/browser ended an unfinished phrase/)).toBeInTheDocument();
    expect(screen.getByLabelText("Tell Flow what to change")).toHaveValue("Rename it Fish and");
  });
});
