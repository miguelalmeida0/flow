import { describe, expect, it, vi } from "vitest";
import { approve, createSession, submit } from "../kernel";
import { emptyDocument, testEnvironment, AT } from "./fixtures";
import { persistKernelMutation, runKernelTurn, settleKernelTurn } from "../productionBridge";
import { createIdempotencyStore, stageIdempotency } from "../idempotency";
import type { TurnAuthority } from "../turnAuthority";
import { createDefaultRegistry } from "../capabilities";

const authority: TurnAuthority = { sessionId: "test", turnId: "request-1", captureEpoch: 1, documentRevision: 4, createdAtMs: Date.parse(AT) };
function review() {
  const env = { ...testEnvironment(), authority, requireMutationReview: true };
  return submit(env, createSession("test"), "Create note", [{ capabilityId: "journal.create", args: { title: "Review me" } }]);
}

describe("durable proposal authority", () => {
  it("keeps idempotency tentative until durable completion, scoped to request identity", () => {
    const parent = createIdempotencyStore();
    const first = stageIdempotency(parent, "first");
    first.set("mutation", { description: "saved" });
    expect(stageIdempotency(parent, "first").get("mutation")).toBeUndefined();
    first.commit();
    expect(stageIdempotency(parent, "first").get("mutation")?.description).toBe("saved");
    expect(stageIdempotency(parent, "new-intention").get("mutation")).toBeUndefined();
  });
  it.each(["revision", "session", "expiry", "capability"])("rejects approval after %s changes", (change) => {
    const proposed = review();
    expect(proposed.outcome.status).toBe("proposed");
    const env = { ...proposed.env };
    if (change === "revision") env.authority = { ...authority, documentRevision: 5 };
    if (change === "session") env.authority = { ...authority, sessionId: "other" };
    if (change === "expiry") env.clock = { now: () => new Date(Date.parse(AT) + 60_001) };
    if (change === "capability") { env.registry = createDefaultRegistry("hosted"); vi.spyOn(env.registry, "get").mockReturnValue(undefined); }
    const result = approve(env, proposed.session);
    expect(result.outcome.status).toBe("error");
    expect(result.env.document.studio.journalEntries).toHaveLength(0);
  });

  it("preserves the originating proposal when approval has its own capture", () => {
    const proposed = review();
    const result = approve({ ...proposed.env, authority: { ...authority, turnId: "approval-2", captureEpoch: 2 } }, proposed.session);
    expect(result.outcome.status).toBe("executed");
    expect(result.env.document.studio.journalEntries).toHaveLength(1);
  });

  it.each(["open the calendar", "Where did I mention Lisbon"])("cannot approve a superseded proposal after %s", (utterance) => {
    const proposed = review();
    const other = runKernelTurn(utterance, proposed.env.document, [], proposed.session, () => new Date(AT), { authority });
    expect(other.session.activeProposal).toBeUndefined();
    const result = runKernelTurn("confirm", proposed.env.document, [], other.session, () => new Date(AT), { authority });
    expect(result.env.document.studio.journalEntries).toHaveLength(0);
    expect(result.recognized).toBe(false);
  });

  it("does not let a one-step preview authorize a hosted compound mutation", () => {
    const env = { ...testEnvironment(), authority, requireMutationReview: true };
    const result = submit(env, createSession("test"), "create both", [{ capabilityId: "journal.create", args: { title: "one" } }, { capabilityId: "plans.create", args: { title: "two", outcome: "done" } }]);
    expect(result.outcome).toMatchObject({ status: "error", message: expect.stringContaining("one change at a time") });
    expect(result.env.document).toEqual(env.document);
  });

  it("discards early steps and idempotency if a compound plan pauses later", () => {
    const store = createIdempotencyStore();
    const staged = stageIdempotency(store, "compound");
    const env = { ...testEnvironment(), idempotency: staged };
    const session = createSession();
    const step = submit(env, session, "create then remove", [{ capabilityId: "journal.create", args: { title: "tentative" } }, { capabilityId: "memory.forget", args: { query: "unknown" } }]);
    const persist = vi.fn(() => true);
    const settled = settleKernelTurn({ ...step, phase: "done", message: "test", recognized: true }, { document: env.document, memory: [], session }, persist, () => staged.commit());
    expect(settled.status).toBe("error");
    expect(persist).not.toHaveBeenCalled();
    expect(settled.result.session).toBe(session);
    expect(store.size()).toBe(0);
  });
});

describe("complete mutation translation", () => {
  it.each(["plan steps", "calendar alias", "calendar deletion", "journal bookmark"])("rejects unsupported %s changes without saving", (change) => {
    const before = emptyDocument();
    before.plans.push({ id: "p", kind: "plan", title: "Plan", outcome: "done", status: "active", stepIds: [], createdAt: AT, updatedAt: AT });
    const created = submit(testEnvironment(before), createSession(), "journal", [{ capabilityId: "journal.create", args: { title: "entry" } }]);
    const document = created.env.document;
    document.studio.journalEntries[0]!.bookmarks.push({ id: "b", timestampMs: 10, createdAt: AT });
    const after = structuredClone(document);
    if (change === "plan steps") after.plans[0]!.stepIds.push("untranslated");
    if (change === "calendar alias") after.calendar.events = [];
    if (change === "calendar deletion") delete after.calendars[after.calendar.dateKey];
    if (change === "journal bookmark") after.studio.journalEntries[0]!.bookmarks[0]!.timestampMs = 900;
    expect(() => persistKernelMutation("", document, [], after, [], undefined)).toThrow(/Nothing changed/);
  });
});
