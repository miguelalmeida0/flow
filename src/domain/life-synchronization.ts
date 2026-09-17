export const LIFE_DOCUMENT_LOCK_NAME = "flow.life.document.v1";

export interface LifeLockManager {
  request<T>(name: string, options: { mode: "exclusive" }, callback: () => T | PromiseLike<T>): Promise<T>;
}

function browserLocks(): LifeLockManager | undefined {
  if (typeof navigator === "undefined" || !("locks" in navigator)) return undefined;
  return navigator.locks as LifeLockManager;
}

/**
 * Serializes a complete read → transform → persist boundary across same-origin
 * tabs. The synchronous fallback preserves deterministic local behavior in
 * browsers/test environments without Web Locks; revision refresh remains the
 * stale-write guard there.
 */
export class LifeMutationCoordinator {
  constructor(private readonly locks: LifeLockManager | undefined = browserLocks()) {}

  run<T>(task: () => T | Promise<T>): T | Promise<T> {
    if (!this.locks) return task();
    let began = false;
    return this.locks.request(LIFE_DOCUMENT_LOCK_NAME, { mode: "exclusive" }, () => {
      began = true;
      return task();
    }).catch(() => {
      // A platform lock failure before acquisition must not make the product
      // inert. Never execute twice when the protected callback itself threw.
      if (!began) return Promise.resolve(task());
      return undefined as T;
    });
  }
}
