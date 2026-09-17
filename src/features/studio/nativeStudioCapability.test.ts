import { describe, expect, it } from "vitest";
import { createFreshLifeSnapshot } from "../../domain/life-storage";
import { interpretGlobalCommand } from "../../shared/command/globalInterpreter";
import { planStudioCommand } from "./studioCommandPlan";
import type { StudioIntent } from "./interpretation/studioInterpreter";

const now = new Date("2026-09-08T10:00:00Z");
function fixture() {
  const document = createFreshLifeSnapshot("2026-09-08").document;
  document.studio.journalEntries = [{ id: "native-entry", kind: "journal-entry", title: "Original page", text: "Untouched words.", status: "draft", recordingState: "idle", recordingDurationMs: 0, photoAssetIds: [], bookmarks: [], transcriptSegments: [], drawings: [], tags: [], createdAt: now.toISOString(), updatedAt: now.toISOString() }];
  document.studio.memories = [{ id: "native-memory", kind: "memory", journalEntryId: "native-entry", title: "Original memory", composition: "page", passage: "Untouched words.", textScale: 1, textOffset: { x: 0, y: 0 }, showDate: false, datePlacement: "inline", audioEnabled: false, audioInMs: 0, status: "draft", createdAt: now.toISOString(), updatedAt: now.toISOString() }];
  return document;
}
describe("native Studio capability preflight", () => {
  it.each([
    ["Attach original", { actionId: "journal.attach-original", entryId: "native-entry" }],
    ["Export this memory as a still image", { actionId: "memory.export", memoryId: "native-memory", format: "still" }],
    ["Export project", { actionId: "memory.export", memoryId: "native-memory", format: "project" }],
    ["Enable sound", { actionId: "atmosphere.enable-sound" }],
  ] as const)("resolves %s to a native continuation, never a completed media mutation", (utterance, continuation) => {
    const document = fixture(); const before = structuredClone(document);
    const context = { route: "home" as const, activeJournalEntryId: "native-entry", activeMemoryId: "native-memory", nowMs: now.getTime() };
    const intent = interpretGlobalCommand(utterance, context, "2026-09-08");
    const planned = planStudioCommand(intent as StudioIntent, document, context, now);
    expect(planned).toMatchObject({ status: "native-continuation", continuation });
    expect(document).toEqual(before);
  });
  it("does not export a missing linked source or substitute a different Journal", () => {
    const document = fixture(); document.studio.memories[0]!.journalEntryId = "deleted-entry";
    const before = structuredClone(document);
    expect(planStudioCommand({ type: "memory-export", format: "project" }, document, { route: "memories", activeMemoryId: "native-memory", activeJournalEntryId: "native-entry" }, now).status).toBe("clarification");
    expect(document).toEqual(before);
  });
  it("does not commit an earlier compound edit before requesting a native continuation", () => {
    const document = fixture(); const before = structuredClone(document);
    expect(planStudioCommand({ type: "studio-compound", steps: [{ type: "journal-rename", title: "Must not commit" }, { type: "journal-attach-photo" }] }, document, { route: "journal", activeJournalEntryId: "native-entry" }, now).status).toBe("clarification");
    expect(document).toEqual(before);
  });
});
