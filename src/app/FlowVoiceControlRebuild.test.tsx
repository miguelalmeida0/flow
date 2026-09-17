import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cloneAtmosphereLayers } from "../domain/studio-model";
import { FlowEnvironmentApp } from "./FlowEnvironmentApp";
import { createLifeSnapshot, LIFE_STORAGE_KEY } from "../domain/life-storage";
import type { LifeSnapshot } from "../domain/life-model";
import { FakeRecognitionAdapter } from "../features/day-planner/voice/fakeRecognition";
import * as memoryExports from "../features/studio/memory/exportMemory";
import { putStudioMedia } from "../features/studio/mediaRepository";

const day = "2026-09-08";
const clock = () => new Date(`${day}T09:00:00`);
const saved = () => JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;

function fixture() {
  const snapshot = createLifeSnapshot(day);
  const at = clock().toISOString();
  snapshot.document.studio.journalEntries.push({ id: "journal-proof", kind: "journal-entry", title: "My Private Page", text: "First sentence. Last sentence.\n\nFinal paragraph.", status: "draft", recordingState: "idle", recordingDurationMs: 0, photoAssetIds: [], bookmarks: [], transcriptSegments: [], drawings: [], tags: [], createdAt: at, updatedAt: at });
  localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(snapshot));
  return snapshot;
}
function setup(adapter?: FakeRecognitionAdapter) {
  const view = render(<FlowEnvironmentApp now={clock} recognitionAdapter={adapter} />);
  const command = async (text: string) => {
    if (!screen.queryByLabelText("Tell Flow what to change")) fireEvent.click(screen.getByRole("button", { name: "Open Flow command" }));
    const input = screen.getByLabelText("Tell Flow what to change");
    fireEvent.change(input, { target: { value: text } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => expect(document.querySelector("[data-last-transcript]")?.getAttribute("data-last-transcript")).toBe(text));
    await waitFor(() => expect(document.querySelector("[data-flow-feedback]")?.getAttribute("data-feedback-phase")).not.toBe("understanding"));
  };
  return { ...view, command };
}

beforeEach(() => { localStorage.clear(); window.history.replaceState({}, "", "/"); });

describe("September 8 production transaction acceptance", () => {
  it.each([
    ["Set journal playback volume to 35 percent", { volume: .35, muted: false, playbackRate: 1 }],
    ["Mute journal playback", { volume: .8, muted: true, playbackRate: 1 }],
    ["Unmute journal playback", { volume: .8, muted: false, playbackRate: 1 }],
    ["Set journal playback speed to 1.5", { volume: .8, muted: false, playbackRate: 1.5 }],
  ] as const)("applies native Journal properties from typed and final commands: %s", async (utterance, expected) => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:journal-settings" });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => undefined });
    for (const mode of ["typed", "voice"] as const) {
      localStorage.clear(); window.history.replaceState({}, "", "/");
      const initial = fixture(); const entry = initial.document.studio.journalEntries[0]!;
      entry.audioAssetId = `settings-${mode}`; entry.recordingDurationMs = 90000;
      initial.document.studio.mediaAssets.push({ id: entry.audioAssetId, kind: "journal-audio", name: "Original", mimeType: "audio/webm", size: 5, createdAt: clock().toISOString() });
      await putStudioMedia(entry.audioAssetId, new Blob(["voice"], { type: "audio/webm" }));
      localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(initial)); const adapter = new FakeRecognitionAdapter(); const view = setup(adapter); await view.command("Open journal");
      await waitFor(() => expect(document.querySelector("audio")).toBeInTheDocument());
      const audio = document.querySelector("audio")!; audio.volume = .8; audio.currentTime = 42; audio.muted = utterance.startsWith("Unmute");
      if (mode === "typed") await view.command(utterance);
      else { fireEvent.click(screen.getByRole("button", { name: "Start Flow Live" })); await waitFor(() => expect(adapter.startCount).toBe(1)); act(() => adapter.emitFinal(utterance, "journal-settings")); }
      await waitFor(() => expect({ volume: audio.volume, muted: audio.muted, playbackRate: audio.playbackRate }).toEqual(expected));
      expect(audio.currentTime).toBe(42); expect(audio.paused).toBe(true);
      expect(saved().document).toEqual(initial.document); expect(saved().past).toHaveLength(0); expect(saved().future).toHaveLength(0);
      view.unmount();
    }
  });
  it("creates an explicitly named Outcome identically from its form, typed command and final transcript", async () => {
    for (const mode of ["click", "typed", "voice"] as const) {
      localStorage.clear(); window.history.replaceState({}, "", "/");
      const initial = fixture(); const adapter = new FakeRecognitionAdapter(); const view = setup(adapter);
      await view.command("Open outcomes");
      const title = "Balcony";
      if (mode === "click") {
        fireEvent.change(screen.getByRole("textbox", { name: "Create an outcome" }), { target: { value: title } });
        fireEvent.click(screen.getByRole("button", { name: "Create" }));
      } else if (mode === "typed") await view.command(`Create an outcome called ${title}`);
      else {
        fireEvent.click(screen.getByRole("button", { name: "Start Flow Live" }));
        await waitFor(() => expect(adapter.startCount).toBe(1));
        act(() => adapter.emitFinal(`Create an outcome called ${title}`, "create-outcome"));
      }
      await waitFor(() => expect(saved().document.plans).toHaveLength(1));
      const after = saved(); const at = clock().toISOString();
      const expected = structuredClone(initial.document);
      const planId = "plan-balcony", stepId = "step-plan-balcony-define-the-next-action";
      expected.plans.push({ id: planId, kind: "plan", title, outcome: `Ready: ${title}`, status: "active", stepIds: [stepId], nextStepId: stepId, createdAt: at, updatedAt: at });
      expected.steps.push({ id: stepId, kind: "plan-step", planId, title: "Define the next action", estimatedMinutes: 20, status: "planned", createdAt: at, updatedAt: at });
      expect(after.document).toEqual(expected); expect(after.past).toHaveLength(1);
      await view.command("Undo"); expect(saved().document).toEqual(initial.document);
      await view.command("Redo"); expect(saved().document).toEqual(expected);
      view.unmount();
    }
  });
  it.each(["field", "undo", "redo"] as const)("preserves newer %s feedback when an older export completes", async (operation) => {
    let finish!: () => void;
    const exporter = vi.spyOn(memoryExports, "exportMemoryStill").mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    try {
      const initial = fixture(); const at = clock().toISOString();
      initial.document.studio.memories = [{ id: "feedback-race", kind: "memory", journalEntryId: "journal-proof", title: "Keep this result", passage: "Original words", composition: "page", textScale: 1, textOffset: { x: 0, y: 0 }, showDate: false, datePlacement: "inline", audioEnabled: false, audioInMs: 0, status: "draft", createdAt: at, updatedAt: at }];
      localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(initial)); const view = setup();
      await view.command("Open memories");
      if (operation !== "field") await view.command("Larger");
      if (operation === "redo") await view.command("Undo");
      await view.command("Export still");
      fireEvent.click(document.querySelector('[data-native-action-id="memory.export"]')!);
      expect(exporter).toHaveBeenCalledTimes(1);
      if (operation === "field") fireEvent.click(screen.getByRole("button", { name: "still" }));
      else fireEvent.click(screen.getByRole("button", { name: operation === "undo" ? "Undo last change" : "Redo last change" }));
      await waitFor(() => expect(saved().document.studio.memories[0]!).toMatchObject(operation === "field" ? { composition: "still" } : { textScale: operation === "undo" ? 1 : 1.12 }));
      const feedback = document.querySelector("[data-flow-feedback]")!.textContent;
      const snapshot = saved();
      await act(async () => finish());
      expect(document.querySelector("[data-flow-feedback]")!.textContent).toBe(feedback);
      expect(saved()).toEqual(snapshot);
    } finally { exporter.mockRestore(); }
  });
  it("renders Journal sketch clearing and exact Undo/Redo from the persisted drawing", async () => {
    const initial = fixture(); const entry = initial.document.studio.journalEntries[0]!;
    entry.drawings = [{ id: "drawing-original", color: "ink", points: [{ x: 10, y: 20 }, { x: 30, y: 40 }] }];
    localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(initial)); const view = setup(); await view.command("Open journal");
    const points = () => [...document.querySelectorAll('svg[aria-label="Freehand journal annotation"] polyline')].map((line) => line.getAttribute("points"));
    expect(points()).toEqual(["10,20 30,40"]);
    await view.command("Clear journal sketch");
    expect(saved().document.studio.journalEntries[0]!.drawings).toEqual([]);
    expect(points()).toEqual([]);
    await view.command("Undo"); expect(saved().document).toEqual(initial.document); expect(points()).toEqual(["10,20 30,40"]);
    await view.command("Redo"); expect(points()).toEqual([]); expect(saved().past).toHaveLength(1);
  });
  it("plays the same original Journal bookmark from its button, typed command and final transcript", async () => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:journal-playback" });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => undefined });
    const playback = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    try {
      for (const mode of ["click", "typed", "voice"] as const) {
        localStorage.clear(); window.history.replaceState({}, "", "/");
        const initial = fixture(); const entry = initial.document.studio.journalEntries[0]!;
        entry.audioAssetId = `original-${mode}`; entry.recordingDurationMs = 90000;
        entry.bookmarks = [{ id: "B1", timestampMs: 15000, createdAt: clock().toISOString() }, { id: "B2", timestampMs: 42000, transcriptAnchor: "The doors opened.", createdAt: clock().toISOString() }];
        initial.document.studio.mediaAssets.push({ id: entry.audioAssetId, kind: "journal-audio", name: "Original voice", mimeType: "audio/webm", size: 5, createdAt: clock().toISOString() });
        await putStudioMedia(entry.audioAssetId, new Blob(["voice"], { type: "audio/webm" }));
        localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(initial));
        const adapter = new FakeRecognitionAdapter(); const view = setup(adapter); await view.command("Open journal");
        await waitFor(() => expect(document.querySelector("audio")).toBeInTheDocument());
        const audio = document.querySelector("audio")!; audio.currentTime = 10;
        const count = playback.mock.calls.length;
        if (mode === "click") fireEvent.click(screen.getByRole("button", { name: "Select and play bookmark 2: The doors opened." }));
        else if (mode === "typed") await view.command("Play journal bookmark 2");
        else { fireEvent.click(screen.getByRole("button", { name: "Start Flow Live" })); await waitFor(() => expect(adapter.startCount).toBe(1)); act(() => adapter.emitFinal("Play journal bookmark 2", "journal-playback")); }
        await waitFor(() => expect(playback).toHaveBeenCalledTimes(count + 1));
        expect(audio.currentTime).toBe(42);
        expect(saved().document).toEqual(initial.document); expect(saved().past).toHaveLength(0); expect(saved().future).toHaveLength(0);
        view.unmount();
      }
    } finally { playback.mockRestore(); }
  });
  it("surfaces a denied Memory play promise without changing data or claiming it played", async () => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:memory-playback" });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => undefined });
    const playback = vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(new DOMException("Gesture required", "NotAllowedError"));
    try {
      const initial = fixture(); const entry = initial.document.studio.journalEntries[0]!; const at = clock().toISOString();
      entry.audioAssetId = "denied-voice"; entry.recordingDurationMs = 90000;
      initial.document.studio.mediaAssets.push({ id: "denied-voice", kind: "journal-audio", name: "Original", mimeType: "audio/webm", size: 5, createdAt: at });
      initial.document.studio.memories = [{ id: "denied-memory", kind: "memory", journalEntryId: entry.id, title: "Source excerpt", passage: "The doors opened.", composition: "voice", textScale: 1, textOffset: { x: 0, y: 0 }, audioEnabled: true, audioInMs: 30000, audioOutMs: 45000, showDate: false, datePlacement: "inline", status: "draft", createdAt: at, updatedAt: at }];
      await putStudioMedia("denied-voice", new Blob(["voice"], { type: "audio/webm" }));
      localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(initial)); const view = setup(); await view.command("Open memories");
      await waitFor(() => expect(document.querySelector("audio")).toBeInTheDocument());
      await view.command("Restart this memory");
      await waitFor(() => expect(document.querySelector("[data-flow-feedback]")).toHaveAttribute("data-feedback-phase", "error"));
      expect(document.querySelector("[data-flow-feedback]")?.textContent).toContain("Playback could not start");
      expect(document.querySelector("audio")!.currentTime).toBe(30);
      expect(saved().document).toEqual(initial.document); expect(saved().past).toHaveLength(0);
    } finally { playback.mockRestore(); }
  });
  it("edits ritual configuration identically from the checkbox, typed command and final transcript without running it", async () => {
    for (const mode of ["click", "typed", "voice"] as const) {
      localStorage.clear(); window.history.replaceState({}, "", "/");
      const initial = fixture(); const ritual = initial.document.studio.rituals.find(({ name }) => name === "I'm home")!;
      const expected = structuredClone(initial.document); expected.studio.rituals.find(({ id }) => id === ritual.id)!.steps = ritual.steps.filter(({ type }) => type !== "atmosphere.play");
      expected.studio.rituals.find(({ id }) => id === ritual.id)!.updatedAt = clock().toISOString();
      const adapter = new FakeRecognitionAdapter(); const view = setup(adapter); await view.command("Open journal");
      if (mode === "click") fireEvent.click(screen.getByRole("checkbox", { name: "Remove sound from home ritual" }));
      else if (mode === "typed") await view.command("Remove sound from home ritual");
      else { fireEvent.click(screen.getByRole("button", { name: "Start Flow Live" })); await waitFor(() => expect(adapter.startCount).toBe(1)); act(() => adapter.emitFinal("Remove sound from home ritual", "ritual-edit")); }
      await waitFor(() => expect(saved().past).toHaveLength(1));
      expect(saved().document).toEqual(expected);
      await view.command("Undo"); expect(saved().document).toEqual(initial.document);
      await view.command("Redo"); expect(saved().document).toEqual(expected);
      view.unmount();
    }
  });
  it("does not let a late native export response overwrite a newer deletion preview", async () => {
    let finish!: () => void;
    const exporter = vi.spyOn(memoryExports, "exportMemoryStill").mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    try {
      const initial = fixture(); const at = clock().toISOString();
      initial.document.studio.memories = [{ id: "late-export", kind: "memory", journalEntryId: "journal-proof", title: "A memory", passage: "Exact words", composition: "page", textScale: 1, textOffset: { x: 0, y: 0 }, showDate: false, datePlacement: "inline", audioEnabled: false, audioInMs: 0, status: "draft", createdAt: at, updatedAt: at }];
      localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(initial)); const view = setup();
      await view.command("Open memories"); await view.command("Export still");
      fireEvent.click(document.querySelector('[data-native-action-id="memory.export"]')!);
      expect(exporter).toHaveBeenCalledTimes(1);
      await view.command("Delete the current journal entry");
      const feedback = document.querySelector("[data-flow-feedback]")!.textContent;
      expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
      await act(async () => finish());
      expect(document.querySelector("[data-flow-feedback]")!.textContent).toBe(feedback);
      expect(saved().document).toEqual(initial.document); expect(saved().past).toHaveLength(0);
    } finally { exporter.mockRestore(); }
  });
  it("exports the identical existing Memory project via click or a typed/final native continuation", async () => {
    const requested: string[] = []; const blobs: Blob[] = [];
    const download = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { requested.push(this.download); });
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: (blob: Blob) => { blobs.push(blob); return "blob:project-proof"; } });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => undefined });
    try {
      for (const mode of ["click", "typed", "voice"] as const) {
        localStorage.clear(); window.history.replaceState({}, "", "/");
        const initial = fixture(); const at = clock().toISOString();
        const memory = { id: "native-export", kind: "memory" as const, journalEntryId: "journal-proof", title: "Export exactly this", passage: "Rain, finally.", composition: "page" as const, textScale: 1, textOffset: { x: 0, y: 0 }, showDate: true, datePlacement: "inline" as const, audioEnabled: false, audioInMs: 0, status: "draft" as const, createdAt: at, updatedAt: at };
        initial.document.studio.memories = [memory]; localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(initial));
        const adapter = new FakeRecognitionAdapter(); const view = setup(adapter); await view.command("Open memories");
        const count = requested.length;
        if (mode === "click") fireEvent.click(screen.getByRole("button", { name: "Export project" }));
        else {
          if (mode === "typed") await view.command("Export project");
          else { fireEvent.click(screen.getByRole("button", { name: "Start Flow Live" })); await waitFor(() => expect(adapter.startCount).toBe(1)); act(() => adapter.emitFinal("Export project", "native-export")); }
          await waitFor(() => expect(document.querySelector('[data-native-action-id="memory.export"]')).toBeInTheDocument());
          expect(requested).toHaveLength(count);
          await view.command("Confirm"); expect(requested).toHaveLength(count);
          fireEvent.click(document.querySelector('[data-native-action-id="memory.export"]')!);
        }
        await waitFor(() => expect(requested).toHaveLength(count + 1));
        expect(requested.at(-1)).toBe("native-export.flow-memory.json");
        const contents = await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(blobs.at(-1)!); });
        expect(JSON.parse(contents)).toEqual({ format: "flow-memory", version: 1, memory });
        expect(saved().document).toEqual(initial.document); expect(saved().past).toHaveLength(0);
        view.unmount();
      }
    } finally { download.mockRestore(); }
  });
  it.each(["typed", "voice"] as const)("keeps photo attachment waiting for a real browser gesture from %s input", async (mode) => {
    const initial = fixture(); const adapter = new FakeRecognitionAdapter(); const view = setup(adapter);
    await view.command("Open journal");
    const utterance = "Attach an original photograph to this entry";
    if (mode === "typed") await view.command(utterance);
    else { fireEvent.click(screen.getByRole("button", { name: "Start Flow Live" })); await waitFor(() => expect(adapter.startCount).toBe(1)); act(() => adapter.emitFinal(utterance, "native-photo")); }
    await waitFor(() => expect(screen.getByRole("button", { name: "Choose photo" })).toBeInTheDocument());
    expect(saved().document).toEqual(initial.document); expect(saved().past).toHaveLength(0);
    await view.command("Confirm");
    expect(screen.getByRole("button", { name: "Choose photo" })).toBeInTheDocument();
    expect(saved().document).toEqual(initial.document); expect(saved().past).toHaveLength(0);
    await view.command("Cancel");
    expect(screen.queryByRole("button", { name: "Choose photo" })).not.toBeInTheDocument();
    expect(saved().document).toEqual(initial.document); expect(saved().past).toHaveLength(0);
  });
  it("requires the same exact photo-removal confirmation from click, typed and final speech", async () => {
    for (const mode of ["click", "typed", "voice"] as const) {
      localStorage.clear(); window.history.replaceState({}, "", "/");
      const initial = fixture();
      initial.document.studio.journalEntries[0]!.photoAssetIds = ["kept-photo", "removed-photo"];
      initial.document.studio.mediaAssets = ["kept-photo", "removed-photo"].map((id) => ({ id, kind: "journal-photo", name: id, mimeType: "image/png", size: 10, createdAt: clock().toISOString() }));
      localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(initial));
      const adapter = new FakeRecognitionAdapter(); const view = setup(adapter);
      await view.command("Open journal");
      const utterance = "Remove the second attached photo";
      if (mode === "click") fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[1]!);
      else if (mode === "typed") await view.command(utterance);
      else { fireEvent.click(screen.getByRole("button", { name: "Start Flow Live" })); await waitFor(() => expect(adapter.startCount).toBe(1)); act(() => adapter.emitFinal(utterance, "remove-photo")); }
      await waitFor(() => expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument());
      expect(saved().document).toEqual(initial.document); expect(saved().past).toHaveLength(0);
      await view.command("Confirm");
      const expected = structuredClone(initial.document); expected.studio.journalEntries[0]!.photoAssetIds = ["kept-photo"];
      expect(saved().document).toEqual(expected); expect(saved().past).toHaveLength(1);
      await view.command("Undo"); expect(saved().document).toEqual(initial.document);
      await view.command("Redo"); expect(saved().document).toEqual(expected);
      view.unmount();
    }
  });
  it.each([
    { label: "Journal text", route: "journal", utterance: 'Replace the journal text with "Go home and keep the rain."', value: "Go home and keep the rain.", kind: "field" },
    { label: "Tags", route: "journal", utterance: "Set journal tags to Travel, Reflection", value: "Travel, Reflection", kind: "field" },
    { label: "Words", route: "memories", utterance: "Make the text say Less rain, more courage", value: "Less rain, more courage", kind: "field" },
    { label: "still", route: "memories", utterance: "Use still composition", value: "", kind: "button" },
    { label: "Show date", route: "memories", utterance: "Hide the date", value: "", kind: "checkbox" },
  ])("converges the visible $label control with typed and final speech", async ({ label, route, utterance, value, kind }) => {
    const outputs = [];
    for (const mode of ["click", "typed", "voice"] as const) {
      localStorage.clear(); window.history.replaceState({}, "", "/");
      const initial = fixture(); const at = clock().toISOString();
      initial.document.studio.memories = [{ id: "memory-proof", kind: "memory", title: "A Quiet Memory", journalEntryId: "journal-proof", composition: "page", passage: "A quiet afternoon.", showDate: true, datePlacement: "inline", textScale: 1, textOffset: { x: 0, y: 0 }, audioEnabled: false, audioInMs: 0, status: "draft", createdAt: at, updatedAt: at }];
      const expected = structuredClone(initial.document);
      if (label === "Journal text") expected.studio.journalEntries[0]!.text = "Go home and keep the rain.";
      if (label === "Tags") expected.studio.journalEntries[0]!.tags = ["Travel", "Reflection"];
      if (label === "Words") expected.studio.memories[0]!.passage = "Less rain, more courage";
      if (label === "still") expected.studio.memories[0]!.composition = "still";
      if (label === "Show date") expected.studio.memories[0]!.showDate = false;
      localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(initial));
      const adapter = new FakeRecognitionAdapter(); const view = setup(adapter);
      await view.command(`Open ${route}`);
      if (mode === "click") {
        if (kind === "field") { const field = screen.getByLabelText(label); fireEvent.change(field, { target: { value } }); fireEvent.blur(field); }
        else fireEvent.click(screen.getByRole(kind === "checkbox" ? "checkbox" : "button", { name: label }));
      } else if (mode === "typed") await view.command(utterance);
      else { fireEvent.click(screen.getByRole("button", { name: "Start Flow Live" })); await waitFor(() => expect(adapter.startCount).toBe(1)); act(() => adapter.emitFinal(utterance, `parity-${label}`)); }
      await waitFor(() => expect(saved().past, JSON.stringify(window.__FLOW_COMMAND_TRACE__)).toHaveLength(1));
      expect(saved().document.calendar).toEqual(initial.document.calendar);
      expect(saved().document).toEqual(expected);
      outputs.push(structuredClone(saved().document));
      await view.command("Undo"); expect(saved().document).toEqual(initial.document);
      await view.command("Redo"); expect(saved().document).toEqual(outputs.at(-1));
      view.unmount();
    }
    expect(outputs[1]).toEqual(outputs[0]); expect(outputs[2]).toEqual(outputs[0]);
  });
  it("makes visible Atmosphere decrement, typed words, and a final transcript identical", async () => {
    const outputs = [];
    for (const mode of ["click", "typed", "voice"] as const) {
      localStorage.clear(); window.history.replaceState({}, "", "/");
      const initial = fixture(); const preset = initial.document.studio.atmospherePresets[0]!;
      initial.document.studio.activeAtmosphere = { presetId: preset.id, playing: false, muted: false, masterVolume: preset.masterVolume, layers: cloneAtmosphereLayers(preset.layers) };
      const expected = structuredClone(initial.document);
      const rain = expected.studio.activeAtmosphere!.layers.find(({ id }) => id === "rain")!;
      rain.volume = Math.max(0, Math.round((rain.volume - 0.1) * 1_000_000) / 1_000_000);
      localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(initial));
      const adapter = new FakeRecognitionAdapter(); const view = setup(adapter);
      await view.command("Open atmosphere");
      if (mode === "click") fireEvent.click(screen.getByRole("button", { name: /^Lower Rain$/i }));
      else if (mode === "typed") await view.command("Lower rain");
      else { fireEvent.click(screen.getByRole("button", { name: "Start Flow Live" })); await waitFor(() => expect(adapter.startCount).toBe(1)); act(() => adapter.emitFinal("Lower rain", "parity-volume")); }
      await waitFor(() => expect(saved().past).toHaveLength(1));
      expect(saved().document).toEqual(expected);
      outputs.push(structuredClone(saved().document));
      await view.command("Undo"); expect(saved().document).toEqual(initial.document);
      await view.command("Redo"); expect(saved().document).toEqual(expected);
      view.unmount();
    }
    expect(outputs[1]).toEqual(outputs[0]); expect(outputs[2]).toEqual(outputs[0]);
  });
  it("edits a unique event from the real week without requiring day or event selection", async () => {
    const initial = fixture();
    initial.document.calendars["2026-09-10"] = { dateKey: "2026-09-10", events: [{ id: "thursday-unique", title: "Investor Meeting", dateKey: "2026-09-10", start: 840, end: 870, kind: "flexible", priority: "medium" }], deferred: [] };
    localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(initial));
    const { command } = setup();
    await command("Open calendar for the full week");
    const before = structuredClone(saved().document);
    await command("Rename Investor Meeting to Exact Thursday Title");
    expect(saved().document.calendars["2026-09-10"]?.events[0]).toMatchObject({ id: "thursday-unique", title: "Exact Thursday Title", start: 840, end: 870 });
    expect(saved().past).toHaveLength(1);
    const after = structuredClone(saved().document);
    await command("Undo"); expect(saved().document).toEqual(before);
    await command("Redo"); expect(saved().document).toEqual(after);
  });
  it("never creates data/history from ordinary goals or unknown global commands", async () => {
    fixture(); const { command } = setup(); const before = structuredClone(saved().document);
    for (const text of ["I need to renew my passport", "My goal is a quieter month", "Open sesame", "I need to scroll down"]) {
      await command(text);
      expect(saved().document).toEqual(before);
      expect(saved().past).toHaveLength(0);
    }
    await command("Create an outcome called Renew my passport");
    expect(saved().document.plans).toHaveLength(1);
    expect(saved().past).toHaveLength(1);
  });

  it.each(["Dog Walking", "Fucking finally", "Miguel and Sarah planning", "Fixed again and move mountains", "Buy milk and call mum"])("stores the exact raw title and restores complete history: %s", async (title) => {
    fixture(); const { command } = setup(); const before = structuredClone(saved().document);
    const id = before.calendar.events.find(({ title }) => /email/i.test(title))!.id;
    await command(`Rename email to ${title}`);
    expect(saved().document.calendar.events.find((event) => event.id === id)?.title, JSON.stringify(window.__FLOW_COMMAND_TRACE__)).toBe(title);
    expect(saved().past).toHaveLength(1);
    expect(saved().document.calendar.events.map((event) => event.id).sort()).toEqual(before.calendar.events.map((event) => event.id).sort());
    const after = structuredClone(saved().document);
    await command("Undo"); expect(saved().document).toEqual(before);
    await command("Redo"); expect(saved().document).toEqual(after);
  });

  it("Journal text replacement preserves command-shaped prose and entry deletion confirms before one exact undoable mutation", async () => {
    fixture(); const { command } = setup();
    await command("Open journal");
    await command('Replace the last sentence with "Go home and delete the meeting."');
    expect(saved().document.studio.journalEntries[0]?.text).toContain('Go home and delete the meeting.');
    expect(saved().document.studio.journalEntries[0]?.text).not.toContain('"Go home');
    const beforeDelete = structuredClone(saved().document);
    const previousCount = saved().past.length;
    await command("Delete the current journal entry");
    expect(saved().document).toEqual(beforeDelete);
    expect(saved().past).toHaveLength(previousCount);
    await command("Confirm");
    expect(saved().document.studio.journalEntries).toHaveLength(0);
    expect(saved().document.calendar).toEqual(beforeDelete.calendar);
    expect(saved().past).toHaveLength(previousCount + 1);
    const deleted = structuredClone(saved().document);
    await command("Undo"); expect(saved().document).toEqual(beforeDelete);
    await command("Redo"); expect(saved().document).toEqual(deleted);
  });

  it("keeps raw typed and injected final rename outcomes identical", async () => {
    fixture(); const typed = setup(); await typed.command("Rename email to Fish and Chips — Mum's Birthday");
    const typedTitle = saved().document.calendar.events.find(({ id }) => id === "email")?.title;
    expect(saved().past).toHaveLength(1); typed.unmount();
    localStorage.clear(); fixture(); const adapter = new FakeRecognitionAdapter(); const voice = setup(adapter);
    fireEvent.click(screen.getByRole("button", { name: "Start Flow Live" }));
    await waitFor(() => expect(adapter.startCount).toBe(1));
    act(() => adapter.emitFinal("Rename email to Fish and Chips — Mum's Birthday"));
    await waitFor(() => expect(saved().past).toHaveLength(1));
    expect(saved().document.calendar.events.find(({ id }) => id === "email")?.title).toBe(typedTitle);
    expect(typedTitle).toBe("Fish and Chips — Mum's Birthday"); voice.unmount();
  });

  it.each([
    ["Rename email to Yes please", "Yes please"],
    ["Move email to three and rename it to Fish and Chips — Mum's Birthday", "Fish and Chips — Mum's Birthday"],
    ['Rename email to "Fish and Chips" and rename deep work to "Portfolio Review"', "Fish and Chips"],
    ["Rename email to Dog Walking — no, Make Believe", "Make Believe"],
    ['Rename email to "Fish and Chips" and move it to three — actually four', "Fish and Chips"],
    ["Change email to Red Team Review", "Red Team Review"],
  ])("preserves literal spans through compound correction: %s", async (utterance, title) => {
    fixture(); const { command } = setup(); const before = structuredClone(saved().document);
    await command(utterance);
    const after = structuredClone(saved().document);
    expect(after.calendar.events.find(({ id }) => id === "email")?.title).toBe(title);
    expect(saved().past).toHaveLength(1);
    if (utterance.includes("Portfolio Review")) expect(after.calendar.events.find(({ id }) => id === "deep-work")?.title).toBe("Portfolio Review");
    if (utterance.includes("actually four")) expect(after.calendar.events.find(({ id }) => id === "email")?.start).toBe(960);
    await command("Undo"); expect(saved().document).toEqual(before);
    await command("Redo"); expect(saved().document).toEqual(after);
  });
});
