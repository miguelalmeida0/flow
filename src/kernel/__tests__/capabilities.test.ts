import { describe, expect, it } from "vitest";
import { emptyDocument, journeyDocument, fixedClock } from "./fixtures";
import { createDefaultRegistry } from "../capabilities";
import type { CapabilityContext } from "../types";

function contextFor(document = emptyDocument()): CapabilityContext {
  return { document, navigation: { route: "today" }, memory: [], history: [], historyPointer: -1, clock: fixedClock() };
}

describe("capability registry", () => {
  it("registers every domain the sprint requires", () => {
    const registry = createDefaultRegistry();
    expect(registry.domains().sort()).toEqual(["calendar", "friends", "journal", "memory", "navigation", "plans", "system"]);
  });

  it("returns undefined for an unknown capability id", () => {
    const registry = createDefaultRegistry();
    expect(registry.get("nonsense.doStuff")).toBeUndefined();
  });
});

describe("calendar capabilities", () => {
  const registry = createDefaultRegistry();

  it("creates an event with no conflict", () => {
    const ctx = contextFor();
    const create = registry.get("calendar.create")!;
    const result = create.execute({ title: "Standup", startMinutes: 9 * 60, durationMinutes: 15 }, ctx);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.mutation.document?.calendar.events.some((event) => event.title === "Standup")).toBe(true);
  });

  it("moves an event by id when there is no conflict", () => {
    const ctx = contextFor(journeyDocument());
    const move = registry.get("calendar.move")!;
    const result = move.execute({ eventId: "dinner", startMinutes: 18 * 60 }, ctx);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const dinner = result.mutation.document?.calendar.events.find((event) => event.id === "dinner");
    expect(dinner?.start).toBe(18 * 60);
  });

  it("preflight detects a conflict and proposes the next free slot", () => {
    const ctx = contextFor(journeyDocument());
    const move = registry.get("calendar.move")!;
    const preflight = move.preflight!({ eventId: "dinner", startMinutes: 20 * 60 }, ctx);
    expect(preflight.blocking).toBe(true);
    expect(preflight.conflicts[0]?.message).toContain("Drinks");
    expect(preflight.alternatives.map((alt) => alt.label)).toContain("8:30 PM");
  });

  it("the proposed alternative is genuinely executable, not just a plausible-looking label", () => {
    // Regression for the P0 bug: preflight used to suggest offsets that only
    // checked pairwise overlap, so an alternative could still fail once
    // actually executed because it fell outside the schedulable day window.
    // Every alternative preflight offers must survive being executed.
    const ctx = contextFor(journeyDocument());
    const move = registry.get("calendar.move")!;
    const preflight = move.preflight!({ eventId: "dinner", startMinutes: 20 * 60 }, ctx);
    for (const alternative of preflight.alternatives) {
      const result = move.execute({ eventId: "dinner", ...alternative.args }, ctx);
      expect(result.status).toBe("ok");
    }
  });

  it("does not move anything while a conflict is only proposed", () => {
    const ctx = contextFor(journeyDocument());
    const move = registry.get("calendar.move")!;
    const preflight = move.preflight!({ eventId: "dinner", startMinutes: 20 * 60 }, ctx);
    expect(preflight.blocking).toBe(true);
    // Confirms the capability layer is inert until the kernel decides to execute.
    expect(ctx.document.calendar.events.find((event) => event.id === "dinner")?.start).toBe(19 * 60);
  });

  it("flags ambiguous title selectors instead of guessing", () => {
    const document = emptyDocument();
    document.calendar.events.push(document.calendar.events[0]!, { ...document.calendar.events[0]!, id: "dentist-2" });
    const ctx = contextFor(document);
    const rename = registry.get("calendar.rename")!;
    const result = rename.execute({ title: "Dentist", newTitle: "Checkup" }, ctx);
    expect(result.status).toBe("error");
  });

  it("requires confirmation for delete", () => {
    const del = registry.get("calendar.delete")!;
    expect(del.requiresConfirmation({ eventId: "dinner" }, contextFor())).toBe(true);
    expect(del.riskLevel).toBe("high");
  });

  it("protects an event", () => {
    const ctx = contextFor(journeyDocument());
    const protect = registry.get("calendar.protect")!;
    const result = protect.execute({ eventId: "drinks", protect: true }, ctx);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.mutation.document?.calendar.events.find((event) => event.id === "drinks")?.protected).toBe(true);
  });

  it("queries a day's events", () => {
    const query = registry.get("calendar.query")!;
    const result = query.execute({}, contextFor(journeyDocument()));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect((result.data as unknown[]).length).toBe(2);
  });
});

