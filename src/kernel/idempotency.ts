/**
 * Bounded idempotency boundary for kernel capability execution.
 *
 * Problem: `kernel.ts`'s `continuePlan` already protects against replaying
 * completed steps WITHIN one `Plan` object (each step's own
 * `executionState` is checked by `nextPendingStep`) — but a genuinely NEW
 * `submit()`/`approve()` call (a duplicate final transcript, an HTTP/model
 * retry, a React re-render re-dispatching the same command, a desktop
 * companion reconnect replaying a queued request, a user saying "yes"
 * twice) builds a brand-new `Plan` with no memory of what a PRIOR call
 * already did. This module is that memory, scoped narrowly to "was this
 * exact mutation already completed a moment ago" — it is not a general
 * cache, a session store, or a second history system.
 *
 * Identity: a step's idempotency key is its capabilityId plus its resolved
 * args (order-independent). Two requests that ask for the exact same
 * mutation collide on purpose; a corrected/revised request (different args
 * — a new time, a different title, a different target) naturally gets a
 * different key and executes normally. This also means a step is only ever
 * looked up AFTER its args are fully resolved ($ref resolved, temporal
 * fields overridden, entity ids validated) — see kernel.ts's `executeStep`,
 * the only call site.
 *
 * Bounded lifecycle: entries expire after `ttlMs` (default 90s — long
 * enough to cover a realistic retry/reconnect window, short enough that a
 * genuinely repeated LEGITIMATE request a few minutes later is never
 * silently swallowed) and the store is hard-capped at `maxEntries`,
 * evicting the oldest entry first. Never a forever-growing set.
 */

import type { LifeEntityKind } from "../domain/life-model";

export interface IdempotencyEntry {
  description: string;
  entityId?: string;
  entityKind?: LifeEntityKind;
  completedAt: number;
}

export interface IdempotencyStore {
  /** Returns the prior result for this key if it completed within the TTL, else undefined. */
  get(key: string): IdempotencyEntry | undefined;
  /** Records a just-completed mutation's result under this key. `completedAt`
   * is stamped internally from the store's own clock (never the caller's) so
   * it's always consistent with what `get`'s TTL check compares against —
   * a caller-supplied timestamp from a different clock (e.g. a test's fixed
   * kernel clock) could otherwise make every entry look instantly expired
   * or never expired. */
  set(key: string, entry: Omit<IdempotencyEntry, "completedAt">): void;
  /** Test/debug only: current live entry count after pruning. */
  size(): number;
}

/** Transaction-local writes become visible only after durable storage succeeds.
 * A request scope distinguishes a deliberate repetition from transport replay. */
export function stageIdempotency(parent: IdempotencyStore, requestId?: string): IdempotencyStore & { commit(): void } {
  const pending = new Map<string, IdempotencyEntry>();
  const scoped = (key: string) => requestId ? `${requestId}::${key}` : key;
  return {
    get: (key) => pending.get(scoped(key)) ?? parent.get(scoped(key)),
    set: (key, entry) => { pending.set(scoped(key), { ...entry, completedAt: Date.now() }); },
    size: () => pending.size,
    commit: () => { for (const [key, entry] of pending) parent.set(key, entry); pending.clear(); },
  };
}

const DEFAULT_TTL_MS = 90_000;
const DEFAULT_MAX_ENTRIES = 200;

export function createIdempotencyStore(options: { ttlMs?: number; maxEntries?: number; now?: () => number } = {}): IdempotencyStore {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const now = options.now ?? Date.now;
  const entries = new Map<string, IdempotencyEntry>();

  function prune(): void {
    const cutoff = now() - ttlMs;
    for (const [key, entry] of entries) {
      if (entry.completedAt < cutoff) entries.delete(key);
    }
    while (entries.size > maxEntries) {
      const oldestKey = entries.keys().next().value;
      if (oldestKey === undefined) break;
      entries.delete(oldestKey);
    }
  }

  return {
    get(key) {
      prune();
      return entries.get(key);
    },
    set(key, entry) {
      prune();
      entries.set(key, { ...entry, completedAt: now() });
    },
    size() {
      prune();
      return entries.size;
    },
  };
}

/** Order-independent so `{a:1,b:2}` and `{b:2,a:1}` collide as the same request. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function computeStepIdempotencyKey(capabilityId: string, args: Record<string, unknown>): string {
  return `${capabilityId}::${stableStringify(args)}`;
}
