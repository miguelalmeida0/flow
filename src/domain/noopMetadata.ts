import type { LifeDocument } from "./life-model";

/** Persisted data is plain objects, arrays and primitives. Property ordering
 * and an absent optional field versus undefined are not business changes. */
function sameData(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length && left.every((value, index) => sameData(value, right[index]));
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].every((key) => sameData(a[key], b[key]));
}

function preserve<T extends { id: string; updatedAt: string }>(before: readonly T[], after: T[]): T[] {
  const originals = new Map(before.map((entity) => [entity.id, entity]));
  return after.map((entity) => {
    const original = originals.get(entity.id);
    // Only a completely unchanged business record may retain its old stamp.
    // A status change (including draft -> saved), nested edit or creation
    // keeps its current timestamp. Compare the final compound draft, so
    // intermediate edits that cancel one another cannot create fake history.
    return original && sameData({ ...original, updatedAt: undefined }, { ...entity, updatedAt: undefined })
      ? structuredClone(original) : entity;
  });
}

/** Transaction metadata describes a change; it must never create one. */
export function preserveNoopEntityMetadata(before: LifeDocument, after: LifeDocument): LifeDocument {
  after.captures = preserve(before.captures, after.captures);
  after.plans = preserve(before.plans, after.plans);
  after.steps = preserve(before.steps, after.steps);
  after.people = preserve(before.people, after.people);
  after.commitments = preserve(before.commitments, after.commitments);
  after.studio.journalEntries = preserve(before.studio.journalEntries, after.studio.journalEntries);
  after.studio.memories = preserve(before.studio.memories, after.studio.memories);
  after.studio.atmospherePresets = preserve(before.studio.atmospherePresets, after.studio.atmospherePresets);
  after.studio.rituals = preserve(before.studio.rituals, after.studio.rituals);
  // Schema projection may reorder object keys even when all values are
  // unchanged. Preserve the complete original representation for a no-op;
  // arrays and real field changes still compare strictly.
  return sameData(before, after) ? structuredClone(before) : after;
}
