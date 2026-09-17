import type { CapabilityContext, MutationHistoryEntry, NavigationState, PersonalMemoryFact } from "./types";
import type { LifeDocument } from "../domain/life-model";

export interface HistoryState {
  entries: MutationHistoryEntry[];
  pointer: number;
}

export function emptyHistory(): HistoryState {
  return { entries: [], pointer: -1 };
}

let sequence = 0;
function nextId(): string {
  sequence += 1;
  return `history-${sequence}`;
}

/** Appends a new mutation after the current pointer. Any undone-and-not-redone
 * entries beyond the pointer are dropped, matching standard undo/redo stacks:
 * a fresh action after an undo invalidates the redo branch. */
export function recordMutation(
  history: HistoryState,
  capabilityId: string,
  description: string,
  timestamp: string,
  before: { document: LifeDocument; navigation: NavigationState; memory: PersonalMemoryFact[] },
  after: { document: LifeDocument; navigation: NavigationState; memory: PersonalMemoryFact[] },
): HistoryState {
  const entry: MutationHistoryEntry = { id: nextId(), capabilityId, description, timestamp, before, after };
  const entries = [...history.entries.slice(0, history.pointer + 1), entry];
  return { entries, pointer: entries.length - 1 };
}

export interface HistoryStep {
  state: { document: LifeDocument; navigation: NavigationState; memory: PersonalMemoryFact[] };
  description: string;
  pointer: number;
}

export function undo(history: HistoryState): HistoryStep | null {
  if (history.pointer < 0) return null;
  const entry = history.entries[history.pointer];
  if (!entry) return null;
  return { state: entry.before, description: `Undid: ${entry.description}`, pointer: history.pointer - 1 };
}

export function redo(history: HistoryState): HistoryStep | null {
  const next = history.entries[history.pointer + 1];
  if (!next) return null;
  return { state: next.after, description: `Redid: ${next.description}`, pointer: history.pointer + 1 };
}

/** Human-readable "what changed" — never exposes internal capability ids or raw diffs. */
export function whatChanged(history: HistoryState, sinceTimestamp?: string): string[] {
  const applied = history.entries.slice(0, history.pointer + 1);
  const scoped = sinceTimestamp ? applied.filter((entry) => entry.timestamp >= sinceTimestamp) : applied;
  return scoped.map((entry) => entry.description);
}

export function captureState(ctx: Pick<CapabilityContext, "document" | "navigation" | "memory">) {
  return { document: ctx.document, navigation: ctx.navigation, memory: ctx.memory };
}
