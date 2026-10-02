export type ProductionOutcome<T> = {
  id: string;
  status: "passed" | "failed" | "skipped";
  result?: T;
  reason?: string;
};

/** Assertion execution is the oracle. Summaries never reinterpret a passed
 * semantic contract or silently remove an unexecuted manifest row. */
export function createOutcomeLedger<T = unknown>(manifest: readonly string[]) {
  if (!manifest.length || new Set(manifest).size !== manifest.length || manifest.some(id => !id)) throw new Error("Invalid outcome manifest");
  const expected = new Set(manifest);
  const recorded = new Map<string, ProductionOutcome<T>>();
  function record(outcome: ProductionOutcome<T>) {
    if (!expected.has(outcome.id) || recorded.has(outcome.id)) throw new Error(`Unexpected or repeated outcome: ${outcome.id}`);
    recorded.set(outcome.id, outcome);
    return outcome;
  }
  const outcomes = () => manifest.map(id => recorded.get(id) ?? { id, status: "skipped" as const, reason: "not-executed" });
  return {
    run(id: string, execute: () => T) {
      if (!expected.has(id) || recorded.has(id)) throw new Error(`Unexpected or repeated outcome: ${id}`);
      try { return record({ id, status: "passed", result: execute() }); }
      catch (error) { return record({ id, status: "failed", reason: error instanceof Error ? error.message : String(error) }); }
    },
    skip: (id: string, reason: string) => record({ id, status: "skipped", reason }),
    outcomes,
    summary() {
      const rows = outcomes(), passed = rows.filter(row => row.status === "passed").length;
      const failed = rows.filter(row => row.status === "failed").length, skipped = rows.filter(row => row.status === "skipped").length;
      const missing = manifest.length - recorded.size, complete = skipped === 0 && missing === 0;
      return { expected: manifest.length, cases: rows.length, passed, failed, skipped, missing, complete, safetyMetricsComplete: complete && failed === 0, accuracy: complete ? Number((passed / manifest.length).toFixed(6)) : null };
    },
  };
}
