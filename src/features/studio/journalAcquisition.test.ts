import { describe, expect, it } from "vitest";
import { completeJournalCreation } from "./journalAcquisition";
import { acceptanceFixture, acceptanceClock } from "../voice-intelligence/acceptanceFixtures";
import type { LifeSnapshot } from "../../domain/life-model";
import type { StudioMediaAsset } from "../../domain/studio-model";

const origin = { revision: 1, transactionId: "creation-J1" };
const asset: StudioMediaAsset = { id: "audio-J1", kind: "journal-audio", name: "J1.webm", mimeType: "audio/webm", size: 0, createdAt: acceptanceClock.toISOString() };
function fixture(): LifeSnapshot {
  const before = acceptanceFixture("empty-home").snapshot.document;
  const after = structuredClone(before);
  after.studio.journalEntries = [{ id: "J1", kind: "journal-entry", title: "New entry", text: "", status: "draft", recordingState: "idle", recordingDurationMs: 0, photoAssetIds: [], bookmarks: [], transcriptSegments: [], drawings: [], tags: [], createdAt: acceptanceClock.toISOString(), updatedAt: acceptanceClock.toISOString() }];
  return { revision: 1, document: after, past: [{ document: before }], future: [], lastTransaction: { id: origin.transactionId, at: acceptanceClock.toISOString(), source: "voice", transcript: "Let me talk", summary: "New entry", before, after, actionTypes: ["journal.create"] } };
}
describe("Journal creation acquisition ownership", () => {
  it("amends exactly the latest creation AFTER without another history entry", () => {
    const before = fixture(), expected = structuredClone(before);
    expected.revision = 2;
    expected.document.studio.mediaAssets.push(asset);
    Object.assign(expected.document.studio.journalEntries[0]!, { recordingState: "recording", audioAssetId: asset.id });
    expected.lastTransaction!.after = expected.document;
    expected.lastTransaction!.actionTypes.push("media.register", "journal.update");
    const result = completeJournalCreation(before, "J1", origin, asset, () => acceptanceClock);
    expect(result).toEqual(expected);
    expect(before).toEqual(fixture());
    expect(result?.past).toEqual(before.past);
    expect(result?.lastTransaction?.before).toEqual(before.lastTransaction?.before);
  });
  it.each(["revision", "transaction", "foreign-entry", "missing-before", "existing-source", "future"])("rejects invalid %s authority without mutation", (reason) => {
    const snapshot = fixture();
    if (reason === "revision") snapshot.revision += 1;
    if (reason === "transaction") snapshot.lastTransaction!.id = "another-command";
    if (reason === "missing-before") delete snapshot.lastTransaction!.before;
    if (reason === "existing-source") snapshot.document.studio.mediaAssets.push(asset);
    if (reason === "future") snapshot.future.push({ document: structuredClone(snapshot.document) });
    const original = structuredClone(snapshot);
    expect(completeJournalCreation(snapshot, reason === "foreign-entry" ? "J2" : "J1", origin, asset, () => acceptanceClock)).toBeUndefined();
    expect(snapshot).toEqual(original);
  });
});
