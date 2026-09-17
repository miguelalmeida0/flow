import { beforeEach, expect, it, vi } from "vitest";
import { createFreshLifeSnapshot, readLifeSnapshot, LIFE_STORAGE_KEY } from "../../domain/life-storage";
import type { ControllerOptions } from "../../app/lifeCommandController";
import type { PendingLifeChange } from "../../app/environment-types";
import type { LifeContext } from "../../domain/life-model";
import { convertVoiceMarker } from "./markerConversions";
import { recordingDocument } from "./recordingTarget";
import { runMarkerCommand } from "./markerController";
import { canonicalPerson } from "../friends/people";
import * as messaging from "../friends/messaging";
import { journalVoiceMarkers } from "./journalMarkers";

const at = "2026-09-12T10:00:00Z";
function fixture(excerpt = "We should meet.") {
  const snapshot = createFreshLifeSnapshot("2026-09-12");
  snapshot.document.people = [canonicalPerson({ id: "sarah", kind: "person", name: "Sarah", createdAt: at, updatedAt: at })];
  const marker = { id: "m", recordingId: "note", kind: "plan" as const, title: excerpt, excerpt, startMs: 0, endMs: 1000, segmentIds: [], origin: "manual" as const, alignment: "segment-estimate" as const, status: "kept" as const, createdAt: at };
  snapshot.document.friends!.voiceNotes.push({ id: "note", kind: "voice-note", title: "Note", text: excerpt, recipient: { kind: "person", id: "sarah" }, status: "ready", recordingState: "idle", recordingDurationMs: 1000, transcriptSegments: [], markers: [marker], createdAt: at, updatedAt: at });
  let pending: PendingLifeChange | undefined, context: LifeContext = { route: "people", activeVoiceNoteId: "note" };
  const feedback = vi.fn(), commit = vi.fn<ControllerOptions["commit"]>(() => true);
  const options = { getSnapshot: () => snapshot, getContext: () => context, getPending: () => pending, setPending: (value: PendingLifeChange) => { pending = value; }, updateContext: (patch: Partial<LifeContext>) => { context = { ...context, ...patch }; }, setFeedback: feedback, now: () => new Date(at), commit } as unknown as ControllerOptions;
  return { snapshot, marker, options, commit, feedback, pending: () => pending };
}
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
it("accumulates a date and clock across separate follow-ups and formats half-hour ambiguity", () => {
  const f = fixture();
  const execute = (timeAnswer?: string) => { const authority = f.pending()?.friend; return convertVoiceMarker({ type: "recording-marker", operation: "calendar", ...(authority?.kind === "marker-action" ? authority.intent : {}), timeAnswer }, { kind: "voice-note", id: "note" }, f.marker, f.options, timeAnswer ?? "Make a plan", "voice", "one"); };
  execute(); execute("Friday"); execute("6:30");
  expect(f.pending()?.friend).toMatchObject({ kind: "marker-action", choices: [{ label: "6:30 AM" }, { label: "6:30 PM" }] });
  execute("6:30 PM");
  expect(f.pending()?.friend).toMatchObject({ kind: "marker-calendar", proposal: { event: { dateKey: "2026-09-18", start: 1110 } } });
  expect(f.commit).not.toHaveBeenCalled();
});
it("uses the delivered envelope after undo and asks about an unknown incoming author", () => {
  const f = fixture("I'll send you the photos tomorrow.");
  const message = { id: "sent", recipient: { kind: "person" as const, id: "sarah" }, direction: "incoming" as const, body: f.marker.excerpt, revision: 2, status: "ready" as const, idempotencyKey: "sent", createdAt: "2026-09-01T10:00:00Z", updatedAt: at, attachment: { kind: "voice" as const, title: "Promise", text: f.marker.excerpt, durationMs: 1000, assetId: "delivered-audio", markers: [{ ...f.marker, id: "shared-m" }] } };
  vi.spyOn(messaging, "deliveryReceipts").mockReturnValue([{ id: "receipt", message, idempotencyKey: "sent", deliveredAt: at, label: "Local", transport: "flow-local", scope: "local" }]);
  const target = { kind: "shared-message" as const, id: "sent" };
  expect(recordingDocument(f.snapshot.document, target)?.audioAssetId).toBe("delivered-audio");
  runMarkerCommand({ type: "recording-marker", operation: "commitment", target, markerId: "shared-m" }, f.options, "Keep that commitment", "voice", "keep");
  expect(f.pending()?.friend).toMatchObject({ kind: "marker-action", stage: "direction" }); expect(f.commit).not.toHaveBeenCalled();
  const marker = recordingDocument(f.snapshot.document, target)!.markers[0]!;
  convertVoiceMarker({ type: "recording-marker", operation: "commitment", direction: "waiting-on" }, target, marker, f.options, "They owe this", "voice", "keep");
  expect(f.commit.mock.calls[0]?.[0]).toBeDefined();
  expect(JSON.stringify(f.commit.mock.calls)).toContain('"dueAt":"2026-09-02"');
});
it("bridges legacy bookmarks after migration without changing a linked Memory identity", () => {
  const f = fixture();
  f.snapshot.document.studio.journalEntries.push({ id: "journal", kind: "journal-entry", title: "Old journal", text: "Old words", status: "saved", recordingState: "idle", recordingDurationMs: 2000, bookmarks: [{ id: "old-bookmark", timestampMs: 1000, transcriptAnchor: "Old words", createdAt: at }], transcriptSegments: [], photoAssetIds: [], drawings: [], tags: [], createdAt: at, updatedAt: at });
  f.snapshot.document.studio.memories.push({ id: "memory", kind: "memory", title: "Old memory", journalEntryId: "journal", composition: "page", passage: "Old words", bookmarkId: "old-bookmark", showDate: true, datePlacement: "inline", textScale: 1, textOffset: { x: 0, y: 0 }, audioEnabled: false, audioInMs: 1000, status: "saved", createdAt: at, updatedAt: at });
  localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify({ ...f.snapshot, document: { ...f.snapshot.document, schemaVersion: 5 } }));
  const restored = readLifeSnapshot("2026-09-12")!;
  expect(journalVoiceMarkers(restored.document.studio.journalEntries[0]!)).toMatchObject([{ id: "legacy-marker-old-bookmark", alignment: "position", startMs: 1000, endMs: 1000 }]);
  expect(restored.document.studio.memories[0]?.bookmarkId).toBe("old-bookmark");
});
