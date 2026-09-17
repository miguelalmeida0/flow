import type { LifeSnapshot } from "../../domain/life-model";
import { applyLifeTransaction } from "../../domain/life-transaction";

/** Ambient novelty metadata is persisted, but never consumes user history. */
export function projectInstinctExposure(snapshot: LifeSnapshot, ids: readonly string[], now: Date): LifeSnapshot {
  const distinct = [...new Set(ids)].filter((id) => {
    const shown = new Date(snapshot.document.instinctState.lastShownAt[id] ?? 0).getTime();
    return !Number.isFinite(shown) || now.getTime() - shown >= 60_000;
  });
  if (!distinct.length) return snapshot;
  const result = applyLifeTransaction(snapshot.document, distinct.map((instinctId) => ({ type: "instinct.shown", instinctId, at: now.toISOString() })), () => now);
  return result.status === "success" ? { ...snapshot, revision: snapshot.revision + 1, document: result.document } : snapshot;
}
