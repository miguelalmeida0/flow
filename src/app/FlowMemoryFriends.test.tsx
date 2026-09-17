import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { FlowEnvironmentApp } from "./FlowEnvironmentApp";
import { FakeRecognitionAdapter } from "../features/day-planner/voice/fakeRecognition";
import { createFreshLifeSnapshot, LIFE_STORAGE_KEY } from "../domain/life-storage";
import type { LifeSnapshot } from "../domain/life-model";
import { canonicalPerson } from "../features/friends/people";
import { deliveryReceipts } from "../features/friends/messaging";
const at = "2026-09-12T10:00:00Z", now = () => new Date(at), read = () => JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
beforeEach(() => {
  localStorage.clear(); const snapshot = createFreshLifeSnapshot("2026-09-12");
  snapshot.document.people = [canonicalPerson({ id: "sarah", kind: "person", name: "Sarah", createdAt: at, updatedAt: at })];
  snapshot.document.studio.journalEntries = [{ id: "private", kind: "journal-entry", title: "Private", text: "Secret opening. A lovely dinner. Secret ending.", status: "saved", recordingState: "idle", recordingDurationMs: 0, photoAssetIds: [], bookmarks: [], transcriptSegments: [], drawings: [], tags: [], createdAt: at, updatedAt: at }];
  snapshot.document.studio.memories = [{ id: "memory", kind: "memory", title: "Dinner", journalEntryId: "private", composition: "page", passage: "A lovely dinner.", showDate: true, datePlacement: "inline", textScale: 1, textOffset: { x: 0, y: 0 }, audioEnabled: false, audioInMs: 0, status: "saved", createdAt: at, updatedAt: at }];
  localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(snapshot)); window.history.replaceState({}, "", "/memories");
  Object.defineProperty(navigator, "locks", { configurable: true, value: { request: async (_key: string, options: unknown, task?: () => Promise<unknown>) => typeof options === "function" ? options() : task!() } });
});
async function mount(mode: "typed" | "voice") {
  const adapter = new FakeRecognitionAdapter(), mounted = render(<FlowEnvironmentApp now={now} recognitionAdapter={adapter} />); await waitFor(() => expect(adapter.startCount).toBe(1)); let seq = 0;
  const command = async (text: string) => { if (mode === "voice") await act(async () => adapter.emitFinal(text, `memory-${++seq}`)); else { if (!screen.queryByLabelText("Tell Flow what to change")) fireEvent.click(screen.getByRole("button", { name: "Open Flow command" })); const field = screen.getByLabelText("Tell Flow what to change"); fireEvent.change(field, { target: { value: text } }); fireEvent.submit(field.closest("form")!); } await waitFor(() => expect(document.querySelector("[data-last-transcript]")).toHaveAttribute("data-last-transcript", text)); };
  return { ...mounted, command };
}
it.each(["typed", "voice"] as const)("links privately, shares only the selected composition, reacts/replies and restores nested context through %s", async (mode) => {
  const { command, unmount } = await mount(mode), before = read().document.studio.journalEntries;
  await command("Link this Memory with Sarah"); expect(read().document.studio.memories[0]?.personIds).toEqual(["sarah"]); expect(deliveryReceipts()).toHaveLength(0);
  await command("Send this Memory to Sarah"); await waitFor(() => expect(read().document.friends?.messages).toHaveLength(1)); expect(deliveryReceipts()).toHaveLength(0);
  await command("yes"); await waitFor(() => expect(deliveryReceipts()).toHaveLength(1));
  const payload = JSON.stringify(deliveryReceipts()[0]?.message); expect(payload).toContain("A lovely dinner."); expect(payload).not.toMatch(/Secret|journalEntryId|"private"|personIds/);
  expect(read().document.studio.journalEntries).toEqual(before);
  fireEvent.click(screen.getByRole("button", { name: "Heart" })); await waitFor(() => expect(read().document.friends?.reactions).toHaveLength(1)); expect(deliveryReceipts()).toHaveLength(1);
  fireEvent.change(screen.getByLabelText("Reply to Dinner"), { target: { value: "Same here" } }); fireEvent.click(screen.getByRole("button", { name: "Review reply" })); await waitFor(() => expect(read().document.friends?.messages).toHaveLength(2)); expect(deliveryReceipts()).toHaveLength(1);
  const reply = read().document.friends!.messages[1]!;
  expect(reply.replyToMessageId).toBe(deliveryReceipts()[0]!.message.id); expect(reply.replyToMarkerId).toBeUndefined();
  await command("Add 'lovely evening'"); await command("yes"); await waitFor(() => expect(deliveryReceipts()).toHaveLength(2));
  expect(deliveryReceipts().find(({ message }) => message.id === reply.id)?.message).toMatchObject({ replyToMessageId: reply.replyToMessageId, body: "Same here lovely evening" });
  expect(window.location.pathname).toBe("/people/person/sarah"); unmount(); render(<FlowEnvironmentApp now={now} recognitionAdapter={new FakeRecognitionAdapter()} />); await screen.findByRole("heading", { name: "Sarah", level: 2 });
});

