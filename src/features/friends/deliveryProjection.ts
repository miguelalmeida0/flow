import type { FriendMessage, Recipient, FriendGroup } from "../../domain/friends-model";
import type { LifeDocument, Person } from "../../domain/life-model";
import type { DeliveryReceipt } from "./messaging";
import { canonicalPerson } from "./people";

export function recentDeliveries(receipts: readonly DeliveryReceipt[], limit = 5): DeliveryReceipt[] {
  return [...receipts].sort((a, b) => b.deliveredAt.localeCompare(a.deliveredAt) || a.id.localeCompare(b.id)).slice(0, limit);
}

export function peopleWithDeliveryHistory(document: LifeDocument, receipts: readonly DeliveryReceipt[]): Person[] {
  const people = [...document.people];
  for (const receipt of receipts) {
    const snapshots = receipt.message.recipientSnapshot?.people ?? (receipt.message.recipient.kind === "person" ? [{ id: receipt.message.recipient.id, name: "Archived contact" }] : []);
    for (const snapshot of snapshots) if (!people.some(({ id }) => id === snapshot.id)) people.push(canonicalPerson({ ...snapshot, kind: "person", createdAt: receipt.message.createdAt, updatedAt: receipt.deliveredAt, archived: true }));
  }
  return people;
}
export interface ProjectedMessage { key: string; message: FriendMessage; receipt?: DeliveryReceipt; restoredDraft: boolean }
export function groupsWithDeliveryHistory(document: LifeDocument, receipts: readonly DeliveryReceipt[]): FriendGroup[] {
  const groups = [...(document.friends?.groups ?? [])];
  for (const { message, deliveredAt } of receipts) if (message.recipient.kind === "group" && !groups.some(({ id }) => id === message.recipient.id)) groups.push({ id: message.recipient.id, kind: "friend-group", name: message.recipientSnapshot?.name ?? "Archived group", memberIds: message.recipientSnapshot?.people.map(({ id }) => id) ?? [], createdAt: message.createdAt, updatedAt: deliveredAt, archived: true });
  return groups;
}
/** The immutable delivered envelope is also the authority for marker actions. */
export function messageEnvelope(document: LifeDocument, receipts: readonly DeliveryReceipt[], messageId: string): FriendMessage | undefined {
  return receipts.find(({ message }) => message.id === messageId)?.message ?? document.friends?.messages.find(({ id }) => id === messageId);
}
export function messagesForRecipient(document: LifeDocument, receipts: readonly DeliveryReceipt[], recipient: Recipient): ProjectedMessage[] {
  const matches = (message: FriendMessage) => message.recipient.id === recipient.id && message.recipient.kind === recipient.kind;
  const delivered = receipts.filter(({ message }) => matches(message));
  const result: ProjectedMessage[] = delivered.map((receipt) => ({ key: receipt.transport + receipt.id, message: receipt.message, receipt, restoredDraft: false }));
  for (const message of document.friends?.messages.filter(matches) ?? []) {
    const receipt = delivered.find((item) => item.message.id === message.id);
    if (!receipt || receipt.message.revision !== message.revision || receipt.message.body !== message.body || JSON.stringify(receipt.message.attachment) !== JSON.stringify(message.attachment)) result.push({ key: `draft-${message.id}`, message, restoredDraft: Boolean(receipt) });
  }
  return result.sort((a, b) => a.message.createdAt.localeCompare(b.message.createdAt));
}
