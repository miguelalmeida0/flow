import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { FlowEnvironmentApp } from "./FlowEnvironmentApp";
import { createLifeSnapshot, LIFE_STORAGE_KEY } from "../domain/life-storage";
import type { LifeSnapshot } from "../domain/life-model";
import { FakeRecognitionAdapter } from "../features/day-planner/voice/fakeRecognition";
import { putStudioMedia } from "../features/studio/mediaRepository";
import * as mediaRepository from "../features/studio/mediaRepository";

const day = "2026-09-08";
const clock = () => new Date(`${day}T09:00:00`);
const saved = () => JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;

async function fixture(id: string) {
  const snapshot = createLifeSnapshot(day), at = clock().toISOString();
  snapshot.document.studio.journalEntries = [{ id: "J1", kind: "journal-entry", title: "Station", text: "The doors opened.", status: "draft", recordingState: "idle", recordingDurationMs: 90000, audioAssetId: id, photoAssetIds: [], bookmarks: [{ id: "B1", timestampMs: 15000, createdAt: at }, { id: "B2", timestampMs: 42000, transcriptAnchor: "The doors opened.", createdAt: at }], transcriptSegments: [], drawings: [], tags: [], createdAt: at, updatedAt: at }];
  snapshot.document.studio.mediaAssets = [{ id, kind: "journal-audio", name: "Original voice", mimeType: "audio/webm", size: 5, createdAt: at }];
  snapshot.document.studio.memories = [{ id: "M1", kind: "memory", journalEntryId: "J1", title: "Station excerpt", passage: "The doors opened.", composition: "voice", textScale: 1, textOffset: { x: 0, y: 0 }, showDate: false, datePlacement: "inline", audioEnabled: true, audioInMs: 30000, audioOutMs: 45000, status: "draft", createdAt: at, updatedAt: at }];
  await putStudioMedia(id, new Blob(["voice"], { type: "audio/webm" }));
  localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(snapshot));
  return snapshot;
}

function setup(adapter = new FakeRecognitionAdapter()) {
  const view = render(<FlowEnvironmentApp now={clock} recognitionAdapter={adapter} />);
  async function command(text: string) {
    if (!screen.queryByLabelText("Tell Flow what to change")) fireEvent.click(screen.getByRole("button", { name: "Open Flow command" }));
    const input = screen.getByLabelText("Tell Flow what to change");
    fireEvent.change(input, { target: { value: text } }); fireEvent.submit(input.closest("form")!);
    await waitFor(() => expect(document.querySelector("[data-last-transcript]")).toHaveAttribute("data-last-transcript", text));
    await waitFor(() => expect(document.querySelector("[data-flow-feedback]")).not.toHaveAttribute("data-feedback-phase", "understanding"));
  }
  return { ...view, command, adapter };
}

beforeEach(() => {
  localStorage.clear(); window.history.replaceState({}, "", "/");
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:readiness" });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => undefined });
});

