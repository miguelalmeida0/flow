import { beforeEach, describe, expect, it, vi } from "vitest";
import { deliverMessage, deliveryReceipts, deliveryRetentionKnown, localMessagingAdapter, type MessagingAdapter } from "./messaging";
import type { FriendMessage } from "../../domain/friends-model";

const message = (id = "one"): FriendMessage => ({ id, recipient: { kind: "person", id: "sarah" }, direction: "outgoing", body: "Meet at six", revision: 1, status: "draft", idempotencyKey: `key-${id}`, createdAt: "2026-09-12", updatedAt: "2026-09-12" });
beforeEach(() => { localStorage.clear(); Object.defineProperty(navigator, "locks", { configurable: true, value: { request: async (_key: string, optionsOrTask: unknown, task?: () => Promise<unknown>) => typeof optionsOrTask === "function" ? optionsOrTask() : task!() } }); });
describe("delivery identity outside document history", () => {
  it("deduplicates concurrent callbacks and a retry using the same exact payload", async () => {
    const deliver = vi.fn(localMessagingAdapter.deliver);
    const adapter = { ...localMessagingAdapter, deliver };
    const [first, second] = await Promise.all([deliverMessage(message(), adapter), deliverMessage(message(), adapter)]);
    expect(first).toEqual(second); expect(deliver).toHaveBeenCalledTimes(1);
    expect(await deliverMessage(message(), adapter)).toEqual(first); expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliveryReceipts()).toHaveLength(1);
  });
  it("rejects reusing a delivered key for a changed revision or body", async () => {
    await deliverMessage(message());
    await expect(deliverMessage({ ...message(), revision: 2, body: "Now seven" })).rejects.toThrow("different draft");
    expect(deliveryReceipts()[0]?.message.body).toBe("Meet at six");
  });
  it("never reuses delivery authority for a reply to a different public message", async () => {
    await deliverMessage({ ...message(), replyToMessageId: "shared-a" });
    await expect(deliverMessage({ ...message(), replyToMessageId: "shared-b" })).rejects.toThrow("different draft");
    expect(deliveryReceipts()[0]?.message.replyToMessageId).toBe("shared-a");
  });
  it("retains independent receipts when separate messages finish concurrently", async () => {
    await Promise.all([deliverMessage(message("one")), deliverMessage(message("two"))]);
    expect(deliveryReceipts().map(({ message: item }) => item.id).sort()).toEqual(["one", "two"]);
  });
  it("distinguishes transport identity without changing conversation semantics", async () => {
    const adapter: MessagingAdapter = { channel: "test-provider", scope: "external", deliver: async (item) => ({ id: "real-test-receipt", message: item, transport: "test-provider", scope: "external", idempotencyKey: item.idempotencyKey, deliveredAt: "2026-09-12", label: "Test adapter receipt" }) };
    await deliverMessage(message()); await deliverMessage(message(), adapter);
    expect(deliveryReceipts()).toHaveLength(2);
  });
  it("does not crash rendering when storage reads are denied and never claims a receipt", async () => {
    const read = vi.spyOn(localStorage, "getItem").mockImplementation(() => { throw new Error("denied"); });
    const key = vi.spyOn(localStorage, "key").mockImplementation(() => { throw new Error("denied"); });
    localStorage.setItem("placeholder", "x"); deliveryReceipts(); expect(deliveryRetentionKnown()).toBe(false);
    read.mockRestore(); key.mockRestore();
  });
});
