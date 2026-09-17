export const FLOW_LIVE_LEASE_KEY = "flow.voice.live-lease.v1";
const CHANNEL_NAME = "flow.voice.live-ownership.v1";

export interface LiveLease {
  schemaVersion: 1;
  ownerId: string;
  claimId: string;
  generation: number;
  requestedAt: number;
  expiresAt: number;
}

type OwnershipMessage =
  | { type: "claim"; lease: LiveLease }
  | { type: "released"; ownerId: string; claimId: string };

export interface LiveOwnershipTransport {
  read(): string | null;
  write(value: string): void;
  remove(): void;
  publish(message: OwnershipMessage): void;
  subscribe(listener: (message: OwnershipMessage) => void): () => void;
  close(): void;
}

interface CoordinatorOptions {
  ownerId?: string;
  now?: () => number;
  leaseMs?: number;
  settleMs?: number;
  releaseWaitMs?: number;
  heartbeatMs?: number;
}

export interface LiveClaimOutcome {
  granted: boolean;
  priorRelease: "not-needed" | "confirmed" | "timed-out";
}

function parseLease(value: string | null): LiveLease | undefined {
  try {
    const lease = JSON.parse(value ?? "null") as Partial<LiveLease> | null;
    return lease?.schemaVersion === 1 && typeof lease.ownerId === "string" && typeof lease.claimId === "string"
      && Number.isFinite(lease.generation) && Number.isFinite(lease.requestedAt) && Number.isFinite(lease.expiresAt)
      ? lease as LiveLease : undefined;
  } catch { return undefined; }
}

export function compareLiveClaims(left: LiveLease, right: LiveLease) {
  return left.generation - right.generation
    || left.requestedAt - right.requestedAt
    || left.claimId.localeCompare(right.claimId)
    || left.ownerId.localeCompare(right.ownerId);
}

function browserTransport(): LiveOwnershipTransport {
  let channel: BroadcastChannel | undefined;
  try { channel = typeof BroadcastChannel === "function" ? new BroadcastChannel(CHANNEL_NAME) : undefined; } catch { /* Storage events remain available. */ }
  return {
    read: () => localStorage.getItem(FLOW_LIVE_LEASE_KEY),
    write: (value) => localStorage.setItem(FLOW_LIVE_LEASE_KEY, value),
    remove: () => localStorage.removeItem(FLOW_LIVE_LEASE_KEY),
    publish: (message) => channel?.postMessage(message),
    subscribe: (listener) => {
      const channelListener = (event: MessageEvent<OwnershipMessage>) => listener(event.data);
      const storageListener = (event: StorageEvent) => {
        if (event.key !== FLOW_LIVE_LEASE_KEY || !event.newValue) return;
        const lease = parseLease(event.newValue);
        if (lease) listener({ type: "claim", lease });
      };
      channel?.addEventListener("message", channelListener);
      window.addEventListener("storage", storageListener);
      return () => { channel?.removeEventListener("message", channelListener); window.removeEventListener("storage", storageListener); };
    },
    close: () => channel?.close(),
  };
}

export class LiveOwnershipCoordinator {
  readonly ownerId: string;
  private readonly now: () => number;
  private readonly leaseMs: number;
  private readonly settleMs: number;
  private readonly releaseWaitMs: number;
  private readonly heartbeatMs: number;
  private readonly unsubscribe: () => void;
  private current?: LiveLease;
  private pending?: LiveLease;
  private generation = 0;
  private heartbeat?: number;
  private sequence = 0;
  private destroyed = false;
  private onPreempt: () => boolean | void | Promise<boolean | void> = () => true;
  private releaseAcks = new Set<string>();
  private releaseWaiters = new Map<string, (confirmed: boolean) => void>();

