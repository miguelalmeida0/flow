import { beforeEach, expect, it, vi } from "vitest";
import { createFreshLifeSnapshot } from "../../domain/life-storage";
import { canonicalPerson } from "./people";
import { runRelationshipQuery } from "./relationshipQueries";
import type { ControllerOptions } from "../../app/lifeCommandController";
import * as messaging from "./messaging";
import { resolveGlobalCommand } from "../../shared/command/globalInterpreter";
import { beginCommandTrace, patchCommandTrace } from "../../app/commandTrace";
const at = "2026-09-12T10:00:00Z";
beforeEach(() => { vi.restoreAllMocks(); });
it("uses actual incoming author and the newest timestamp across notes and delivered envelopes", () => {
  const snapshot = createFreshLifeSnapshot("2026-09-12"), sarah = canonicalPerson({ id: "sarah", kind: "person", name: "Sarah", createdAt: at, updatedAt: at }); snapshot.document.people = [sarah];
  const base = { kind: "voice-note" as const, recipient: { kind: "person" as const, id: "sarah" }, status: "ready" as const, recordingState: "idle" as const, recordingDurationMs: 1000, transcriptSegments: [], markers: [], updatedAt: at };
  snapshot.document.friends!.voiceNotes = [{ ...base, id: "my-newest", title: "My recommendation", text: "I like the camera", createdAt: at }, { ...base, id: "her-old", authorPersonId: "sarah", title: "Sarah older", text: "Try the old camera", createdAt: "2026-09-10" }];
  const message = { id: "received", recipient: { kind: "person" as const, id: "sarah" }, direction: "incoming" as const, authorPersonId: "sarah", body: "New camera recommendation", revision: 1, status: "ready" as const, idempotencyKey: "incoming", createdAt: "2026-09-11", updatedAt: at, attachment: { kind: "voice" as const, title: "Sarah newest", text: "Use the new camera", durationMs: 1000 } };
  vi.spyOn(messaging, "deliveryReceipts").mockReturnValue([{ id: "receipt", message, idempotencyKey: "incoming", deliveredAt: at, label: "Local", transport: "flow-local", scope: "local" }]);
  const updateContext = vi.fn(), setFeedback = vi.fn();
  const options = { getSnapshot: () => snapshot, getContext: () => ({ route: "people" }), now: () => new Date(at), navigate: vi.fn(), updateContext, setFeedback } as unknown as ControllerOptions;
  runRelationshipQuery({ type: "friend-query", operation: "notes", recipientQuery: "Sarah", query: "camera" }, options, "What camera Sarah recommended", "voice", "query");
  expect(updateContext).toHaveBeenLastCalledWith(expect.objectContaining({ activeMessageId: "received", activeVoiceNoteId: undefined })); expect(setFeedback).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Sarah newest" }));
});
it.each(["Actually 7:30", "7pm"])("keeps %s inside the current marker Calendar preview", (text) => {
  expect(resolveGlobalCommand(text, { route: "journal", activeJournalEntryId: "journal", friendPending: true, friendPendingKind: "marker-calendar", pending: "confirmation" }, "2026-09-12").intent).toMatchObject({ type: "friend-draft", operation: "calendar-refine" });
});
it.each([1, 2])("binds a reply only when the incoming message query has one result (%s matches)", (count) => {
  const snapshot = createFreshLifeSnapshot("2026-09-12");
  snapshot.document.people = [canonicalPerson({ id: "sarah", kind: "person", name: "Sarah", createdAt: at, updatedAt: at })];
  snapshot.document.friends!.messages = Array.from({ length: count }, (_, index) => ({ id: `received-${index}`, recipient: { kind: "person" as const, id: "sarah" }, direction: "incoming" as const, authorPersonId: "sarah", body: "Dinner", revision: 1, status: "ready" as const, idempotencyKey: `received-${index}`, createdAt: at, updatedAt: at }));
  vi.spyOn(messaging, "deliveryReceipts").mockReturnValue([]);
  const updateContext = vi.fn();
  runRelationshipQuery({ type: "friend-query", operation: "messages", recipientQuery: "Sarah", query: "Dinner" }, { getSnapshot: () => snapshot, getContext: () => ({ route: "people", activeMessageId: "older-selection" }), updateContext, setFeedback: vi.fn() } as unknown as ControllerOptions, "What did Sarah say about Dinner?", "voice", "incoming-query");
  expect(updateContext).toHaveBeenLastCalledWith({ activeMessageId: count === 1 ? "received-0" : undefined, activeVoiceNoteId: undefined, selectedVoiceMarkerId: undefined });
});
it("updates an earlier trace without attributing a late receipt to the newer request", () => {
  beginCommandTrace("Send A", { type: "friend-message" }, { route: "people", focusedPersonId: "sarah" }, [], undefined, "command-a");
  beginCommandTrace("Draft B", { type: "friend-message" }, { route: "people" }, [], undefined, "command-b");
  patchCommandTrace("command-a", { delivery: { status: "delivered", messageId: "a", messageRevision: 2, receiptId: "receipt-a" } });
  expect(window.__FLOW_COMMAND_TRACE__?.commandId).toBe("command-b"); expect(window.__FLOW_COMMAND_TRACE__?.actualActions).toEqual([]); expect(window.__FLOW_COMMAND_TRACE__?.delivery).toBeUndefined();
  expect(window.__FLOW_COMMAND_TRACES__?.find(({ commandId }) => commandId === "command-a")?.delivery?.receiptId).toBe("receipt-a");
});
