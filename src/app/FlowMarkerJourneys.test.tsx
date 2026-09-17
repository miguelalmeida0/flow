import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FlowEnvironmentApp } from "./FlowEnvironmentApp";
import { FakeRecognitionAdapter } from "../features/day-planner/voice/fakeRecognition";
import { createFreshLifeSnapshot, LIFE_STORAGE_KEY } from "../domain/life-storage";
import type { LifeSnapshot } from "../domain/life-model";
import { deliveryReceipts } from "../features/friends/messaging";
import { canonicalPerson } from "../features/friends/people";
import { manualVoiceMarker } from "../features/studio/voiceMarkers";
import * as media from "../features/studio/mediaRepository";

const at = "2026-09-12T10:00:00Z", now = () => new Date(at);
const read = () => JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
const original = new Map<string, Blob>();
beforeEach(() => {
  localStorage.clear(); original.clear();
  const snapshot = createFreshLifeSnapshot("2026-09-12");
  snapshot.document.people = [canonicalPerson({ id: "sarah", kind: "person", name: "Sarah", createdAt: at, updatedAt: at })];
  const segments = [{ id: "phrase-plan", text: "We should get dinner Thursday.", startMs: 10000, endMs: 15000, source: "voice" as const, alignment: "segment-estimate" as const }, { id: "phrase-question", text: "Are you free Saturday?", startMs: 20000, endMs: 25000, source: "voice" as const, alignment: "segment-estimate" as const }];
  const markers = segments.map((segment, index) => ({ ...manualVoiceMarker("private-journal", [segment], segment.endMs, `marker-${index}`, at), kind: index === 0 ? "plan" as const : "question" as const }));
  snapshot.document.studio.mediaAssets.push({ id: "private-original", kind: "journal-audio", name: "Private audio", mimeType: "audio/webm", size: 100, createdAt: at });
  snapshot.document.studio.journalEntries.push({ id: "private-journal", kind: "journal-entry", title: "Private journal", text: "Private opening. We should get dinner Thursday. Are you free Saturday? Private ending.", status: "draft", tags: [], createdAt: at, updatedAt: at, audioAssetId: "private-original", recordingState: "idle", recordingDurationMs: 30000, transcriptSegments: segments, bookmarks: [], markers, photoAssetIds: [], drawings: [] });
  localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(snapshot)); window.history.replaceState({}, "", "/journal");
  original.set("private-original", new Blob(["private whole recording"], { type: "audio/webm" }));
  vi.spyOn(media, "getStudioMedia").mockImplementation(async (id) => original.get(id));
  vi.spyOn(media, "putStudioMedia").mockImplementation(async (id, blob) => { original.set(id, blob); });
  vi.spyOn(media, "removeOrphanedStudioMedia").mockResolvedValue(undefined);
  Object.defineProperty(navigator, "locks", { configurable: true, value: { request: async (_key: string, options: unknown, task?: () => Promise<unknown>) => typeof options === "function" ? options() : task!() } });
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:shared-recording") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined); vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function setup(mode: "typed" | "voice") {
  const adapter = new FakeRecognitionAdapter(); render(<FlowEnvironmentApp now={now} recognitionAdapter={adapter} />);
  await waitFor(() => expect(adapter.startCount).toBe(1));
  await screen.findByTestId("journal-space");
  fireEvent.click(screen.getByRole("button", { name: /Private journal.*marks/ }));
  let sequence = 0;
  return async (text: string) => {
    if (mode === "voice") await act(async () => adapter.emitFinal(text, `markers-${++sequence}`));
    else { if (!screen.queryByLabelText("Tell Flow what to change")) fireEvent.click(screen.getByRole("button", { name: "Open Flow command" })); const field = screen.getByLabelText("Tell Flow what to change"); fireEvent.change(field, { target: { value: text } }); fireEvent.submit(field.closest("form")!); }
    await waitFor(() => expect(document.querySelector("[data-last-transcript]")).toHaveAttribute("data-last-transcript", text));
  };
}
it.each(["typed", "voice"] as const)("plays the selected original timestamp then shares only its literal text with explicit confirmation through %s", async (mode) => {
  const command = await setup(mode), before = read().document.studio.journalEntries;
  await command("Play the second marker");
  await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalled());
  expect(document.querySelector("audio")?.currentTime).toBe(19.65);
  await command("Send that part to Sarah");
  expect(document.body.textContent).toContain("Send the voice clip or the text?");
  await command("The text"); await waitFor(() => expect(read().document.friends?.messages).toHaveLength(1));
  expect(read().document.friends?.messages[0]?.body).toBe("Are you free Saturday?"); expect(deliveryReceipts()).toHaveLength(0);
  await command("yes"); await waitFor(() => expect(deliveryReceipts()).toHaveLength(1));
  expect(JSON.stringify(deliveryReceipts()[0]?.message)).not.toContain("private-journal");
  expect(JSON.stringify(deliveryReceipts()[0]?.message)).not.toContain("private-original");
  expect(read().document.studio.journalEntries).toEqual(before);
});
it("asks for missing plan time and confirms the exact proposed Calendar event without sending anything", async () => {
  const command = await setup("voice");
  await command("Select the first marker"); const before = read();
  await command("Make a plan from that"); expect(document.body.textContent).toContain("What time should I plan it?");
  await command("Seven"); expect(document.body.textContent).toContain("Add this plan to Calendar?");
  expect(read().past).toHaveLength(before.past.length);
  await command("yes"); await waitFor(() => expect(read().document.calendars["2026-09-17"]?.events).toHaveLength(1));
  expect(read().document.calendars["2026-09-17"]?.events[0]?.start).toBe(19 * 60);
  expect(deliveryReceipts()).toHaveLength(0); expect(read().past).toHaveLength(before.past.length + 1);
  expect(read().document.friends?.links.at(-1)?.source).toEqual({ kind: "marker", id: "marker-0" });
});
it("keeps the whole original private when bounded clip decoding is unavailable", async () => {
  const command = await setup("voice");
  await command("Select the second marker"); await command("Send that part to Sarah"); await command("The voice clip");
  await waitFor(() => expect(document.body.textContent).toContain("No moment was shared"));
  expect(read().document.friends?.messages).toHaveLength(0); expect(deliveryReceipts()).toHaveLength(0);
  expect(original.size).toBe(1);
});
it.each(["typed", "voice"] as const)("exports selected audio bytes and accepts literal marker reply dictation through %s", async (mode) => {
  vi.stubGlobal("indexedDB", {});
  const samples = new Float32Array(30000).fill(0.9); samples.fill(0.1, 19650, 25000);
  vi.stubGlobal("AudioContext", class { async decodeAudioData() { return { sampleRate: 1000, numberOfChannels: 1, getChannelData: () => samples }; } async close() {} });
  Object.defineProperty(original.get("private-original")!, "arrayBuffer", { value: async () => new ArrayBuffer(4) });
  const command = await setup(mode), before = read().document.studio.journalEntries;
  await command("Select the second marker"); await command("Send that part to Sarah"); await command("The voice clip");
  await waitFor(() => expect(read().document.friends?.messages).toHaveLength(1));
  const attachment = read().document.friends!.messages[0]!.attachment!;
  expect(attachment.assetId).not.toBe("private-original"); expect(original.get(attachment.assetId!)?.size).toBe(44 + 5350 * 2);
  expect(attachment.markers?.[0]).toMatchObject({ startMs: 0, endMs: 5350, excerpt: "Are you free Saturday?" });
  expect(attachment.markers?.[0]?.id).not.toBe("marker-1"); expect(deliveryReceipts()).toHaveLength(0);
  await command("yes"); await waitFor(() => expect(deliveryReceipts()).toHaveLength(1));
  expect(deliveryReceipts()[0]?.message.attachment).toEqual(attachment);
  expect(JSON.stringify(deliveryReceipts()[0]?.message)).not.toMatch(/private-original|private-journal|marker-1/);
  expect(read().document.studio.journalEntries).toEqual(before); expect(original.has("private-original")).toBe(true);
  const originalMessageId = read().document.friends!.messages[0]!.id;
  await command("Seek shared recording to two seconds");
  await waitFor(() => expect(screen.getByLabelText<HTMLAudioElement>(/^Shared recording:/).currentTime).toBe(2));
  await command("Reply to the first marker"); await command("Saturday works for me, actually cancel lunch please.");
  await waitFor(() => expect(read().document.friends?.messages).toHaveLength(2));
  const reply = read().document.friends!.messages[1]!;
  expect(reply.replyToMarkerId).toBe(attachment.markers![0]!.id);
  expect(reply.replyToMessageId).toBe(originalMessageId);
  expect(reply.body).toBe("Saturday works for me, actually cancel lunch please.");
  expect(deliveryReceipts()).toHaveLength(1); await command("yes"); await waitFor(() => expect(deliveryReceipts()).toHaveLength(2));
  expect(deliveryReceipts().find(({ message }) => message.id === reply.id)?.message.replyToMarkerId).toBe(attachment.markers![0]!.id);
  expect(deliveryReceipts().find(({ message }) => message.id === reply.id)?.message.replyToMessageId).toBe(originalMessageId);
  fireEvent.click(screen.getByRole("button", { name: /^Play marker 1:/ }));
  await command("Reply to the first marker"); expect(document.body.textContent).toContain("What would you like to reply?");
  await command("Never mind"); await command("A cancelled reply"); expect(read().document.friends?.messages).toHaveLength(2);
  await command("Reply to the first marker"); await command("Open Friends"); await command("A reply after navigation"); expect(read().document.friends?.messages).toHaveLength(2);
});

it.each(["typed", "voice"] as const)("converts the selected Journal moment with the exact commitment demo phrase through %s", async (mode) => {
  const command = await setup(mode), calendar = read().document.calendars;
  await command("Select the first marker"); await command("Make that a commitment.");
  expect(document.body.textContent).toContain("Who is this with?");
  await command("Sarah"); expect(document.body.textContent).toContain("Whose commitment is this?");
  await command("I owe this"); await waitFor(() => expect(read().document.commitments).toHaveLength(1));
  expect(read().document.commitments[0]).toMatchObject({ personId: "sarah", direction: "i-owe", title: "We should get dinner Thursday." });
  expect(read().document.friends?.links.at(-1)?.source).toEqual({ kind: "marker", id: "marker-0" });
  expect(read().document.calendars).toEqual(calendar); expect(deliveryReceipts()).toHaveLength(0);
});
