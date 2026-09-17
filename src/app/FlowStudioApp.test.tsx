import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LifeSnapshot } from "../domain/life-model";
import { LIFE_STORAGE_KEY, readLifeSnapshot } from "../domain/life-storage";
import { FakeRecognitionAdapter } from "../features/day-planner/voice/fakeRecognition";
import { FlowEnvironmentApp } from "./FlowEnvironmentApp";
import * as journalClock from "../features/studio/journalRuntimeClock";
import * as mediaRepository from "../features/studio/mediaRepository";
import * as lifeStorage from "../domain/life-storage";
import legacyJournal from "../features/voice-intelligence/legacyJournalOtherSlots.json";
import legacyLanguage from "../features/voice-intelligence/curatedLanguageSeeds.json";
import { acceptanceFixture } from "../features/voice-intelligence/acceptanceFixtures";

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported() { return true; }
  state: RecordingState = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onstop: ((event: Event) => void) | null = null;
  constructor(public stream: MediaStream) { FakeMediaRecorder.instances.push(this); }
  start() { this.state = "recording"; }
  pause() { this.state = "paused"; }
  resume() { this.state = "recording"; }
  requestData() { this.ondataavailable?.({ data: new Blob(["voice"], { type: this.mimeType }) } as BlobEvent); }
  stop() { this.state = "inactive"; this.onstop?.(new Event("stop")); }
}

const fixedNow = () => new Date("2026-09-05T19:30:00.000Z");

function snapshot() {
  return JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
}

function setup(adapter?: FakeRecognitionAdapter, now = fixedNow) {
  const rendered = render(<FlowEnvironmentApp now={now} recognitionAdapter={adapter} />);
  const command = (value: string) => {
    if (!screen.queryByLabelText("Tell Flow what to change")) fireEvent.click(screen.getByRole("button", { name: "Open Flow command" }));
    const field = screen.getByLabelText("Tell Flow what to change");
    fireEvent.change(field, { target: { value } });
    fireEvent.submit(field.closest("form")!);
  };
  return { ...rendered, command };
}

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, "", "/");
  FakeMediaRecorder.instances = [];
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] }) as unknown as MediaStream) },
  });
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:flow-studio") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});

afterEach(() => vi.unstubAllGlobals());