describe("bound native playback readiness", () => {
  it.each(["navigation", "selection"] as const)("cancels delayed playback when direct pointer %s supersedes it", async (operation) => {
    const playback = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    let reader: MockInstance<typeof mediaRepository.getStudioMedia> | undefined;
    try {
      const initial = await fixture(`pointer-${operation}`);
      initial.document.studio.journalEntries.push({ ...structuredClone(initial.document.studio.journalEntries[0]!), id: "J2", title: "Garden", audioAssetId: undefined, recordingDurationMs: 0, bookmarks: [] });
      localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(initial)); const view = setup();
      await view.command('Open journal entry "Station"'); await waitFor(() => expect(document.querySelector("audio")).toBeInTheDocument());
      await view.command("Go home");
      const finishes: ((blob: Blob) => void)[] = [];
      reader = vi.spyOn(mediaRepository, "getStudioMedia").mockImplementation(() => new Promise<Blob>((resolve) => { finishes.push(resolve); }));
      await view.command("Play journal bookmark 2"); await waitFor(() => expect(finishes.length).toBeGreaterThan(0));
      if (operation === "navigation") {
        fireEvent.click(screen.getByRole("button", { name: "Open Flow home" }));
        fireEvent.click(await screen.findByRole("button", { name: "Open Journal" }));
      } else {
        fireEvent.click(screen.getByRole("button", { name: /^Garden/ }));
        await waitFor(() => expect(screen.getByRole("textbox", { name: "Entry title" })).toHaveValue("Garden"));
        fireEvent.click(screen.getByRole("button", { name: /^Station/ }));
      }
      await waitFor(() => expect(finishes.length).toBeGreaterThan(1));
      const feedback = document.querySelector("[data-flow-feedback]")?.textContent;
      await act(async () => finishes.forEach((finish) => finish(new Blob(["voice"], { type: "audio/webm" }))));
      await waitFor(() => expect(document.querySelector("audio")).toBeInTheDocument());
      expect(playback).not.toHaveBeenCalled(); expect(document.querySelector("[data-flow-feedback]")?.textContent).toBe(feedback);
      expect(saved().document).toEqual(initial.document); expect(saved().past).toEqual([]); expect(saved().future).toEqual([]);
    } finally { reader?.mockRestore(); playback.mockRestore(); }
  });
  it.each(["rename", "delete"] as const)("does not play a stale source after an intervening %s while its Blob loads", async (operation) => {
    const playback = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    let reader: MockInstance<typeof mediaRepository.getStudioMedia> | undefined;
    try {
      const initial = await fixture(`delayed-${operation}`), view = setup();
      await view.command('Open journal entry "Station"');
      await waitFor(() => expect(document.querySelector("audio")).toBeInTheDocument());
      await view.command("Go home");
      let finish!: (blob: Blob) => void;
      reader = vi.spyOn(mediaRepository, "getStudioMedia").mockImplementation(() => new Promise<Blob>((resolve) => { finish = resolve; }));
      await view.command("Play journal bookmark 2");
      await waitFor(() => expect(finish).toBeTypeOf("function"));
      expect(playback).not.toHaveBeenCalled();
      if (operation === "rename") await view.command('Rename this journal to "New station notes"');
      else { await view.command("Delete the current journal entry"); await view.command("Confirm"); }
      const current = saved(), feedback = document.querySelector("[data-flow-feedback]")!.textContent;
      await act(async () => finish(new Blob(["voice"], { type: "audio/webm" })));
      expect(playback).not.toHaveBeenCalled(); expect(saved()).toEqual(current);
      expect(document.querySelector("[data-flow-feedback]")!.textContent).toBe(feedback);
      if (operation === "rename") {
        const expected = structuredClone(initial.document); expected.studio.journalEntries[0]!.title = "New station notes";
        expect(current.document).toEqual(expected); expect(current.past).toHaveLength(1);
      } else {
        expect(current.document.studio.journalEntries).toEqual([]); expect(current.document.studio.memories).toEqual([]); expect(current.past).toHaveLength(1);
      }
    } finally { reader?.mockRestore(); playback.mockRestore(); }
  });
  it("still reports a fresh off-route play denial after a successful document edit", async () => {
    const playback = vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(new DOMException("Gesture required", "NotAllowedError"));
    try {
      await fixture("fresh-denied"); const view = setup();
      await view.command('Open journal entry "Station"'); await view.command('Rename this journal to "New station notes"');
      const beforePlayback = saved(); await view.command("Go home"); await view.command("Play journal bookmark 2");
      await waitFor(() => expect(playback).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(document.querySelector("[data-flow-feedback]")).toHaveAttribute("data-feedback-phase", "error"));
      expect(document.querySelector("[data-flow-feedback]")!.textContent).toContain("Playback could not start");
      expect(saved()).toEqual(beforePlayback);
    } finally { playback.mockRestore(); }
  });
  it.each([
    ["journal", "typed", "Play journal bookmark 2", 42],
    ["journal", "voice", "Play journal bookmark 2", 42],
    ["memories", "typed", "Play this memory", 30],
    ["memories", "voice", "Play this memory", 30],
  ] as const)("loads the fresh %s source from Home through %s input", async (route, mode, utterance, position) => {
    const playback = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    try {
      const initial = await fixture(`readiness-${route}-${mode}`), view = setup();
      await view.command(route === "journal" ? 'Open journal entry "Station"' : 'Open memory "Station excerpt"');
      await waitFor(() => expect(document.querySelector("audio")).toBeInTheDocument());
      await view.command("Go home");
      expect(document.querySelector("audio")).not.toBeInTheDocument();
      if (mode === "typed") await view.command(utterance);
      else {
        fireEvent.click(screen.getByRole("button", { name: "Start Flow Live" }));
        await waitFor(() => expect(view.adapter.startCount).toBe(1));
        act(() => view.adapter.emitFinal(utterance, "off-route-playback"));
      }
      await waitFor(() => expect(playback, `${window.location.pathname}: ${document.querySelector("[data-flow-feedback]")?.textContent}`).toHaveBeenCalledTimes(1));
      expect(window.location.pathname).toContain(route);
      expect(document.querySelector("audio")!.currentTime).toBe(position);
      expect(document.querySelector("[data-flow-feedback]")).not.toHaveAttribute("data-feedback-phase", "error");
      expect(saved().document).toEqual(initial.document); expect(saved().past).toEqual([]); expect(saved().future).toEqual([]);
    } finally { playback.mockRestore(); }
  });
});