it("binds a Memory reply to its clicked envelope after an unrelated shared marker was selected", async () => {
  const initial = read(), base = { recipient: { kind: "person" as const, id: "sarah" }, direction: "incoming" as const, authorPersonId: "sarah", revision: 1, status: "ready" as const, createdAt: at, updatedAt: at };
  initial.document.friends!.messages = [{ ...base, id: "shared-memory-a", idempotencyKey: "a", body: "Dinner", attachment: { kind: "memory", title: "Dinner", text: "A lovely dinner." } }, { ...base, id: "shared-note-b", idempotencyKey: "b", body: "Saturday", attachment: { kind: "voice", title: "Different note", text: "Saturday", markers: [{ id: "shared-marker-b", title: "Question", excerpt: "Saturday?", kind: "question", startMs: 0, endMs: 1000 }] } }];
  localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(initial)); window.history.replaceState({}, "", "/people/person/sarah");
  const { command } = await mount("voice"); fireEvent.click(screen.getByRole("button", { name: "Play marker 1: Question" }));
  fireEvent.change(screen.getByLabelText("Reply to Dinner"), { target: { value: "Same here" } }); fireEvent.click(screen.getByRole("button", { name: "Review reply" }));
  await waitFor(() => expect(read().document.friends?.messages).toHaveLength(3));
  const reply = read().document.friends!.messages[2]!; expect(reply.replyToMessageId).toBe("shared-memory-a"); expect(reply.replyToMarkerId).toBeUndefined();
  await command("yes"); await waitFor(() => expect(deliveryReceipts()).toHaveLength(1));
  expect(deliveryReceipts()[0]?.message.replyToMessageId).toBe("shared-memory-a"); expect(JSON.stringify(deliveryReceipts()[0]?.message)).not.toMatch(/shared-marker-b|private/);
});
it("shares only explicit free windows and never event details, then creates a plan without sending", async () => {
  const initial = read(); initial.document.calendars["2026-09-18"] = { dateKey: "2026-09-18", events: [{ id: "secret-event", title: "Private therapy", dateKey: "2026-09-18", start: 600, end: 660, kind: "fixed", priority: "high" }], deferred: [] }; localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(initial));
  const { command } = await mount("voice"); await command("Share my availability Friday with Sarah"); await waitFor(() => expect(read().document.friends?.messages).toHaveLength(1));
  expect(read().document.friends?.messages[0]?.body).toContain("free windows"); expect(JSON.stringify(read().document.friends?.messages[0])).not.toMatch(/therapy|secret-event/); expect(deliveryReceipts()).toHaveLength(0);
  await command("Never mind"); await command("Make a plan with Sarah"); expect(document.body.textContent).toContain("What day and time?"); await command("Friday"); await command("2 pm"); expect(document.body.textContent).toContain("Add this plan to Calendar?");
  const before = read().past.length; await command("yes"); await waitFor(() => expect(read().past).toHaveLength(before + 1)); expect(read().document.calendars["2026-09-18"]?.events.some(({ start, participantIds }) => start === 840 && participantIds?.includes("sarah"))).toBe(true); expect(deliveryReceipts()).toHaveLength(0);
});
it("uses canonical voice routes for Memory event/moment links and Friends collection navigation", async () => {
  const initial = read(); initial.document.studio.journalEntries[0]!.bookmarks = [{ id: "marker-source", timestampMs: 0, transcriptAnchor: "Dinner together", createdAt: at }];
  initial.document.calendars["2026-09-18"] = { dateKey: "2026-09-18", events: [{ id: "dinner-plan", title: "Dinner together", dateKey: "2026-09-18", start: 1080, end: 1140, kind: "flexible", priority: "medium" }], deferred: [] };
  localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(initial)); const { command } = await mount("voice");
  await command("Link this Memory to the calendar event Dinner together"); expect(read().document.studio.memories[0]?.calendarEventId).toBe("dinner-plan");
  await command("Link this Memory to the first Journal marker"); expect(read().document.studio.memories[0]?.recordingMoment).toEqual({ kind: "journal", recordingId: "private", markerId: "legacy-marker-marker-source" });
  expect(deliveryReceipts()).toHaveLength(0);
  await command("Open Friends"); await command("Show voice notes"); expect(screen.getByRole("button", { name: /^Voice notes$/ })).toHaveAttribute("aria-pressed", "true");
});
it("keeps a late delivery receipt on its own trace without replacing the newer draft", async () => {
  const messaging = await import("../features/friends/messaging"); let finish: ((value: Awaited<ReturnType<typeof messaging.localMessagingAdapter.deliver>>) => void) | undefined;
  const actual = messaging.localMessagingAdapter.deliver;
  const delayed = vi.spyOn(messaging.localMessagingAdapter, "deliver").mockImplementationOnce((message) => new Promise((resolve) => { finish = async () => resolve(await actual(message)); }));
  const { command } = await mount("voice"); await command("Text Sarah that first message"); await command("yes"); await waitFor(() => expect(finish).toBeDefined());
  await command("Text Sarah that newer draft"); await act(async () => finish!(undefined as never)); await waitFor(() => expect(deliveryReceipts()).toHaveLength(1));
  expect(document.body.textContent).toContain("newer draft"); expect(window.__FLOW_COMMAND_TRACE__?.transcript).toBe("Text Sarah that newer draft"); expect(window.__FLOW_COMMAND_TRACE__?.delivery).toBeUndefined();
  expect(window.__FLOW_COMMAND_TRACES__?.some(({ delivery }) => delivery?.status === "delivered" && delivery.receiptId)).toBe(true);
  await command("yes"); await waitFor(() => expect(deliveryReceipts()).toHaveLength(2)); delayed.mockRestore();
});
