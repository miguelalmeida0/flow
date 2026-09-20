import { describe, it, expect } from "vitest";
import { createDefaultRegistry } from "../capabilities";
import { createEnvironment, createSession, submit, approve, reject, type KernelEnvironment } from "../kernel";
import { createIdempotencyStore } from "../idempotency";
import { fixedClock, emptyDocument, journeyDocument, AT } from "./fixtures";
import type { PlanStepInput } from "../planner";

/**
 * Real, required scenarios (see FINAL REPORT §6): duplicate final
 * transcript, duplicate "yes", HTTP/model retry, component rerender,
 * companion reconnect, rapid double-submit, stale-then-current approval,
 * partial multi-step failure + retry. Every one of these reduces to either
 * (a) the exact same capabilityId+args reaching `executeStep` twice, which
 * the idempotency store now catches, or (b) an already-protected kernel
 * mechanism (proposal staleness) this file also verifies still holds.
 */

function envWithStore(document = emptyDocument(), ttlMs?: number, maxEntries?: number, now: () => number = () => new Date(AT).getTime()): KernelEnvironment {
  const store = createIdempotencyStore({ ttlMs, maxEntries, now });
  return createEnvironment(createDefaultRegistry(), document, { route: "today" }, fixedClock(), store);
}

describe("idempotency boundary", () => {
  it("a duplicate final transcript / rapid double-submit does not mutate twice", () => {
    const env = envWithStore();
    const session = createSession();
    const steps: PlanStepInput[] = [{ capabilityId: "journal.create", args: { title: "Trip planning" }, utterance: "Create a journal entry called Trip planning" }];

    const first = submit(env, session, "Create a journal entry called Trip planning", steps);
    expect(first.outcome.status).toBe("executed");
    expect(first.env.document.studio.journalEntries).toHaveLength(1);

    // Same content resubmitted from scratch — a retry, a rerender, a
    // reconnect replaying the same request, or literally a duplicated
    // final transcript are indistinguishable from the kernel's point of
    // view, and all reduce to this.
    const second = submit(first.env, first.session, "Create a journal entry called Trip planning", steps);
    expect(second.outcome.status).toBe("executed");
    expect(second.env.document.studio.journalEntries).toHaveLength(1); // still one, not two
  });

  it("a genuinely new/corrected request (different args) still executes normally", () => {
    const env = envWithStore();
    const session = createSession();
    const first = submit(env, session, "Create a journal entry called Trip planning", [{ capabilityId: "journal.create", args: { title: "Trip planning" }, utterance: "x" }]);
    const revised = submit(first.env, first.session, "Create a journal entry called Trip planning v2", [{ capabilityId: "journal.create", args: { title: "Trip planning v2" }, utterance: "x" }]);
    expect(revised.outcome.status).toBe("executed");
    expect(revised.env.document.studio.journalEntries.map((entry) => entry.title).sort()).toEqual(["Trip planning", "Trip planning v2"]);
  });

  it("a failed pre-execution attempt is never cached and can be retried safely", () => {
    const env = envWithStore();
    const session = createSession();
    // journal.create's own domain invariant (not a capability-level
    // validate()) rejects an empty title inside execute() itself — this
    // still proves the point: `executeStep` only calls `env.idempotency.set`
    // AFTER a successful result, so a failed attempt is never cached and a
    // corrected retry is never blocked as "already done."
    const failed = submit(env, session, "Create a journal entry", [{ capabilityId: "journal.create", args: { title: "" }, utterance: "x" }]);
    expect(failed.outcome.status).toBe("error");
    expect(failed.env.document.studio.journalEntries).toHaveLength(0);

    const retried = submit(env, session, "Create a journal entry called Notes", [{ capabilityId: "journal.create", args: { title: "Notes" }, utterance: "x" }]);
    expect(retried.outcome.status).toBe("executed");
    expect(retried.env.document.studio.journalEntries).toHaveLength(1);
  });

  it("a partially executed multi-step plan does not replay the already-completed irreversible step on retry", () => {
    const env = envWithStore();
    const session = createSession();
    // Step 1 always succeeds; step 2's empty title fails journal.create's
    // own domain invariant, halting the plan there with step 1 preserved.
    const steps: PlanStepInput[] = [
      { capabilityId: "journal.create", args: { title: "Trip planning" }, utterance: "x" },
      { capabilityId: "journal.create", args: { title: "" }, utterance: "x" },
    ];
    const first = submit(env, session, "multi-step", steps);
    expect(first.outcome.status).toBe("error");
    expect(first.env.document.studio.journalEntries).toHaveLength(1); // step 1 DID complete

    // Retry the exact same multi-step request from scratch (a new Plan
    // object, no memory of the first Plan's executionState) with step 2
    // now fixed.
    const retriedSteps: PlanStepInput[] = [
      { capabilityId: "journal.create", args: { title: "Trip planning" }, utterance: "x" },
      { capabilityId: "journal.create", args: { title: "Follow-up" }, utterance: "x" },
    ];
    const retried = submit(first.env, first.session, "multi-step", retriedSteps);
    expect(retried.outcome.status).toBe("executed");
    // Step 1's mutation must NOT replay — still exactly one "Trip planning" entry.
    const titles = retried.env.document.studio.journalEntries.map((entry) => entry.title).sort();
    expect(titles).toEqual(["Follow-up", "Trip planning"]);
  });

  it("a rejected proposal can never later be approved (pre-existing proposal-status guard, verified still holds)", () => {
    const env = envWithStore(journeyDocument());
    const session = createSession();
    const proposed = submit(env, session, "move dinner", [{ capabilityId: "calendar.move", args: { eventId: "dinner", startMinutes: 20 * 60 }, utterance: "x" }]);
    expect(proposed.outcome.status).toBe("proposed");

    const rejected = reject(proposed.env, proposed.session);
    expect(rejected.outcome.status).toBe("cancelled");

    const lateApprove = approve(rejected.env, rejected.session);
    expect(lateApprove.outcome.status).toBe("error"); // "There's nothing to confirm."
    expect(lateApprove.env.document).toEqual(env.document); // nothing moved
  });

  it("duplicate 'yes' on the same proposal only executes once (pre-existing proposal-status guard, verified still holds)", () => {
    const env = envWithStore(journeyDocument());
    const session = createSession();
    const proposed = submit(env, session, "move dinner", [{ capabilityId: "calendar.move", args: { eventId: "dinner", startMinutes: 20 * 60 }, utterance: "x" }]);
    expect(proposed.outcome.status).toBe("proposed");

    const firstApprove = approve(proposed.env, proposed.session);
    expect(firstApprove.outcome.status).toBe("executed");

    const secondApprove = approve(firstApprove.env, firstApprove.session);
    expect(secondApprove.outcome.status).toBe("error"); // "There's nothing to confirm."
  });

  it("bounded lifecycle: entries expire after the TTL and can execute again", () => {
    let clockMs = new Date(AT).getTime();
    const env = envWithStore(emptyDocument(), 1000, undefined, () => clockMs);
    const session = createSession();
    const steps: PlanStepInput[] = [{ capabilityId: "journal.create", args: { title: "Note" }, utterance: "x" }];

    const first = submit(env, session, "x", steps);
    expect(first.env.document.studio.journalEntries).toHaveLength(1);

    // Within the TTL: still deduplicated.
    const second = submit(first.env, first.session, "x", steps);
    expect(second.env.document.studio.journalEntries).toHaveLength(1);

    // Past the TTL: a repeated (now stale) request is treated as new — this
    // is a deliberate tradeoff (see idempotency.ts's doc), not a bug: after
    // 90s (default) a repeated phrase is far more likely a genuine new
    // request than a leftover retry.
    clockMs += 2000;
    const third = submit(second.env, second.session, "x", steps);
    expect(third.env.document.studio.journalEntries).toHaveLength(2);
  });

  it("bounded lifecycle: the store never grows past maxEntries", () => {
    const store = createIdempotencyStore({ maxEntries: 3, now: () => Date.now() });
    for (let i = 0; i < 10; i += 1) store.set(`key-${i}`, { description: `d${i}` });
    expect(store.size()).toBeLessThanOrEqual(3);
  });

  it("without a store configured (e.g. test fixtures), behaves exactly as before — no duplicate protection, no crash", () => {
    const env = createEnvironment(createDefaultRegistry(), emptyDocument(), { route: "today" }, fixedClock());
    const session = createSession();
    const steps: PlanStepInput[] = [{ capabilityId: "journal.create", args: { title: "Note" }, utterance: "x" }];
    const first = submit(env, session, "x", steps);
    const second = submit(first.env, first.session, "x", steps);
    expect(first.outcome.status).toBe("executed");
    expect(second.outcome.status).toBe("executed");
    expect(second.env.document.studio.journalEntries).toHaveLength(2); // no store = no dedup, matches pre-existing behavior
  });
});
