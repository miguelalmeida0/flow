import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FlowEnvironmentApp } from "./FlowEnvironmentApp";
import { FakeRecognitionAdapter } from "../features/day-planner/voice/fakeRecognition";
import { createFreshLifeSnapshot, LIFE_STORAGE_KEY } from "../domain/life-storage";
import type { LifeSnapshot } from "../domain/life-model";
import * as media from "../features/studio/mediaRepository";
import * as clock from "../features/studio/journalRuntimeClock";
import { deliveryReceipts } from "../features/friends/messaging";

// Native recorder/storage adapters only; interpretation, controller, invariants,
// persistence/history and rendered controls below are the production pipeline.
class Recorder {
  static instances: Recorder[] = [];
  static isTypeSupported() { return true; }
  state = "inactive"; mimeType = "audio/webm";
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onstop: ((event: Event) => void) | null = null;
  constructor() { Recorder.instances.push(this); }
  start() { this.state = "recording"; }
  pause() { this.state = "paused"; }
  resume() { this.state = "recording"; }
  requestData() { this.ondataavailable?.({ data: new Blob(["actual adapter chunk"], { type: this.mimeType }) } as BlobEvent); }
  stop() { this.state = "inactive"; this.onstop?.(new Event("stop")); }
}
const blobs = new Map<string, Blob>();
const now = () => new Date("2026-09-12T12:00:00+02:00");
const read = () => JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
beforeEach(() => {
  localStorage.clear(); blobs.clear(); Recorder.instances = []; clock.setJournalRuntimePosition(undefined, 0);
  localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(createFreshLifeSnapshot("2026-09-12")));
  window.history.replaceState({}, "", "/people");
  vi.stubGlobal("MediaRecorder", Recorder); vi.stubGlobal("indexedDB", {});
  vi.spyOn(media, "putStudioMedia").mockImplementation(async (id, blob) => { blobs.set(id, blob); });
  vi.spyOn(media, "getStudioMedia").mockImplementation(async (id) => blobs.get(id));
  vi.spyOn(media, "removeOrphanedStudioMedia").mockResolvedValue(undefined);
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })) } });
  Object.defineProperty(navigator, "locks", { configurable: true, value: { request: async (_key: string, options: unknown, task?: () => Promise<unknown>) => typeof options === "function" ? options() : task!() } });
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:voice-note") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function setup(mode: "typed" | "voice", replyToMemory: false | "pointer" | "voice" | "voice-ambiguous" = false) {
  const adapter = new FakeRecognitionAdapter();
  const view = render(<FlowEnvironmentApp now={now} recognitionAdapter={adapter} />);
  await waitFor(() => expect(adapter.startCount).toBe(1));
  let sequence = 0;
  async function command(text: string) {
    if (mode === "voice") await act(async () => adapter.emitFinal(text, `note-${++sequence}`));
    else { if (!screen.queryByLabelText("Tell Flow what to change")) fireEvent.click(screen.getByRole("button", { name: "Open Flow command" })); const input = screen.getByLabelText("Tell Flow what to change"); fireEvent.change(input, { target: { value: text } }); fireEvent.submit(input.closest("form")!); }
    await waitFor(() => expect(document.querySelector("[data-last-transcript]")).toHaveAttribute("data-last-transcript", text));
  }
  if (!replyToMemory) await command("Add friend Sarah");
  if (replyToMemory) {
    await command("Open Sarah");
    if (replyToMemory === "pointer") fireEvent.click(screen.getByRole("button", { name: "Voice reply" }));
    else {
      await command("What did Sarah say about Dinner?"); await command("Reply with a voice note");
      if (replyToMemory === "voice-ambiguous") {
        expect(document.body.textContent).toContain("Which shared message are you replying to?");
        expect(read().document.friends?.voiceNotes).toHaveLength(0); expect(Recorder.instances).toHaveLength(0);
        await command("The second one");
      }
    }
  }
  else await command("Send Sarah a voice note");
  await waitFor(() => expect(read().document.friends?.voiceNotes[0]?.recordingState).toBe("recording"));
  return { command, adapter, view };
}
it.each(["pointer", "voice", "voice-ambiguous"] as const)("keeps a %s voice reply bound to the shared Memory through recording, draft and receipt", async (entry) => {
  const initial = read(), at = now().toISOString(); initial.document.people = [{ id: "sarah", kind: "person", name: "Sarah", createdAt: at, updatedAt: at }];
  initial.document.friends!.messages = [{ id: "shared-memory-a", recipient: { kind: "person", id: "sarah" }, direction: "incoming", authorPersonId: "sarah", body: "Dinner", revision: 1, status: "ready", idempotencyKey: "shared-a", attachment: { kind: "memory", title: "Dinner", text: "A lovely evening" }, createdAt: at, updatedAt: at }];
  if (entry === "voice-ambiguous") initial.document.friends!.messages.push({ ...initial.document.friends!.messages[0]!, id: "shared-memory-b", idempotencyKey: "shared-b", body: "Dinner follow-up", attachment: { kind: "memory", title: "Dinner follow-up", text: "Another evening" } });
  localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(initial));
  const { command } = await setup("voice", entry);
  const targetId = entry === "voice-ambiguous" ? "shared-memory-b" : "shared-memory-a";
  expect(read().document.friends!.voiceNotes[0]!.replyToMessageId).toBe(targetId);
  await command("Same here, a lovely evening."); await command("Send it"); await waitFor(() => expect(read().document.friends?.messages).toHaveLength(initial.document.friends!.messages.length + 1));
  const reply = read().document.friends!.messages.find(({ direction }) => direction === "outgoing")!; expect(reply.replyToMessageId).toBe(targetId); expect(reply.replyToMarkerId).toBeUndefined();
  await command("yes"); await waitFor(() => expect(deliveryReceipts()).toHaveLength(1));
  expect(deliveryReceipts()[0]?.message.replyToMessageId).toBe(targetId);
  await command("Undo"); expect(deliveryReceipts()[0]?.message.replyToMessageId).toBe(targetId);
});
it.each(["typed", "voice"] as const)("records, separates narrative controls, finalizes, then confirms one delivery through %s", async (mode) => {
  const { command } = await setup(mode);
  await command("He told me to stop and go home.");
  await waitFor(() => expect(read().document.friends?.voiceNotes[0]?.text).toBe("He told me to stop and go home."));
  await command("Pause"); await waitFor(() => expect(Recorder.instances[0]?.state).toBe("paused"));
  await command("Continue"); await waitFor(() => expect(Recorder.instances[0]?.state).toBe("recording"));
  expect(Recorder.instances).toHaveLength(1);
  await command("Send it");
  await waitFor(() => expect(read().document.friends?.messages).toHaveLength(1));
  expect(read().document.friends?.voiceNotes[0]?.recordingState).toBe("idle"); expect(deliveryReceipts()).toHaveLength(0);
  expect(read().document.friends?.messages[0]?.body).toBe("He told me to stop and go home.");
  expect(blobs.get(read().document.friends!.messages[0]!.attachment!.assetId!)?.size).toBeGreaterThan(0);
  await command("yes"); await waitFor(() => expect(deliveryReceipts()).toHaveLength(1));
  await command("yes"); expect(deliveryReceipts()).toHaveLength(1);
  await command("Set voice note volume to 25 percent"); await waitFor(() => expect(screen.getByLabelText<HTMLAudioElement>("Original voice note").volume).toBe(0.25));
  await command("Set voice note speed to 1.5"); await waitFor(() => expect(screen.getByLabelText<HTMLAudioElement>("Original voice note").playbackRate).toBe(1.5));
  const saved = read(); await command("Start recording"); await waitFor(() => expect(document.body.textContent).toContain("This saved recording and its moments are kept"));
  expect(read().document).toEqual(saved.document); expect(Recorder.instances).toHaveLength(1);
});
it("keeps failed audio saving unsent and does not claim it was delivered", async () => {
  const { command } = await setup("voice");
  vi.mocked(media.putStudioMedia).mockRejectedValue(new Error("disk full"));
  await command("Send it");
  await waitFor(() => expect(document.body.textContent).toContain("Voice note not ready to send"));
  expect(read().document.friends?.messages).toHaveLength(0); expect(deliveryReceipts()).toHaveLength(0);
});
it("restores the complete pre-note state with one undo and revokes the native owner", async () => {
  const { command } = await setup("typed");
  const before = read();
  expect(before.past).toHaveLength(2); // Add person, then create/acquire one note.
  const original = before.past.at(-1)!.document;
  await command("Undo");
  await waitFor(() => expect(read().document).toEqual(original));
  expect(read().document.friends?.voiceNotes).toHaveLength(0);
  expect(Recorder.instances[0]?.state).toBe("inactive");
  act(() => Recorder.instances[0]?.requestData());
  expect(read().document).toEqual(original); expect(deliveryReceipts()).toHaveLength(0);
});
it("lets final audio finish after navigation without resurrecting send authority", async () => {
  const { command } = await setup("voice");
  let finish!: () => void;
  vi.mocked(media.putStudioMedia).mockImplementation((id, blob) => new Promise<void>((resolve) => { finish = () => { blobs.set(id, blob); resolve(); }; }));
  await command("Send it"); await waitFor(() => expect(finish).toBeTypeOf("function"));
  await command("Go home"); await act(async () => finish());
  await waitFor(() => expect(read().document.friends?.voiceNotes[0]?.recordingState).toBe("idle"));
  expect(read().document.friends?.messages).toHaveLength(0); expect(deliveryReceipts()).toHaveLength(0);
  expect(window.location.pathname).toBe("/");
});
it("removes the last timed passage from audible bytes before a later send, retaining the private original", async () => {
  let elapsed = 0; vi.spyOn(performance, "now").mockImplementation(() => elapsed);
  vi.mocked(media.putStudioMedia).mockImplementation(async (id, blob) => { Object.defineProperty(blob, "arrayBuffer", { configurable: true, value: async () => new ArrayBuffer(4) }); blobs.set(id, blob); });
  const samples = new Float32Array(10000).fill(0.9); samples.fill(0.1, 0, 5000);
  vi.stubGlobal("AudioContext", class { async decodeAudioData() { return { sampleRate: 1000, numberOfChannels: 1, getChannelData: () => samples }; } async close() {} });
  const { command } = await setup("voice"); const id = read().document.friends!.voiceNotes[0]!.id;
  clock.setJournalRuntimePosition(id, 0); clock.beginRecordingUtterance(); elapsed = 5000; clock.setJournalRuntimePosition(id, elapsed);
  await command("Keep this opening sentence.");
  clock.beginRecordingUtterance(); elapsed = 10000; clock.setJournalRuntimePosition(id, elapsed);
  await command("This private ending should be removed.");
  const originalId = read().document.friends!.voiceNotes[0]!.audioAssetId!;
  await command("Delete the last part");
  await waitFor(() => expect(document.body.textContent).toContain("Remove the last part from the audio?"));
  await command("yes");
  await waitFor(() => expect(read().document.friends!.voiceNotes[0]!.audioAssetId).not.toBe(originalId));
  const edited = read().document.friends!.voiceNotes[0]!;
  expect(edited.text).toBe("Keep this opening sentence."); expect(edited.recordingDurationMs).toBe(5000);
  expect(edited.originalAudioAssetId).toBe(originalId); expect(blobs.has(originalId)).toBe(true); expect(blobs.get(edited.audioAssetId!)?.size).toBe(44 + 5000 * 2);
  await command("Send it"); await waitFor(() => expect(read().document.friends?.messages).toHaveLength(1)); await command("yes");
  await waitFor(() => expect(deliveryReceipts()).toHaveLength(1));
  expect(deliveryReceipts()[0]?.message.attachment?.assetId).toBe(edited.audioAssetId);
  expect(JSON.stringify(deliveryReceipts()[0]?.message)).not.toContain("private ending");
});
