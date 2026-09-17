import { describe, expect, it } from "vitest";
import { withEventDefaults } from "../../features/day-planner/eventDefaults";
import { DAY_END } from "../../features/day-planner/time";
import { emptyDocument, journeyDocument, noAlternativeJourneyDocument, fixedClock } from "./fixtures";
import { createDefaultRegistry } from "../capabilities";
import { createEnvironment, submit, approve, type KernelEnvironment } from "../kernel";
import { createSession, type ConversationSession } from "../session";
import type { CapabilityContext } from "../types";

function contextFor(document = emptyDocument()): CapabilityContext {
  return { document, navigation: { route: "today" }, memory: [], history: [], historyPointer: -1, clock: fixedClock() };
}

describe("move-alternatives regression (P0 #1)", () => {
  const registry = createDefaultRegistry();

  it("flags a real conflict at the requested time", () => {
    const preflight = registry.get("calendar.move")!.preflight!({ eventId: "dinner", startMinutes: 20 * 60 }, contextFor(journeyDocument()));
    expect(preflight.blocking).toBe(true);
    expect(preflight.conflicts[0]?.message).toContain("Drinks");
  });

  it("every proposed slot is genuinely free and executes cleanly", () => {
    const ctx = contextFor(journeyDocument());
    const move = registry.get("calendar.move")!;
    const preflight = move.preflight!({ eventId: "dinner", startMinutes: 20 * 60 }, ctx);
    expect(preflight.alternatives.length).toBeGreaterThan(0);
    for (const alternative of preflight.alternatives) {
      const result = move.execute({ eventId: "dinner", ...alternative.args }, ctx);
      expect(result.status).toBe("ok");
      if (result.status !== "ok") continue;
      const dinner = result.mutation.document?.calendar.events.find((event) => event.id === "dinner");
      expect(dinner?.start).toBe((alternative.args as { startMinutes: number }).startMinutes);
    }
  });

  it("respects the moved event's own duration — no alternative overruns the day", () => {
    const ctx = contextFor(journeyDocument());
    const move = registry.get("calendar.move")!;
    const preflight = move.preflight!({ eventId: "dinner", startMinutes: 20 * 60 }, ctx);
    const dinnerDuration = 30;
    for (const alternative of preflight.alternatives) {
      const start = (alternative.args as { startMinutes: number }).startMinutes;
      expect(start + dinnerDuration).toBeLessThanOrEqual(DAY_END);
    }
  });

  it("skips over multiple adjacent conflicting events to find the real gap beyond them", () => {
    const document = emptyDocument();
    document.calendar.events = [
      withEventDefaults({ id: "a", title: "A", dateKey: document.calendar.dateKey, start: 12 * 60, end: 12 * 60 + 30, kind: "fixed", priority: "medium" }),
      withEventDefaults({ id: "b", title: "B", dateKey: document.calendar.dateKey, start: 12 * 60 + 30, end: 13 * 60, kind: "fixed", priority: "medium" }),
      withEventDefaults({ id: "c", title: "C", dateKey: document.calendar.dateKey, start: 13 * 60, end: 13 * 60 + 30, kind: "fixed", priority: "medium" }),
      withEventDefaults({ id: "movable", title: "Movable", dateKey: document.calendar.dateKey, start: 9 * 60, end: 9 * 60 + 30, kind: "flexible", priority: "medium" }),
    ];
    document.calendars = { [document.calendar.dateKey]: structuredClone(document.calendar) };
    const ctx = contextFor(document);
    const move = registry.get("calendar.move")!;
    // Ask to move "Movable" into the middle of the A/B/C block (12:15) — every
    // alternative must land at or after 13:30 (past all three) or before noon.
    const preflight = move.preflight!({ eventId: "movable", startMinutes: 12 * 60 + 15 }, ctx);
    expect(preflight.blocking).toBe(true);
    for (const alternative of preflight.alternatives) {
      const start = (alternative.args as { startMinutes: number }).startMinutes;
      const end = start + 30;
      const inGap = end <= 12 * 60 || start >= 13 * 60 + 30;
      expect(inGap).toBe(true);
      const result = move.execute({ eventId: "movable", startMinutes: start }, ctx);
      expect(result.status).toBe("ok");
    }
  });

  it("a protected event blocks a move into its time exactly like any other event", () => {
    // "dinner" is kind: "protected" in journeyDocument — moving "drinks" onto
    // it must still be reported as a genuine, blocking conflict.
    const ctx = contextFor(journeyDocument());
    const move = registry.get("calendar.move")!;
    const preflight = move.preflight!({ eventId: "drinks", startMinutes: 19 * 60 }, ctx);
    expect(preflight.blocking).toBe(true);
    expect(preflight.conflicts[0]?.withEntityId).toBe("dinner");
  });

  it("reports no alternatives when none genuinely exist, instead of a broken one", () => {
    // A 60-minute Dinner butting exactly against a 60-minute Drinks with zero
    // slack before the 9 PM day boundary — there is nowhere else for a full
    // hour to go without displacing something else.
    const ctx = contextFor(noAlternativeJourneyDocument());
    const move = registry.get("calendar.move")!;
    const preflight = move.preflight!({ eventId: "dinner", startMinutes: 20 * 60 }, ctx);
    expect(preflight.blocking).toBe(true);
    expect(preflight.alternatives).toEqual([]);
  });

  it("a corrected request replaces the previous proposal outright", () => {
    let env: KernelEnvironment = createEnvironment(registry, journeyDocument(), { route: "today" }, fixedClock());
    let session: ConversationSession = createSession();

    let step = submit(env, session, "Move dinner to 8.", [{ capabilityId: "calendar.move", args: { eventId: "dinner", startMinutes: 20 * 60 } }]);
    env = step.env; session = step.session;
    expect(step.outcome.status).toBe("proposed");
    const firstProposalId = session.activeProposal!.id;

    step = submit(env, session, "Actually, move dinner to 8:15 instead.", [{ capabilityId: "calendar.move", args: { eventId: "dinner", startMinutes: 20 * 60 + 15 } }]);
    env = step.env; session = step.session;
    expect(step.outcome.status).toBe("proposed"); // still conflicts with Drinks, so a fresh proposal replaces the first.
    expect(session.activeProposal!.id).not.toBe(firstProposalId);
  });

  it("approving after a correction only ever executes the latest proposal, never a stale one", () => {
    let env: KernelEnvironment = createEnvironment(registry, journeyDocument(), { route: "today" }, fixedClock());
    let session: ConversationSession = createSession();

    let step = submit(env, session, "Move dinner to 8.", [{ capabilityId: "calendar.move", args: { eventId: "dinner", startMinutes: 20 * 60 } }]);
    env = step.env; session = step.session;
    const firstProposalArgs = session.activeProposal!.step.args;

    step = submit(env, session, "Move dinner to 6:45 instead.", [{ capabilityId: "calendar.move", args: { eventId: "dinner", startMinutes: 18 * 60 + 45 } }]);
    env = step.env; session = step.session;
    expect(step.outcome.status).toBe("executed"); // 6:45 has no conflict at all, so it runs immediately.

    const dinner = env.document.calendar.events.find((event) => event.id === "dinner")!;
    expect(dinner.start).toBe(18 * 60 + 45);
    expect(dinner.start).not.toBe((firstProposalArgs as { startMinutes: number }).startMinutes);

    // There's nothing left pending to approve — the corrected request already
    // executed outright, and the original (8 PM) proposal is gone.
    const approved = approve(env, session);
    expect(approved.outcome.status).toBe("error");
  });
});
