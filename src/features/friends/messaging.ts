import type { FriendMessage } from "../../domain/friends-model";
import { getStudioMedia } from "../studio/mediaRepository";

export interface DeliveryReceipt {
  id: string;
  idempotencyKey: string;
  message: FriendMessage;
  deliveredAt: string;
  transport: string;
  scope: "local" | "external";
  label: string;
}
export interface MessagingAdapter {
  readonly channel: string;
  readonly scope: "local" | "external";
  /** A provider must honor the supplied key across retries. Never invent a receipt. */
  deliver(message: FriendMessage): Promise<DeliveryReceipt>;
}
const PREFIX = "flow.friends.delivery.v1:";
const listeners = new Set<() => void>();
let cachedSource = "";
let cached: readonly DeliveryReceipt[] = [];
let readable = true;
export function deliveryReceipts(): readonly DeliveryReceipt[] {
  try {
    readable = true;
    localStorage.getItem(PREFIX + "capability");
    const stored: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(PREFIX)) { const value = localStorage.getItem(key); if (value) stored.push(value); }
    }
    const source = stored.sort().join("\n");
    if (source === cachedSource) return cached;
    cachedSource = source;
    cached = stored.flatMap((value) => {
      try { const receipt = JSON.parse(value) as DeliveryReceipt; return receipt.idempotencyKey && receipt.transport && receipt.message?.id ? [receipt] : []; }
      catch { return []; }
    });
  } catch { readable = false; }
  return cached;
}
export const subscribeDeliveries = (listener: () => void) => {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => { if (event.key === null || event.key.startsWith(PREFIX)) listener(); };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
};
export const deliveredAssetIds = () => deliveryReceipts().flatMap(({ message }) => message.attachment?.assetId ? [message.attachment.assetId] : []);
/** Garbage collection must stop when the complete immutable delivery ledger is unknown. */
export function deliveryRetentionKnown() { deliveryReceipts(); return readable; }
const fingerprint = (message: FriendMessage) => JSON.stringify([message.id, message.revision, message.recipient, message.direction, message.authorPersonId, message.body, message.attachment ?? null, message.replyToMarkerId ?? null, message.replyToMessageId ?? null, message.calendarEventId ?? null, message.groupPlanId]);
const identity = (channel: string, message: FriendMessage) => encodeURIComponent(channel) + ":" + encodeURIComponent(message.idempotencyKey);

/** Development delivery is a durable browser-local inbox item, never an external send. */
export const localMessagingAdapter: MessagingAdapter = {
  channel: "flow-local", scope: "local",
  async deliver(message) {
    if (message.attachment?.assetId) {
      if (typeof indexedDB === "undefined") throw new Error("Persistent media storage is unavailable. Temporary media cannot be delivered safely.");
      if (!(await getStudioMedia(message.attachment.assetId))?.size) throw new Error("The media is not saved on this device yet. Nothing was delivered.");
    }
    return { id: "receipt-" + message.idempotencyKey, idempotencyKey: message.idempotencyKey, message: structuredClone(message), deliveredAt: new Date().toISOString(), transport: "flow-local", scope: "local", label: "Delivered in Flow locally" };
  },
};
const inFlight = new Map<string, { fingerprint: string; promise: Promise<DeliveryReceipt> }>();
const failures = new Map<string, string>();
function notifyDeliveryState() { cached = [...cached]; for (const listener of listeners) listener(); }
export function deliveryDraftLabel(message: FriendMessage) {
  const key = identity("flow-local", message), payload = fingerprint(message);
  return inFlight.get(key)?.fingerprint === payload ? "Sending locally…" : failures.get(key) === payload || message.status === "failed" ? "Failed · draft preserved for retry" : message.status === "ready" ? "Ready · not sent" : "Draft · not sent";
}
export function deliverMessage(message: FriendMessage, adapter: MessagingAdapter = localMessagingAdapter): Promise<DeliveryReceipt> {
  const key = identity(adapter.channel, message);
  const payload = fingerprint(message);
  const active = inFlight.get(key);
  if (active) return active.fingerprint === payload ? active.promise : Promise.reject(new Error("This delivery key belongs to a different draft. Review the new message."));
  const perform = async () => {
    const existing = deliveryReceipts().find(({ transport, idempotencyKey }) => transport === adapter.channel && idempotencyKey === message.idempotencyKey);
    if (existing) {
      if (fingerprint(existing.message) !== payload) throw new Error("That key already delivered a different draft. Create a new message.");
      return existing;
    }
    const probe = PREFIX + "probe-" + key;
    localStorage.setItem(probe, "ready"); localStorage.removeItem(probe);
    const receipt = await adapter.deliver(structuredClone(message));
    if (receipt.transport !== adapter.channel || receipt.scope !== adapter.scope || receipt.idempotencyKey !== message.idempotencyKey || fingerprint(receipt.message) !== payload) throw new Error("The delivery receipt does not match this exact draft. Its status needs verification.");
    const serialized = JSON.stringify(receipt);
    // Per-message keys avoid lost updates when different messages finish in different tabs.
    localStorage.setItem(PREFIX + key, serialized);
    if (localStorage.getItem(PREFIX + key) !== serialized) throw new Error("The delivery receipt could not be saved. Retry this exact draft to check its status.");
    for (const listener of listeners) listener();
    return receipt;
  };
  const delivery: Promise<DeliveryReceipt> = (async () => {
    if (typeof navigator !== "undefined" && navigator.locks?.request) return await navigator.locks.request("flow-delivery-" + key, perform);
    throw new Error("Safe delivery is unavailable in this browser. Use a browser with Web Locks support; the draft is preserved.");
  })().catch((error: unknown) => { failures.set(key, payload); throw error; }).finally(() => { inFlight.delete(key); notifyDeliveryState(); });
  inFlight.set(key, { fingerprint: payload, promise: delivery });
  failures.delete(key); notifyDeliveryState();
  return delivery;
}
