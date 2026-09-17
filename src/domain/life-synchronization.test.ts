import { describe, expect, it } from "vitest";
import { LIFE_DOCUMENT_LOCK_NAME, LifeMutationCoordinator, type LifeLockManager } from "./life-synchronization";

describe("LifeDocument cross-tab mutation coordinator", () => {
  it("executes synchronously when Web Locks are unavailable", () => {
    const order: string[] = [];
    new LifeMutationCoordinator(undefined).run(() => order.push("commit"));
    expect(order).toEqual(["commit"]);
  });

  it("uses one named exclusive browser lock for every mutation", async () => {
    const calls: Array<{ name: string; mode: string }> = [];
    const locks: LifeLockManager = {
      request: async (name, options, callback) => {
        calls.push({ name, mode: options.mode });
        return callback();
      },
    };
    const order: string[] = [];
    await new LifeMutationCoordinator(locks).run(() => order.push("commit"));
    expect(calls).toEqual([{ name: LIFE_DOCUMENT_LOCK_NAME, mode: "exclusive" }]);
    expect(order).toEqual(["commit"]);
  });

  it("keeps an asynchronous presentation handshake inside the exclusive boundary", async () => {
    const order: string[] = [];
    const locks: LifeLockManager = {
      request: async (_name, _options, callback) => {
        order.push("lock-open");
        const result = await callback();
        order.push("lock-close");
        return result;
      },
    };
    await new LifeMutationCoordinator(locks).run(async () => {
      order.push("target");
      await Promise.resolve();
      order.push("commit");
    });
    expect(order).toEqual(["lock-open", "target", "commit", "lock-close"]);
  });

  it("falls back once if the platform rejects before entering the lock", async () => {
    const locks: LifeLockManager = { request: async () => { throw new Error("unavailable"); } };
    let commits = 0;
    await new LifeMutationCoordinator(locks).run(() => { commits += 1; });
    expect(commits).toBe(1);
  });
});
