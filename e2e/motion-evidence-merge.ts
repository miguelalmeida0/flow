/** Merge worker fragments without losing previous tests or replacing provenance. */
export function mergeEvidenceRows<T>(previous: readonly T[], current: readonly T[], key: (row: T) => string): T[] {
  const rows = new Map<string, T>();
  for (const row of [...previous, ...current]) {
    const id = key(row);
    if (rows.has(id) && JSON.stringify(rows.get(id)) !== JSON.stringify(row)) throw new Error(`Conflicting motion evidence for ${id}`);
    rows.set(id, row);
  }
  return [...rows.values()];
}