describe("Flow Living Studio through the real React boundary", () => {
  it.each(["typed", "voice"] as const)("preserves a finalized Journal take and all history when asked to record over it through %s", async (mode) => {
    const initial = acceptanceFixture("legacy-journal-editing").snapshot;
    localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(initial)); window.history.replaceState({}, "", "/journal");
    const entry = initial.document.studio.journalEntries[0]!, assetId = entry.audioAssetId!;
    await mediaRepository.putStudioMedia(assetId, new Blob([new Uint8Array(512).fill(71)], { type: "audio/webm" }));
    const adapter = new FakeRecognitionAdapter(), app = setup(adapter);
    await screen.findByTestId("journal-space"); fireEvent.click(screen.getByRole("button", { name: /Evaluation journal draft/ }));
    await waitFor(() => expect(adapter.startCount).toBe(1)); const before = snapshot();
    if (mode === "typed") app.command("Start with my voice"); else act(() => adapter.emitFinal("Start with my voice", "saved-journal-guard"));
    await waitFor(() => expect(document.body.textContent).toContain("This saved recording and its moments are kept"));
    expect(snapshot()).toEqual(before); expect(FakeMediaRecorder.instances).toHaveLength(0);
    expect((await mediaRepository.getStudioMedia(assetId))?.size).toBe(512);
    expect(snapshot().document.studio.journalEntries[0]?.audioAssetId).toBe(assetId);
  });
  it("retains the final owned native chunk on unmount without a document callback", async () => {
    const { command, unmount } = setup();
    command("Let me talk for a while");
    await waitFor(() => expect(snapshot().document.studio.journalEntries[0]?.recordingState).toBe("recording"));
    const before = snapshot(), assetId = before.document.studio.journalEntries[0]!.audioAssetId!;
    const stop = vi.spyOn(FakeMediaRecorder.prototype, "stop").mockImplementation(function (this: FakeMediaRecorder) {
      this.requestData(); this.state = "inactive"; this.onstop?.(new Event("stop"));
    });
    try {
      unmount();
      await waitFor(async () => expect((await mediaRepository.getStudioMedia(assetId))?.size).toBe(5));
      expect(snapshot()).toEqual(before);
      expect(FakeMediaRecorder.instances[0]!.state).toBe("inactive");
    } finally { stop.mockRestore(); }
  });
  for (const input of ["typed", "final transcript"] as const) it.each(legacyJournal.control.rows)(`${input} completes the same legacy recording control %s through native callbacks`, async (suffix, _line, mode) => {
    const text = legacyLanguage.find(({ id }) => id === `curated-${suffix}`)!.utterance;
    const at = "2026-09-05T12:00:00.000Z";
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(at));
    const initial = acceptanceFixture("legacy-journal-editing").snapshot;
    // These cases test callbacks on an admitted owner, not replacement of an
    // already-finalized take. Keep the prose and identity; start with no audio.
    const recordingEntry = initial.document.studio.journalEntries[0]!;
    initial.document.studio.mediaAssets = initial.document.studio.mediaAssets.filter(({ id }) => id !== recordingEntry.audioAssetId);
    recordingEntry.audioAssetId = undefined; recordingEntry.recordingDurationMs = 0;
    recordingEntry.transcriptSegments = []; recordingEntry.bookmarks = []; recordingEntry.markers = [];
    localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(initial));
    window.history.replaceState({}, "", "/journal");
    const migrated = readLifeSnapshot(initial.document.calendar.dateKey)!;
    const acquiredDocument = structuredClone(migrated.document);
    const acquiredAsset = { id: `journal-audio-journal-curated-${Date.parse(at).toString(36)}`, kind: "journal-audio" as const, name: "journal-curated.webm", mimeType: "audio/webm", size: 0, createdAt: at };
    acquiredDocument.studio.mediaAssets.push(acquiredAsset);
    acquiredDocument.studio.journalEntries[0]!.audioAssetId = acquiredAsset.id;
    acquiredDocument.studio.journalEntries[0]!.recordingState = "recording";
    let elapsed = 0;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => elapsed);
    const chunk = vi.spyOn(FakeMediaRecorder.prototype, "requestData").mockImplementation(function (this: FakeMediaRecorder) {
      this.ondataavailable?.({ data: new Blob([new Uint8Array(512)], { type: "audio/webm" }) } as BlobEvent);
    });
    const adapter = new FakeRecognitionAdapter();
    const app = setup(adapter, () => new Date(at));
    let write: { mockRestore(): void } | undefined;
    try {
      // Hydrated metadata cannot create a native owner. Establish ownership
      // through the actual start path before freezing this callback fixture.
      await screen.findByTestId("journal-space");
      fireEvent.click(screen.getByRole("button", { name: /Evaluation journal draft/ }));
      app.command("Start with my voice");
      await waitFor(() => expect(snapshot().document).toEqual(acquiredDocument));
      expect(snapshot().past).toEqual([...migrated.past, { document: migrated.document }]);
      const before = snapshot(), expected = structuredClone(before.document);
      const entry = expected.studio.journalEntries[0]!, assetId = entry.audioAssetId!;
      const native = FakeMediaRecorder.instances[0]!;
      elapsed = 60_000;
      const writes: Array<() => void> = [];
      if (mode === "stop") {
        entry.recordingState = "idle"; entry.recordingDurationMs = 60_000;
        expected.studio.mediaAssets.find(({ id }) => id === assetId)!.size = 512;
        const persist = mediaRepository.putStudioMedia;
        write = vi.spyOn(mediaRepository, "putStudioMedia").mockImplementation((id, blob) => new Promise<void>((resolve, reject) => writes.push(() => { void persist(id, blob).then(resolve, reject); })));
      } else if (mode === "pause") { entry.recordingState = "paused"; entry.recordingDurationMs = 60_000; }
      if (input === "typed") app.command(text);
      else {
        fireEvent.click(screen.getByRole("button", { name: "Start Flow Live" }));
        await waitFor(() => expect(adapter.startCount).toBe(1));
        act(() => adapter.emitFinal(text, `legacy-native-${suffix}`));
      }
      if (mode === "stop") {
        await waitFor(() => expect(native.state).toBe("inactive"));
        expect(snapshot()).toEqual(before);
        expect(writes).toHaveLength(2);
        await act(async () => { writes.forEach((release) => release()); });
      } else if (mode === "resume") {
        await waitFor(() => {
          expect(document.querySelector("[data-flow-feedback]")).toHaveAttribute("data-feedback-transcript", text);
          expect(document.querySelector("[data-flow-feedback]")).toHaveAttribute("data-feedback-phase", "completed");
        });
      }
      await waitFor(() => expect(snapshot().document).toEqual(expected));
      const previousTransaction = structuredClone(before.lastTransaction!);
      delete previousTransaction.before; delete previousTransaction.after;
      expect(snapshot().past).toEqual(mode === "resume" ? before.past : [...before.past, { document: before.document, lastTransaction: previousTransaction }]);
      expect(snapshot().future).toEqual(before.future);
      expect(native.state).toBe(mode === "stop" ? "inactive" : mode === "pause" ? "paused" : "recording");
      if (mode === "resume") expect(snapshot()).toEqual(before);
      else {
        app.command("Undo"); await waitFor(() => expect(snapshot().document).toEqual(before.document));
        app.command("Redo"); await waitFor(() => expect(snapshot().document).toEqual(expected));
        expect(FakeMediaRecorder.instances).toHaveLength(1);
        if (mode === "stop") expect((await mediaRepository.getStudioMedia(assetId))?.size).toBe(512);
      }
    } finally { app.unmount(); clock.mockRestore(); chunk.mockRestore(); write?.mockRestore(); vi.useRealTimers(); }
  });
  it.each(["pause", "resume"])("reports unsaved %s state truthfully when persistence is rejected", async (mode) => {
    const { command } = setup();
    command("Let me talk for a while");
    await waitFor(() => expect(snapshot().document.studio.journalEntries[0]?.recordingState).toBe("recording"));
    if (mode === "resume") {
      command("Pause recording");
      await waitFor(() => expect(snapshot().document.studio.journalEntries[0]?.recordingState).toBe("paused"));
    }
    const before = snapshot();
    const save = vi.spyOn(lifeStorage, "saveLifeSnapshot").mockReturnValue(false);
    try {
      command(mode === "pause" ? "Pause recording" : "Resume recording");
      await screen.findByText(mode === "pause" ? /Audio is paused, but that state was not saved/ : /Audio is recording, but that state was not saved/);
      expect(FakeMediaRecorder.instances[0]!.state).toBe(mode === "pause" ? "paused" : "recording");
      expect(snapshot()).toEqual(before);
    } finally { save.mockRestore(); }
  });
  it.each(["success", "cancelled", "native-stopped"])("keeps early audio chunks in memory until acquisition persistence is %s", async (outcome) => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, "locks");
    const queued: Array<() => unknown> = []; let hold = false;
    Object.defineProperty(navigator, "locks", { configurable: true, value: { request: (_name: string, _options: unknown, callback: () => unknown) => hold ? new Promise((resolve) => queued.push(() => resolve(callback()))) : Promise.resolve(callback()) } });
    const write = vi.spyOn(mediaRepository, "putStudioMedia");
    const start = vi.spyOn(FakeMediaRecorder.prototype, "start").mockImplementation(function (this: FakeMediaRecorder) { hold = true; this.state = "recording"; this.requestData(); });
    let unmount: (() => void) | undefined;
    try {
      const app = setup(); unmount = app.unmount;
      app.command("Let me talk for a while");
      await waitFor(() => expect(queued).toHaveLength(1));
      const waiting = snapshot();
      expect(waiting.document.studio.journalEntries[0]!.audioAssetId).toBeUndefined();
      expect(write).not.toHaveBeenCalled();
      if (outcome === "cancelled") app.command("Cancel");
      if (outcome === "native-stopped") act(() => FakeMediaRecorder.instances[0]!.stop());
      hold = false;
      await act(async () => { for (const release of queued.splice(0)) release(); });
      if (outcome === "success") {
        await waitFor(() => expect(snapshot().document.studio.journalEntries[0]!.recordingState).toBe("recording"));
        await waitFor(() => expect(write).toHaveBeenCalledOnce());
        const assetId = snapshot().document.studio.journalEntries[0]!.audioAssetId!;
        await waitFor(async () => expect((await mediaRepository.getStudioMedia(assetId))?.size).toBe(5));
        expect(snapshot().past).toEqual(waiting.past);
      } else {
        await waitFor(() => expect(FakeMediaRecorder.instances[0]!.state).toBe("inactive"));
        expect(write).not.toHaveBeenCalled(); expect(snapshot()).toEqual(waiting);
      }
    } finally {
      unmount?.(); start.mockRestore(); write.mockRestore();
      if (descriptor) Object.defineProperty(navigator, "locks", descriptor); else Reflect.deleteProperty(navigator, "locks");
    }
  });
  it("keeps a requested recording as an idle draft until acquisition, then completes one creation transaction", async () => {
    let allow!: (stream: MediaStream) => void;
    const stop = vi.fn();
    vi.mocked(navigator.mediaDevices.getUserMedia).mockImplementation(() => new Promise((resolve) => { allow = resolve; }));
    const { command } = setup();
    const original = snapshot();
    command("Let me talk for a while");
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce());
    const requesting = snapshot();
    expect(requesting.past).toHaveLength(original.past.length + 1);
    expect(requesting.document.studio.journalEntries[0]).toMatchObject({ recordingState: "idle" });
    expect(requesting.document.studio.journalEntries[0]!.audioAssetId).toBeUndefined();
    expect(requesting.document.studio.mediaAssets).toEqual(original.document.studio.mediaAssets);
    await act(async () => allow({ getTracks: () => [{ stop }] } as unknown as MediaStream));
    await waitFor(() => expect(snapshot().document.studio.journalEntries[0]!.recordingState).toBe("recording"));
    const acquired = snapshot();
    expect(acquired.past).toEqual(requesting.past);
    expect(acquired.lastTransaction?.id).toBe(requesting.lastTransaction?.id);
    command("Undo"); await waitFor(() => expect(snapshot().document).toEqual(original.document));
    await waitFor(() => expect(stop).toHaveBeenCalled());
    command("Redo"); await waitFor(() => expect(snapshot().document).toEqual(acquired.document));
    expect(FakeMediaRecorder.instances).toHaveLength(1);
  });
  it.each(["Cancel", "Open calendar", "Undo", "Capture an unrelated note"])("does not finish an old recording request after %s", async (replacement) => {
    let allow!: (stream: MediaStream) => void;
    const stop = vi.fn();
    vi.mocked(navigator.mediaDevices.getUserMedia).mockImplementation(() => new Promise((resolve) => { allow = resolve; }));
    const { command } = setup();
    command("Let me talk for a while");
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce());
    command(replacement);
    await waitFor(() => expect(screen.getByLabelText("Tell Flow what to change")).toHaveValue(replacement));
    const beforeResolution = snapshot();
    await act(async () => allow({ getTracks: () => [{ stop }] } as unknown as MediaStream));
    await waitFor(() => expect(stop).toHaveBeenCalled());
    expect(snapshot()).toEqual(beforeResolution);
    expect(FakeMediaRecorder.instances).toHaveLength(0);
  });
  it.each(["permission", "native-start"])("retains the valid idle draft without a phantom asset after %s failure", async (failure) => {
    if (failure === "permission") vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(new DOMException("Denied", "NotAllowedError"));
    const start = failure === "native-start" ? vi.spyOn(FakeMediaRecorder.prototype, "start").mockImplementation(() => { throw new Error("Native start failed"); }) : undefined;
    try {
      const { command } = setup();
      const before = snapshot();
      command("Let me talk for a while");
      await screen.findByText(failure === "permission" ? /Microphone permission was denied/ : /Native start failed/);
      const after = snapshot();
      expect(after.past).toHaveLength(before.past.length + 1);
      expect(after.document.studio.mediaAssets).toEqual(before.document.studio.mediaAssets);
      expect(after.document.studio.journalEntries[0]!).toMatchObject({ recordingState: "idle" });
      expect(after.document.studio.journalEntries[0]!.audioAssetId).toBeUndefined();
      command("Undo"); await waitFor(() => expect(snapshot().document).toEqual(before.document));
    } finally { start?.mockRestore(); }
  });
  it("releases late acquisition after unmount without changing persisted data", async () => {
    let allow!: (stream: MediaStream) => void;
    const stop = vi.fn();
    vi.mocked(navigator.mediaDevices.getUserMedia).mockImplementation(() => new Promise((resolve) => { allow = resolve; }));
    const { command, unmount } = setup();
    command("Let me talk for a while");
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce());
    const idle = snapshot(); unmount();
    await act(async () => allow({ getTracks: () => [{ stop }] } as unknown as MediaStream));
    expect(stop).toHaveBeenCalledOnce(); expect(snapshot()).toEqual(idle);
    expect(FakeMediaRecorder.instances).toHaveLength(0);
    setup(); await screen.findByTestId("journal-space");
    expect(snapshot().document).toEqual(idle.document);
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce();
  });
  it("keeps rapid repeated finals at one recording position and restores their exact history", async () => {
    const position = vi.spyOn(journalClock, "journalRuntimePosition").mockReturnValue(0);
    try {
      const adapter = new FakeRecognitionAdapter();
      const { command } = setup(adapter);
      fireEvent.click(screen.getByLabelText("Start Flow Live"));
      await waitFor(() => expect(adapter.startCount).toBe(1));
      act(() => adapter.emitFinal("Let me talk for a while"));
      await waitFor(() => expect(snapshot().document.studio.journalEntries).toHaveLength(1));
      const before = snapshot();
      for (let index = 0; index < 3; index += 1) {
        await waitFor(() => expect(adapter.startCount).toBeGreaterThanOrEqual(index + 2));
        act(() => adapter.emitFinal(index === 2 ? "Another thought." : "It was cool."));
      }
      await waitFor(() => expect(snapshot().document.studio.journalEntries[0]!.transcriptSegments).toHaveLength(3));
      const after = snapshot();
      expect(after.document.studio.journalEntries[0]!.text).toBe("It was cool. It was cool. Another thought.");
      expect(after.past).toHaveLength(before.past.length + 3);
      command("undo"); command("undo"); command("undo");
      await waitFor(() => expect(snapshot().document).toEqual(before.document));
      command("redo"); command("redo"); command("redo");
      await waitFor(() => expect(snapshot().document).toEqual(after.document));
    } finally { position.mockRestore(); }
  });

  it("starts an existing new entry with voice, registering its media in exactly one history entry", async () => {
    window.history.replaceState({}, "", "/journal");
    const { command } = setup();
    command("new journal entry");
    await waitFor(() => expect(snapshot().document.studio.journalEntries).toHaveLength(1));
    const before = snapshot();
    command("start with my voice");
    await waitFor(() => expect(FakeMediaRecorder.instances[0]?.state).toBe("recording"));
    const recording = snapshot();
    expect(recording.past).toHaveLength(before.past.length + 1);
    expect(recording.document.studio.journalEntries[0]).toMatchObject({ id: before.document.studio.journalEntries[0]!.id, recordingState: "recording", audioAssetId: recording.document.studio.mediaAssets[0]!.id });
    command("stop recording");
    await waitFor(() => expect(snapshot().document.studio.mediaAssets[0]?.size).toBeGreaterThan(0));
    expect(snapshot().document.studio.journalEntries[0]!.recordingState).toBe("idle");
  });

  it("edits, bookmarks, saves, reloads, undoes, and redoes one journal", async () => {
    const first = setup();
    first.command("Open my journal");
    expect(await screen.findByTestId("journal-space")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "New entry" }));
    const editor = await screen.findByRole("textbox", { name: "Journal text" });
    fireEvent.change(editor, { target: { value: "The street was quiet after the rain." } });
    fireEvent.blur(editor);
    await waitFor(() => expect(snapshot().document.studio.journalEntries[0]?.text).toBe("The street was quiet after the rain."));
    const currentEditor = screen.getByRole("textbox", { name: "Journal text" }) as HTMLTextAreaElement;
    currentEditor.setSelectionRange(0, currentEditor.value.length);
    fireEvent.select(currentEditor);
    fireEvent.click(screen.getByRole("button", { name: "Bookmark selection" }));
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));
    await waitFor(() => expect(snapshot().document.studio.journalEntries[0]).toMatchObject({ text: "The street was quiet after the rain.", status: "saved", bookmarks: [expect.any(Object)] }));
    const saved = structuredClone(snapshot().document.studio.journalEntries[0]);

    first.unmount();
    setup();
    expect(await screen.findByTestId("journal-space")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Journal text" })).toHaveValue("The street was quiet after the rain.");
    fireEvent.click(screen.getByRole("button", { name: "Undo last change" }));
    await waitFor(() => expect(snapshot().document.studio.journalEntries[0]?.status).toBe("draft"));
    fireEvent.click(screen.getByRole("button", { name: "Redo last change" }));
    await waitFor(() => expect(snapshot().document.studio.journalEntries[0]).toEqual(saved));
  });

  it("runs journal recording and long-form speech through one persistent fake voice session", async () => {
    const adapter = new FakeRecognitionAdapter();
    setup(adapter);
    fireEvent.click(screen.getByLabelText("Start Flow Live"));
    await waitFor(() => expect(adapter.startCount).toBe(1));
    act(() => adapter.emitFinal("Let me talk for a while"));
    expect(await screen.findByTestId("journal-space")).toBeInTheDocument();
    await waitFor(() => expect(FakeMediaRecorder.instances).toHaveLength(1));
    expect(snapshot().past).toHaveLength(1);
    expect(snapshot().document.studio.journalEntries[0]).toMatchObject({ recordingState: "recording", audioAssetId: expect.any(String) });

    await waitFor(() => expect(adapter.startCount).toBeGreaterThanOrEqual(2));
    act(() => adapter.emitFinal("The street was quiet after the rain"));
    await waitFor(() => expect(snapshot().document.studio.journalEntries[0]?.text).toContain("The street was quiet after the rain"));
    await waitFor(() => expect(adapter.startCount).toBeGreaterThanOrEqual(3));
    act(() => adapter.emitFinal("Bookmark that"));
    await waitFor(() => expect(snapshot().document.studio.journalEntries[0]?.bookmarks).toHaveLength(1));
    await waitFor(() => expect(adapter.startCount).toBeGreaterThanOrEqual(4));
    act(() => adapter.emitFinal("Stop the journal recording"));
    await waitFor(() => expect(snapshot().document.studio.journalEntries[0]).toMatchObject({ recordingState: "idle", recordingDurationMs: expect.any(Number) }));
    expect(snapshot().document.studio.mediaAssets[0]?.size).toBeGreaterThan(0);
    expect(screen.getByLabelText("Tell Flow what to change")).toHaveValue("Stop the journal recording");
  });

  it("creates a source-backed memory and rearranges the workspace without losing content", async () => {
    const { command } = setup();
    command("Journal this the street was quiet after the rain");
    expect(await screen.findByTestId("journal-space")).toBeInTheDocument();
    const bookmark = screen.getByRole("button", { name: "Bookmark here" });
    expect(bookmark).toBeEnabled();
    fireEvent.click(bookmark);
    await waitFor(() => expect(snapshot().document.studio.journalEntries[0]?.bookmarks).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Make a memory" }));
    expect(await screen.findByTestId("memories-space")).toBeInTheDocument();
    expect(screen.getAllByText(/the street was quiet after the rain/i).length).toBeGreaterThan(0);
    command("Make the words larger");
    command("Keep this");
    command("Bring my journal closer and leave the music open beside it");
    await waitFor(() => expect(snapshot().document.studio.workspace).toMatchObject({ primary: "journal", secondary: "atmosphere" }));
    command("Show less");
    await waitFor(() => expect(snapshot().document.studio.workspace.quiet).toBe(true));
    expect(snapshot().document.studio.memories[0]).toMatchObject({ status: "saved", textScale: 1.12, passage: "the street was quiet after the rain" });
  });
});
