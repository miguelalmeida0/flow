import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FlowEnvironmentApp } from "../app/FlowEnvironmentApp";
import { FakeRecognitionAdapter } from "../features/day-planner/voice/fakeRecognition";
import { createFreshLifeSnapshot, LIFE_STORAGE_KEY } from "../domain/life-storage";
import { canonicalPerson } from "../features/friends/people";
import * as media from "../features/studio/mediaRepository";

afterEach(() => vi.restoreAllMocks());
const cases = (["voice", "memory"] as const).flatMap(kind => (["play", "pointer", "keyboard"] as const).flatMap(activation => (["typed", "voice"] as const).map(mode => ({ kind, activation, mode }))));
it.each(cases)("binds $kind audio after native $activation before a $mode playback command", async ({ kind, activation, mode }) => {
  localStorage.clear(); const at = "2026-09-12T10:00:00Z", snapshot = createFreshLifeSnapshot("2026-09-12");
  snapshot.document.people = [canonicalPerson({ id: "sarah", kind: "person", name: "Sarah", createdAt: at, updatedAt: at })];
  for (const id of ["A", "B"]) {
    snapshot.document.studio.mediaAssets.push({ id: `audio-${id}`, kind: "shared-clip", name: id, mimeType: "audio/wav", size: 10, createdAt: at });
    snapshot.document.friends!.messages.push({ id, recipient: { kind: "person", id: "sarah" }, authorPersonId: "sarah", direction: "incoming", body: `Topic ${id}`, status: "ready", revision: 1, idempotencyKey: id, createdAt: at, updatedAt: at, attachment: { kind: "voice", assetId: `audio-${id}`, title: `Note ${id}`, text: `Topic ${id}`, durationMs: 30000, markers: [{ id: `marker-${id}`, title: id, excerpt: `Topic ${id}`, kind: "question", startMs: 0, endMs: 1000 }] } });
  }
  if (kind === "memory") { snapshot.document.friends!.messages[0]!.attachment!.kind = "memory"; snapshot.document.friends!.messages[0]!.attachment!.mediaType = "audio"; }
  localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(snapshot)); window.history.replaceState({}, "", "/people/person/sarah");
  vi.spyOn(media, "getStudioMedia").mockResolvedValue(new Blob(["audio bytes"])); vi.spyOn(media, "removeOrphanedStudioMedia").mockResolvedValue(undefined);
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:test" }); Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => undefined });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined); vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  const adapter = new FakeRecognitionAdapter(); render(<FlowEnvironmentApp now={() => new Date(at)} recognitionAdapter={adapter} />);
  await waitFor(() => expect(adapter.startCount).toBe(1));
  await act(async () => adapter.emitFinal("Open Sarah", "open-person"));
  expect(JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!).document.friends.messages).toHaveLength(2);
  const a = await screen.findByLabelText<HTMLAudioElement>(kind === "memory" ? "Memory audio: Note A" : "Shared recording: Note A"), b = await screen.findByLabelText<HTMLAudioElement>("Shared recording: Note B");
  fireEvent.click(screen.getByRole("button", { name: "Play marker 1: B" }));
  await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalled());
  if (activation === "play") { fireEvent.play(a); fireEvent.pause(a); }
  else if (activation === "pointer") fireEvent.pointerDown(a);
  else fireEvent.keyDown(a, { key: "ArrowUp" });
  if (mode === "voice") await act(async () => adapter.emitFinal("Set shared recording volume to 25 percent", "native-volume"));
  else { if (!screen.queryByLabelText("Tell Flow what to change")) fireEvent.click(screen.getByRole("button", { name: "Open Flow command" })); const field = screen.getByLabelText("Tell Flow what to change"); fireEvent.change(field, { target: { value: "Set shared recording volume to 25 percent" } }); fireEvent.submit(field.closest("form")!); }
  await waitFor(() => expect([a.volume, b.volume]).not.toEqual([1, 1]));
  expect(document.querySelector("[data-voice-marker-id=marker-B]")?.className).not.toContain("bg-flow-neutral-soft");
  expect({ clickedA: a.volume, previouslySelectedB: b.volume }).toEqual({ clickedA: 0.25, previouslySelectedB: 1 });
});