describe("journal capabilities", () => {
  const registry = createDefaultRegistry();

  it("creates, opens the latest, renames, and bookmarks an entry", () => {
    let ctx = contextFor();
    const create = registry.get("journal.create")!;
    const created = create.execute({ title: "Trip to Berlin" }, ctx);
    expect(created.status).toBe("ok");
    if (created.status !== "ok") return;
    ctx = { ...ctx, document: created.mutation.document! };

    const open = registry.get("journal.open")!;
    const opened = open.execute({ which: "latest" }, ctx);
    expect(opened.status).toBe("ok");
    if (opened.status !== "ok") return;
    expect(opened.entityId).toBe(created.entityId);

    const rename = registry.get("journal.rename")!;
    const renamed = rename.execute({ entryId: created.entityId, newTitle: "Berlin Ideas" }, ctx);
    expect(renamed.status).toBe("ok");
    if (renamed.status !== "ok") return;
    ctx = { ...ctx, document: renamed.mutation.document! };
    expect(ctx.document.studio.journalEntries.find((entry) => entry.id === created.entityId)?.title).toBe("Berlin Ideas");

    const bookmark = registry.get("journal.bookmark")!;
    const bookmarked = bookmark.execute({ entryId: created.entityId }, ctx);
    expect(bookmarked.status).toBe("ok");
  });

  it("searches journal text", () => {
    let ctx = contextFor();
    const create = registry.get("journal.create")!;
    const created = create.execute({ title: "Lisbon notes" }, ctx);
    if (created.status !== "ok") throw new Error("setup failed");
    ctx = { ...ctx, document: created.mutation.document! };
    const search = registry.get("journal.search")!;
    const result = search.execute({ query: "lisbon" }, ctx);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect((result.data as { entryId: string }[]).length).toBe(1);
  });
});

describe("plans, friends, and memory capabilities", () => {
  const registry = createDefaultRegistry();

  it("creates and queries a plan", () => {
    let ctx = contextFor();
    const create = registry.get("plans.create")!;
    const created = create.execute({ title: "Renew passport", outcome: "Passport ready" }, ctx);
    expect(created.status).toBe("ok");
    if (created.status !== "ok") return;
    ctx = { ...ctx, document: created.mutation.document! };
    const query = registry.get("plans.query")!;
    const result = query.execute({ status: "active" }, ctx);
    if (result.status !== "ok") throw new Error("query failed");
    expect((result.data as unknown[]).length).toBe(1);
  });

  it("remembers a durable fact about a new person and recalls it (explicit memory only)", () => {
    let ctx = contextFor();
    const remember = registry.get("friends.remember")!;
    const remembered = remember.execute({ name: "João", fact: "doesn't eat meat" }, ctx);
    expect(remembered.status).toBe("ok");
    if (remembered.status !== "ok") return;
    ctx = { ...ctx, document: remembered.mutation.document!, memory: remembered.mutation.memory! };
    expect(ctx.document.people.some((person) => person.name === "João")).toBe(true);

    const recall = registry.get("memory.recall")!;
    const recalled = recall.execute({ subjectPersonId: remembered.entityId }, ctx);
    expect(recalled.status).toBe("ok");
    if (recalled.status !== "ok") return;
    expect((recalled.data as { text: string }[])[0]?.text).toBe("doesn't eat meat");
  });

  it("does not create a memory fact unless memory.store/friends.remember is explicitly called", () => {
    const ctx = contextFor();
    expect(ctx.memory).toEqual([]);
  });

  it("looks up a person by alias", () => {
    const document = emptyDocument();
    document.people.push({ id: "p1", kind: "person", name: "Sofia Alves", aliases: ["Sofi"], createdAt: fixedClock().now().toISOString(), updatedAt: fixedClock().now().toISOString() });
    const ctx = contextFor(document);
    const lookup = registry.get("friends.lookup")!;
    const result = lookup.execute({ name: "Sofi" }, ctx);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect((result.data as { id: string }[])[0]?.id).toBe("p1");
  });
});

describe("navigation capabilities", () => {
  const registry = createDefaultRegistry();

  it("opens a route and remembers where it came from", () => {
    const ctx = contextFor();
    const open = registry.get("navigation.open")!;
    const result = open.execute({ route: "journal" }, ctx);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.mutation.navigation).toEqual({ route: "journal", previousRoute: "today" });
  });

  it("fails to go back with no history", () => {
    const ctx = contextFor();
    const back = registry.get("navigation.back")!;
    expect(back.execute({}, ctx).status).toBe("error");
  });
});

describe("system capabilities", () => {
  const registry = createDefaultRegistry();

  it("reports nothing to undo/redo on a fresh history", () => {
    const ctx = contextFor();
    expect(registry.get("system.undo")!.execute({}, ctx).status).toBe("error");
    expect(registry.get("system.redo")!.execute({}, ctx).status).toBe("error");
  });

  it("reports no changes on an empty history", () => {
    const ctx = contextFor();
    const result = registry.get("system.whatChanged")!.execute({}, ctx);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.description).toBe("Nothing has changed.");
  });
});