  constructor(private readonly transport: LiveOwnershipTransport = browserTransport(), options: CoordinatorOptions = {}) {
    this.ownerId = options.ownerId ?? (globalThis.crypto?.randomUUID?.() ?? `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    this.now = options.now ?? Date.now;
    this.leaseMs = options.leaseMs ?? 4_000;
    this.settleMs = options.settleMs ?? 45;
    this.releaseWaitMs = options.releaseWaitMs ?? 1_000;
    this.heartbeatMs = options.heartbeatMs ?? 1_000;
    this.generation = parseLease(this.transport.read())?.generation ?? 0;
    this.unsubscribe = this.transport.subscribe((message) => { void this.receive(message); });
  }

  setPreemptHandler(handler: () => boolean | void | Promise<boolean | void>) { this.onPreempt = handler; }

  private stored() { return parseLease(this.transport.read()); }

  private owns(lease: LiveLease | undefined) {
    const stored = this.stored();
    return Boolean(lease && stored && stored.ownerId === this.ownerId && stored.claimId === lease.claimId && stored.expiresAt > this.now());
  }

  isOwner() { return this.owns(this.current); }
  isDestroyed() { return this.destroyed; }

  /** A delayed foreground timer may outlive its lease. Renew only the exact
   * claim still stored as winner; release/preemption clears current first. */
  renewIfStillWinner() {
    const current = this.current;
    const stored = this.stored();
    if (this.destroyed || !current || !stored || stored.ownerId !== this.ownerId || stored.claimId !== current.claimId) return false;
    this.current = { ...stored, expiresAt: this.now() + this.leaseMs };
    this.persistWinner(this.current);
    return this.owns(this.current);
  }

  private persistWinner(lease: LiveLease) {
    const stored = this.stored();
    if (!stored || compareLiveClaims(lease, stored) > 0 || stored.claimId === lease.claimId) this.transport.write(JSON.stringify(lease));
  }

  private async receive(message: OwnershipMessage) {
    if (this.destroyed) return;
    if (message.type === "released") {
      const key = `${message.ownerId}:${message.claimId}`;
      this.releaseAcks.add(key); this.releaseWaiters.get(key)?.(true);
      return;
    }
    const incoming = message.lease;
    this.generation = Math.max(this.generation, incoming.generation);
    const local = this.pending ?? this.current;
    if (local && compareLiveClaims(local, incoming) > 0) {
      this.persistWinner(local); this.transport.publish({ type: "claim", lease: local }); return;
    }
    if (!local) {
      this.persistWinner(incoming);
      try { await this.onPreempt(); } catch { /* A non-owner has no acknowledgement to publish. */ }
      return;
    }
    if (compareLiveClaims(incoming, local) <= 0) return;
    this.persistWinner(incoming);
    if (this.pending) this.pending = undefined;
    if (!this.current) {
      try { await this.onPreempt(); } catch { /* A losing pending claim has no acknowledgement to publish. */ }
      return;
    }
    const releasedOwner = this.current.ownerId;
    this.current = undefined; this.clearHeartbeat();
    let released = false;
    try { released = await this.onPreempt() !== false; } catch { released = false; }
    if (released) this.transport.publish({ type: "released", ownerId: releasedOwner, claimId: incoming.claimId });
  }

  private wait(milliseconds: number) { return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds)); }

  private waitForRelease(ownerId: string, claimId: string) {
    const key = `${ownerId}:${claimId}`;
    if (this.releaseAcks.delete(key)) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      let timer = 0;
      const finish = (confirmed: boolean) => {
        window.clearTimeout(timer); this.releaseWaiters.delete(key); this.releaseAcks.delete(key); resolve(confirmed);
      };
      this.releaseWaiters.set(key, finish);
      timer = window.setTimeout(() => finish(false), this.releaseWaitMs);
    });
  }

  async claimWithRelease(): Promise<LiveClaimOutcome> {
    if (this.destroyed) return { granted: false, priorRelease: "not-needed" };
    const stored = this.stored();
    const priorOwner = stored && stored.expiresAt > this.now() && stored.ownerId !== this.ownerId ? stored.ownerId : undefined;
    this.generation = Math.max(this.generation, stored?.generation ?? 0) + 1;
    const lease: LiveLease = {
      schemaVersion: 1, ownerId: this.ownerId,
      claimId: `${this.generation}-${this.now()}-${this.ownerId}-${++this.sequence}`,
      generation: this.generation, requestedAt: this.now(), expiresAt: this.now() + this.leaseMs,
    };
    this.pending = lease; this.persistWinner(lease); this.transport.publish({ type: "claim", lease });
    await this.wait(this.settleMs);
    const winner = this.stored();
    if (this.pending?.claimId !== lease.claimId || !winner || compareLiveClaims(winner, lease) > 0) {
      if (this.pending?.claimId === lease.claimId) this.pending = undefined;
      return { granted: false, priorRelease: "not-needed" };
    }
    this.persistWinner(lease);
    const priorRelease = priorOwner
      ? await this.waitForRelease(priorOwner, lease.claimId) ? "confirmed" as const : "timed-out" as const
      : "not-needed" as const;
    if (this.pending?.claimId !== lease.claimId || !this.owns(lease)) return { granted: false, priorRelease };
    this.pending = undefined; this.current = lease; this.startHeartbeat();
    return { granted: true, priorRelease };
  }

  async claim() { return (await this.claimWithRelease()).granted; }

  private startHeartbeat() {
    this.clearHeartbeat();
    this.heartbeat = window.setInterval(() => {
      if (!this.renewIfStillWinner()) this.clearHeartbeat();
    }, this.heartbeatMs);
  }

  private clearHeartbeat() { if (this.heartbeat !== undefined) window.clearInterval(this.heartbeat); this.heartbeat = undefined; }

  release() {
    const lease = this.current ?? this.pending;
    this.current = undefined; this.pending = undefined; this.clearHeartbeat();
    const stored = this.stored();
    if (stored?.ownerId === this.ownerId) this.transport.remove();
    if (lease) this.transport.publish({ type: "released", ownerId: this.ownerId, claimId: lease.claimId });
  }

  destroy() {
    if (this.destroyed) return;
    this.release(); this.destroyed = true; this.unsubscribe(); this.transport.close();
  }
}

export function createBrowserLiveOwnership() { return new LiveOwnershipCoordinator(); }
