import type { LifeSnapshot } from "../../domain/life-model";
import type { StudioMediaAsset } from "../../domain/studio-model";
import { applyLifeTransaction } from "../../domain/life-transaction";

export interface JournalCreationOrigin { transactionId: string; revision: number }
export interface JournalAcquisition {
  isCurrent: () => boolean;
  complete: (asset: StudioMediaAsset) => boolean | Promise<boolean>;
}

/** Only the latest, unchanged Journal creation can receive its own successful
 * native acquisition. No historical entry or unrelated transaction is edited. */
export function completeJournalCreation(snapshot: LifeSnapshot, entryId: string, origin: JournalCreationOrigin, asset: StudioMediaAsset, now: () => Date): LifeSnapshot | undefined {
  const record = snapshot.lastTransaction;
  const entry = snapshot.document.studio.journalEntries.find(({ id }) => id === entryId);
  if (snapshot.revision !== origin.revision || record?.id !== origin.transactionId || !record.before || !record.after || !record.actionTypes.includes("journal.create")
    || record.before?.studio.journalEntries.some(({ id }) => id === entryId) || !entry || entry.recordingState !== "idle" || entry.audioAssetId
    || snapshot.future.length || !snapshot.past.length || asset.kind !== "journal-audio" || snapshot.document.studio.mediaAssets.some(({ id }) => id === asset.id)) return undefined;
  const actions = [{ type: "media.register" as const, asset }, { type: "journal.update" as const, entryId, patch: { recordingState: "recording" as const, audioAssetId: asset.id } }];
  const result = applyLifeTransaction(snapshot.document, actions, now);
  if (result.status !== "success") return undefined;
  return { ...snapshot, revision: snapshot.revision + 1, document: result.document,
    lastTransaction: { ...record, after: result.document, actionTypes: [...record.actionTypes, ...actions.map(({ type }) => type)] } };
}
