import { describe, expect, it } from "vitest";
import { emptyDocument, fixedClock } from "./fixtures";
import { createDefaultRegistry } from "../capabilities";
import { createEnvironment, submit, undo, redo, type KernelEnvironment } from "../kernel";
import { createSession, type ConversationSession } from "../session";
import type { CapabilityContext } from "../types";

function contextFor(document = emptyDocument()): CapabilityContext {
  return { document, navigation: { route: "today" }, memory: [], history: [], historyPointer: -1, clock: fixedClock() };
}

function clearDay(document = emptyDocument()) {
  document.calendar.events = [];
  document.calendars[document.calendar.dateKey]!.events = [];
  return document;
}

describe("entity-identity regression (P0 #2)", () => {
  const registry = createDefaultRegistry();

  it("create returns a non-empty entity id", () => {
    const ctx = contextFor(clearDay());
    const result = registry.get("calendar.create")!.execute({ title: "Focus block", startMinutes: 14 * 60 + 30, durationMinutes: 25 }, ctx);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.entityId).toBeTruthy();
    expect(result.mutation.document?.calendar.events.some((event) => event.id === result.entityId)).toBe(true);
  });

  it("the same id carries through create -> protect -> move without repeating the event's name", () => {
    let env: KernelEnvironment = createEnvironment(registry, clearDay(), { route: "today" }, fixedClock());
    let session: ConversationSession = createSession();

    let step = submit(env, session, "Create a 25-minute focus block at 2:30.", [
      { capabilityId: "calendar.create", args: { title: "Focus block", startMinutes: 14 * 60 + 30, durationMinutes: 25 } },
    ]);
    env = step.env; session = step.session;
    expect(step.outcome.status).toBe("executed");
    const createdId = session.referents.lastMentioned?.id;
    expect(createdId).toBeTruthy();

    step = submit(env, session, "Protect it.", [{ capabilityId: "calendar.protect", args: { eventId: { $ref: "lastMentioned" }, protect: true } }]);
    env = step.env; session = step.session;
    expect(step.outcome.status).toBe("executed");
    let event = env.document.calendar.events.find((e) => e.id === createdId);
    expect(event?.protected).toBe(true);

    step = submit(env, session, "Move it to 3.", [{ capabilityId: "calendar.move", args: { eventId: { $ref: "lastMentioned" }, startMinutes: 15 * 60 } }]);
    env = step.env; session = step.session;
    expect(step.outcome.status).toBe("executed");
    event = env.document.calendar.events.find((e) => e.id === createdId);
    expect(event).toBeTruthy();
    expect(event?.start).toBe(15 * 60);
    // Exactly one event carries this id throughout — never a second, renamed copy.
    expect(env.document.calendar.events.filter((e) => e.id === createdId).length).toBe(1);
  });

  it("referent state (lastMentioned/selected) points at the created event's real id", () => {
    let env: KernelEnvironment = createEnvironment(registry, clearDay(), { route: "today" }, fixedClock());
    let session: ConversationSession = createSession();
    const step = submit(env, session, "Create a focus block.", [{ capabilityId: "calendar.create", args: { title: "Focus block", startMinutes: 10 * 60, durationMinutes: 30 } }]);
    env = step.env; session = step.session;
    const created = env.document.calendar.events.find((e) => e.title === "Focus block")!;
    expect(session.referents.lastMentioned).toEqual({ id: created.id, kind: "calendar-event" });
    expect(session.referents.selected).toEqual({ id: created.id, kind: "calendar-event" });
  });

  it("undo/redo preserve the same entity id across the mutation boundary", () => {
    let env: KernelEnvironment = createEnvironment(registry, clearDay(), { route: "today" }, fixedClock());
    let session: ConversationSession = createSession();

    let step = submit(env, session, "Create a focus block.", [{ capabilityId: "calendar.create", args: { title: "Focus block", startMinutes: 10 * 60, durationMinutes: 30 } }]);
    env = step.env; session = step.session;
    const createdId = session.referents.lastMentioned!.id;

    step = submit(env, session, "Move it to 11.", [{ capabilityId: "calendar.move", args: { eventId: { $ref: "lastMentioned" }, startMinutes: 11 * 60 } }]);
    env = step.env; session = step.session;
    expect(env.document.calendar.events.find((e) => e.id === createdId)?.start).toBe(11 * 60);

    const undone = undo(env, session);
    env = undone.env; session = undone.session;
    expect(env.document.calendar.events.find((e) => e.id === createdId)?.start).toBe(10 * 60);

    const redone = redo(env, session);
    env = redone.env; session = redone.session;
    expect(env.document.calendar.events.find((e) => e.id === createdId)?.start).toBe(11 * 60);
  });

  it("two events created with the same title never share an id", () => {
    let env: KernelEnvironment = createEnvironment(registry, clearDay(), { route: "today" }, fixedClock());
    let session: ConversationSession = createSession();

    let step = submit(env, session, "Create a focus block at 10.", [{ capabilityId: "calendar.create", args: { title: "Focus block", startMinutes: 10 * 60, durationMinutes: 30 } }]);
    env = step.env; session = step.session;
    const firstId = session.referents.lastMentioned!.id;

    step = submit(env, session, "Create a focus block at 1.", [{ capabilityId: "calendar.create", args: { title: "Focus block", startMinutes: 13 * 60, durationMinutes: 30 } }]);
    env = step.env; session = step.session;
    const secondId = session.referents.lastMentioned!.id;

    expect(firstId).not.toBe(secondId);
    expect(env.document.calendar.events.filter((e) => e.title === "Focus block").length).toBe(2);
  });

  it("a failed create at the capability layer returns no id and leaves the document untouched", () => {
    const ctx = contextFor(clearDay());
    // A duration longer than the entire schedulable day (7 AM-9 PM = 840
    // minutes) can never fit anywhere, regardless of conflicts.
    const result = registry.get("calendar.create")!.execute({ title: "Impossible", startMinutes: 9 * 60, durationMinutes: 1000 }, ctx);
    expect(result.status).toBe("error"); // a CapabilityFailure has no entityId field at all — nothing to leak.
    expect(ctx.document.calendar.events.length).toBe(0);
  });

  it("a failed create at the kernel layer leaves no phantom history entry or referent", () => {
    const env: KernelEnvironment = createEnvironment(registry, clearDay(), { route: "today" }, fixedClock());
    const session: ConversationSession = createSession();
    const step = submit(env, session, "Create something impossible.", [
      { capabilityId: "calendar.create", args: { title: "Impossible", startMinutes: 9 * 60, durationMinutes: 1000 } },
    ]);
    expect(step.outcome.status).toBe("error");
    expect(step.env).toBe(env); // untouched — same reference, not just equal
    expect(step.session.referents.lastMentioned).toBeUndefined();
    expect(step.env.history.entries.length).toBe(0);
  });
});
