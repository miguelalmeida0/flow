import { describe, expect, it } from "vitest";
import { createFreshLifeSnapshot } from "../../domain/life-storage";
import { messagesForRecipient, peopleWithDeliveryHistory, recentDeliveries } from "./deliveryProjection";
import type { DeliveryReceipt } from "./messaging";

const receipt: DeliveryReceipt = { id: "r", idempotencyKey: "d", transport: "flow-local", scope: "local", label: "Delivered in Flow locally", deliveredAt: "2026-09-12", message: { id: "m", recipient: { kind: "person", id: "sarah" }, recipientSnapshot: { name: "Sarah Miller", people: [{ id: "sarah", name: "Sarah Miller" }] }, body: "Revised and delivered", revision: 2, direction: "outgoing", status: "draft", idempotencyKey: "d", createdAt: "2026-09-12", updatedAt: "2026-09-12" } };
describe("irreversible delivery projection", () => {
  it("orders Recent by delivery time regardless of storage key order, with a stable tie-break", () => {
    const receipts = [{ ...receipt, id: "z-old", deliveredAt: "2026-09-12T08:00:00Z" }, { ...receipt, id: "b-new", deliveredAt: "2026-09-12T10:00:00Z" }, { ...receipt, id: "a-new", deliveredAt: "2026-09-12T10:00:00Z" }];
    expect(recentDeliveries(receipts, 2).map(({ id }) => id)).toEqual(["a-new", "b-new"]);
    expect(receipts[0]?.id).toBe("z-old");
  });
  it("keeps exact receipt body when undo restores an earlier draft", () => {
    const document = createFreshLifeSnapshot("2026-09-12").document;
    document.friends!.messages = [{ ...receipt.message, revision: 1, body: "Original draft" }];
    const messages = messagesForRecipient(document, [receipt], receipt.message.recipient);
    expect(messages).toHaveLength(2);
    expect(messages.find(({ receipt }) => receipt)?.message.body).toBe("Revised and delivered");
    expect(messages.find(({ restoredDraft }) => restoredDraft)?.message.body).toBe("Original draft");
  });
  it("retains recipient identity as archived history when undo removes a contact", () => {
    const document = createFreshLifeSnapshot("2026-09-12").document;
    expect(peopleWithDeliveryHistory(document, [receipt])[0]).toMatchObject({ id: "sarah", name: "Sarah Miller", archived: true });
    expect(document.people).toEqual([]);
  });
});
