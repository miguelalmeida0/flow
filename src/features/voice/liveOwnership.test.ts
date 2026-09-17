import { describe, expect, it, vi } from "vitest";
import { compareLiveClaims, FLOW_LIVE_LEASE_KEY, LiveOwnershipCoordinator, type LiveLease, type LiveOwnershipTransport } from "./liveOwnership";

type Message = Parameters<LiveOwnershipTransport["publish"]>[0];

class SharedLeaseBus {
  value: string | null = null;
  private listeners = new Map<string, (message: Message) => void>();

  transport(id: string): LiveOwnershipTransport {
    return {
      read: () => this.value,
      write: (value) => { this.value = value; },
      remove: () => { this.value = null; },
      publish: (message) => this.listeners.forEach((listener, listenerId) => { if (listenerId !== id) listener(message); }),
      subscribe: (listener) => { this.listeners.set(id, listener); return () => this.listeners.delete(id); },
      close: () => this.listeners.delete(id),
    };
  }
}

const options = (ownerId: string, now: () => number = Date.now) => ({ ownerId, now, settleMs: 5, releaseWaitMs: 20, heartbeatMs: 1_000, leaseMs: 100 });

describe("Flow Live cross-tab ownership", () => {
  it("renews an expired own winner without changing its claim or stealing a foreign winner", async () => {
    let clock = 1_000;
    const bus = new SharedLeaseBus();
    const owner = new LiveOwnershipCoordinator(bus.transport("alive"), options("alive", () => clock));
    expect(await owner.claim()).toBe(true);
    const original = JSON.parse(bus.value!) as LiveLease;
    clock += 5_000;
    expect(owner.isOwner()).toBe(false);
    expect(owner.renewIfStillWinner()).toBe(true);
    expect(JSON.parse(bus.value!)).toMatchObject({ claimId: original.claimId, generation: original.generation });
    const foreign: LiveLease = { ...original, ownerId: "foreign", claimId: "new-foreign", generation: original.generation + 1, expiresAt: clock + 100 };
    bus.value = JSON.stringify(foreign);
    expect(owner.renewIfStillWinner()).toBe(false);
    expect(JSON.parse(bus.value!)).toEqual(foreign);
    owner.destroy();
  });

  it("does not resurrect a released or destroyed session", async () => {
    const bus = new SharedLeaseBus();
    const owner = new LiveOwnershipCoordinator(bus.transport("released"), options("released"));
    expect(await owner.claim()).toBe(true);
    owner.release();
    expect(owner.renewIfStillWinner()).toBe(false);
    expect(bus.value).toBeNull();
    owner.destroy();
    expect(owner.renewIfStillWinner()).toBe(false);
  });

  it("keeps the still-winning foreground session alive after a delayed heartbeat", async () => {
    vi.useFakeTimers();
    let clock = 1_000;
    const bus = new SharedLeaseBus();
    const owner = new LiveOwnershipCoordinator(bus.transport("delayed"), options("delayed", () => clock));
    try {
      const claim = owner.claim();
      await vi.advanceTimersByTimeAsync(5);
      expect(await claim).toBe(true);
      clock += 5_000;
      expect(owner.isOwner()).toBe(false);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(owner.isOwner()).toBe(true);
      expect(JSON.parse(bus.value!).expiresAt).toBe(6_100);
    } finally { owner.destroy(); vi.useRealTimers(); }
  });
  it("orders simultaneous claims deterministically by generation and identity", async () => {
    const bus = new SharedLeaseBus();
    const first = new LiveOwnershipCoordinator(bus.transport("first"), options("tab-a", () => 10));
    const second = new LiveOwnershipCoordinator(bus.transport("second"), options("tab-b", () => 10));
    const [firstWon, secondWon] = await Promise.all([first.claim(), second.claim()]);
    expect([firstWon, secondWon].filter(Boolean)).toHaveLength(1);
    expect(firstWon).toBe(false); expect(secondWon).toBe(true);
    expect(second.isOwner()).toBe(true); expect(first.isOwner()).toBe(false);
    first.destroy(); second.destroy();
  });

  it("preempts an existing owner, waits for release, and lets stop release the lease", async () => {
    const bus = new SharedLeaseBus();
    const first = new LiveOwnershipCoordinator(bus.transport("first"), options("tab-a"));
    const second = new LiveOwnershipCoordinator(bus.transport("second"), options("tab-b"));
    const preempted = vi.fn(); first.setPreemptHandler(preempted);
    expect(await first.claim()).toBe(true);
    expect(await second.claim()).toBe(true);
    expect(preempted).toHaveBeenCalledOnce();
    expect(first.isOwner()).toBe(false); expect(second.isOwner()).toBe(true);
    second.release();
    expect(bus.value).toBeNull();
    first.destroy(); second.destroy();
  });

  it("does not grant acquisition until the prior native release is acknowledged", async () => {
    const bus = new SharedLeaseBus();
    // This case measures native-release ordering, not crash-expiry. Keep the
    // lease comfortably above the intentional 90 ms release plus runner load,
    // matching the production invariant leaseMs > releaseWaitMs.
    const first = new LiveOwnershipCoordinator(bus.transport("first-delayed"), { ...options("tab-a"), leaseMs: 1_000, releaseWaitMs: 300 });
    const second = new LiveOwnershipCoordinator(bus.transport("second-delayed"), { ...options("tab-b"), leaseMs: 1_000, releaseWaitMs: 300 });
    first.setPreemptHandler(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 90));
      return true;
    });
    expect(await first.claim()).toBe(true);
    const started = performance.now();
    const outcome = await second.claimWithRelease();
    expect(outcome).toEqual({ granted: true, priorRelease: "confirmed" });
    expect(performance.now() - started).toBeGreaterThanOrEqual(80);
    first.destroy(); second.destroy();
  });

  it("force-releases a non-owning tab when a foreign claim wins", async () => {
    const bus = new SharedLeaseBus();
    const observer = new LiveOwnershipCoordinator(bus.transport("observer"), options("tab-observer"));
    const owner = new LiveOwnershipCoordinator(bus.transport("owner"), options("tab-owner"));
    const releaseOrphan = vi.fn(async () => true);
    observer.setPreemptHandler(releaseOrphan);
    expect(await owner.claim()).toBe(true);
    await vi.waitFor(() => expect(releaseOrphan).toHaveBeenCalled());
    observer.destroy(); owner.destroy();
  });

  it("does not let an expired crashed owner strand the lease", async () => {
    let clock = 1_000;
    const bus = new SharedLeaseBus();
    const crashed: LiveLease = { schemaVersion: 1, ownerId: "dead-tab", claimId: "1-dead", generation: 1, requestedAt: 800, expiresAt: 900 };
    bus.value = JSON.stringify(crashed);
    const replacement = new LiveOwnershipCoordinator(bus.transport("replacement"), options("tab-new", () => clock));
    expect(await replacement.claim()).toBe(true);
    expect(replacement.isOwner()).toBe(true);
    expect(JSON.parse(bus.value!).ownerId).toBe("tab-new");
    clock += 1;
    replacement.destroy();
    expect(replacement.isDestroyed()).toBe(true);
    expect(await replacement.claim()).toBe(false);
  });

  it("uses the stable claim ordering contract", () => {
    const base = { schemaVersion: 1 as const, requestedAt: 10, expiresAt: 100 };
    const older: LiveLease = { ...base, ownerId: "tab-z", claimId: "1-z", generation: 1 };
    const newer: LiveLease = { ...base, ownerId: "tab-a", claimId: "2-a", generation: 2 };
    const tieWinner: LiveLease = { ...base, ownerId: "tab-z", claimId: "2-z", generation: 2 };
    expect(compareLiveClaims(newer, older)).toBeGreaterThan(0);
    expect(compareLiveClaims(tieWinner, newer)).toBeGreaterThan(0);
    expect(FLOW_LIVE_LEASE_KEY).toBe("flow.voice.live-lease.v1");
  });
});
