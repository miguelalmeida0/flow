import { describe, expect, it } from "vitest";
import { journeyDocument, fixedClock } from "./fixtures";
import { createDefaultRegistry } from "../capabilities";
import { createEnvironment, submit, reply, type KernelEnvironment } from "../kernel";
import { createSession, type ConversationSession } from "../session";

/** Regression coverage for the conversational-reply surface added while
 * fixing P0 #1 (Journey A needs "8:30 works." and "What changed?" to work as
 * plain replies, not just as direct kernel API calls). */
describe("reply() proposal-alternative and what-changed dispatch", () => {
  const registry = createDefaultRegistry();

  it("a natural reply naming an alternative's time picks and executes it", () => {
    let env: KernelEnvironment = createEnvironment(registry, journeyDocument(), { route: "today" }, fixedClock());
    let session: ConversationSession = createSession();

    let step = submit(env, session, "Move dinner to 8.", [{ capabilityId: "calendar.move", args: { eventId: "dinner", startMinutes: 20 * 60 } }]);
    env = step.env; session = step.session;
    expect(step.outcome.status).toBe("proposed");

    step = reply(env, session, "8:30 works.");
    env = step.env; session = step.session;
    expect(step.outcome.status).toBe("executed");
    expect(env.document.calendar.events.find((event) => event.id === "dinner")?.start).toBe(20 * 60 + 30);
  });

  it("a reply that matches nothing still falls back to a clear error", () => {
    let env: KernelEnvironment = createEnvironment(registry, journeyDocument(), { route: "today" }, fixedClock());
    let session: ConversationSession = createSession();
    let step = submit(env, session, "Move dinner to 8.", [{ capabilityId: "calendar.move", args: { eventId: "dinner", startMinutes: 20 * 60 } }]);
    env = step.env; session = step.session;

    step = reply(env, session, "purple elephants");
    expect(step.outcome.status).toBe("error");
  });

  it("'What changed?' reports the human-readable history without needing the raw whatChanged() call", () => {
    let env: KernelEnvironment = createEnvironment(registry, journeyDocument(), { route: "today" }, fixedClock());
    let session: ConversationSession = createSession();

    let step = submit(env, session, "Move dinner to 8.", [{ capabilityId: "calendar.move", args: { eventId: "dinner", startMinutes: 20 * 60 } }]);
    env = step.env; session = step.session;
    step = reply(env, session, "Yes.");
    env = step.env; session = step.session;
    expect(step.outcome.status).toBe("executed");

    step = reply(env, session, "What changed?");
    expect(step.outcome.status).toBe("executed");
    if (step.outcome.status === "executed") {
      expect(step.outcome.descriptions.join(" ")).toContain("Dinner");
    }
  });
});
