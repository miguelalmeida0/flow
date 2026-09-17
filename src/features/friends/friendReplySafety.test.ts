import { beforeEach, expect, it, vi } from "vitest";
import { createFreshLifeSnapshot } from "../../domain/life-storage";
import type { ControllerOptions } from "../../app/lifeCommandController";
import type { FriendIntent } from "./friendIntents";
import { runFriendCommand } from "./friendController";
import { resolveGlobalCommand } from "../../shared/command/globalInterpreter";

beforeEach(() => localStorage.clear());
it.each([
  { replyToMessageId: "missing" },
  { replyToMessageId: "shared-memory", replyToMarkerId: "unrelated-marker" },
  { replyToMessageId: "shared-memory", resolvedPersonId: "someone-else" },
])("rejects stale or mismatched explicit reply binding %j", (binding) => {
  const snapshot = createFreshLifeSnapshot("2026-09-12");
  snapshot.document.friends!.messages.push({ id: "shared-memory", recipient: { kind: "person", id: "sarah" }, authorPersonId: "sarah", direction: "incoming", body: "Dinner", status: "ready", revision: 1, idempotencyKey: "shared-memory", createdAt: "2026-09-12", updatedAt: "2026-09-12" });
  const before = structuredClone(snapshot), setFeedback = vi.fn(), commit = vi.fn();
  const options = { getSnapshot: () => snapshot, setFeedback, commit } as unknown as ControllerOptions;
  runFriendCommand({ type: "friend-voice", operation: "create", ...binding }, options, "Reply with a voice note", "voice", "stale-reply");
  expect(setFeedback).toHaveBeenCalledWith(expect.objectContaining({ phase: "clarification", title: "That reply target changed" }));
  expect(commit).not.toHaveBeenCalled(); expect(snapshot).toEqual(before);
});
it("asks for a public reply target instead of creating an unbound voice note", () => {
  const intent = resolveGlobalCommand("Reply with a voice note", { route: "people", activeVoiceNoteId: "private-draft" }, "2026-09-12").intent;
  expect(intent).toMatchObject({ type: "friend-voice", operation: "create", replyToMessageId: "" });
  const snapshot = createFreshLifeSnapshot("2026-09-12"), setFeedback = vi.fn(), commit = vi.fn();
  runFriendCommand(intent as FriendIntent, { getSnapshot: () => snapshot, getContext: () => ({ route: "people", activeVoiceNoteId: "private-draft" }), setFeedback, commit } as unknown as ControllerOptions, "Reply with a voice note", "voice", "missing-reply");
  expect(setFeedback).toHaveBeenCalledWith(expect.objectContaining({ phase: "clarification" })); expect(commit).not.toHaveBeenCalled();
});
