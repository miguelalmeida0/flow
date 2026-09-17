import { describe, expect, it } from "vitest";
import { createLifeDocument } from "../domain/life-storage";
import type { LifeContext, LifeTransactionRecord } from "../domain/life-model";
import { clearGenericConversation, freshReference, navigateConversation, referenceFor, restoreConversationFromTransaction } from "./conversationContext";

describe("conversation context", () => {
  it("expires generic references after 120 seconds but keeps an explicit id addressable", () => {
    const reference = { id: "roadmap", kind: "calendar-event" as const, at: 1_000 };
    const context: LifeContext = { route: "calendar", selected: reference, nowMs: 121_001 };
    expect(freshReference(context, ["calendar-event"])).toBeUndefined();
    expect(freshReference(context, ["calendar-event"], "roadmap")).toEqual(reference);
  });

  it("navigation preserves recent cross-space references but clears one-shot pending intent", () => {
    const event = { id: "roadmap", kind: "calendar-event" as const, at: 1_000 };
    const capture = { id: "capture-a", kind: "capture" as const, at: 1_000 };
    const navigated = navigateConversation({ route: "home", selected: event, lastChanged: event, pendingIntent: { type: "commitment-create", person: "Miguel", expiresAt: 50_000 } }, "inbox");
    expect(navigated.selected).toEqual(event);
    expect(navigated.pendingIntent).toBeUndefined();
    expect(navigateConversation({ route: "plans", selected: event, lastChanged: capture }, "calendar").selected).toEqual(event);
  });

  it("undo clears generic context and redo restores only a valid transaction primary", () => {
    const document = createLifeDocument("2026-09-03");
    const primary = referenceFor(document, "roadmap", 1_000, "tx-1")!;
    const record = { primaryEntity: primary } as LifeTransactionRecord;
    const cleared = clearGenericConversation({ route: "calendar", selected: primary });
    expect(cleared.selected).toBeUndefined();
    expect(restoreConversationFromTransaction(cleared, record, document, 2_000).selected).toMatchObject({ id: "roadmap", at: 2_000 });
    expect(restoreConversationFromTransaction(cleared, { primaryEntity: { ...primary, id: "deleted" } } as LifeTransactionRecord, document, 2_000).selected).toBeUndefined();
  });
});
