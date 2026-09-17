import { beforeEach, describe, expect, it } from "vitest";
import { canonicalPerson, resolvePeople } from "./people";
import { createFreshLifeSnapshot, LIFE_STORAGE_KEY, loadLifeSnapshot } from "../../domain/life-storage";
import { validateLifeDocument } from "../../domain/life-invariants";
import { applyLifeTransaction } from "../../domain/life-transaction";
import { resolveGlobalCommand } from "../../shared/command/globalInterpreter";

const person = (id: string, name: string, aliases: string[] = []) => canonicalPerson({ id, kind: "person", name, aliases, createdAt: "2026-09-12T09:00:00Z", updatedAt: "2026-09-12T09:00:00Z" });
beforeEach(() => localStorage.clear());
describe("canonical Friends identity", () => {
  it("preserves full names and aliases, and clarifies all plausible short names", () => {
    const people = [person("s1", "Sarah"), person("s2", "Sarah Miller"), person("j1", "John", ["Johnny"]), person("j2", "Johnny Appleseed")];
    expect(resolvePeople(people, "Sarah").map(({ id }) => id)).toEqual(["s1", "s2"]);
    expect(resolvePeople(people, "Sarah Miller").map(({ id }) => id)).toEqual(["s2"]);
    expect(resolvePeople(people, "Johnny").map(({ id }) => id)).toEqual(["j1", "j2"]);
    expect(resolvePeople(people, "Sara")).toEqual([]);
  });
  it("migrates current, past and future without changing canonical identities", () => {
    const snapshot = createFreshLifeSnapshot("2026-09-12");
    snapshot.document.schemaVersion = 5; delete snapshot.document.friends;
    snapshot.document.people = [{ id: "existing-mum", kind: "person", name: "Mum", createdAt: "2020-01-01", updatedAt: "2020-01-02" }];
    snapshot.past = [{ document: structuredClone(snapshot.document) }];
    snapshot.future = [{ document: structuredClone(snapshot.document) }];
    localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(snapshot));
    const loaded = loadLifeSnapshot("2026-09-12");
    for (const document of [loaded.document, loaded.past[0]!.document, loaded.future[0]!.document]) {
      expect(document.schemaVersion).toBe(6); expect(document.friends?.voiceNotes).toEqual([]);
      expect(document.people[0]).toMatchObject({ id: "existing-mum", name: "Mum", displayName: "Mum", preferredChannel: "flow-local" });
      expect(validateLifeDocument(document)).toBeNull();
    }
    expect(loadLifeSnapshot("2026-09-12")).toEqual(loaded);
  });
  it("allows distinct people with the same name and rejects duplicate IDs atomically", () => {
    const before = createFreshLifeSnapshot("2026-09-12").document;
    const added = applyLifeTransaction(before, [{ type: "person.create", person: person("one", "Sarah") }, { type: "person.create", person: person("two", "Sarah") }], () => new Date("2026-09-12T09:00:00Z"));
    expect(added.status).toBe("success");
    if (added.status === "success") expect(added.document.people).toHaveLength(2);
    const rejected = applyLifeTransaction(before, [{ type: "person.create", person: person("one", "Sarah") }, { type: "person.create", person: person("one", "Sam") }], () => new Date("2026-09-12T09:00:00Z"));
    expect(rejected.status).toBe("conflict"); expect(before.people).toEqual([]);
  });
});
describe("literal message frames in the global registry", () => {
  it.each([
    ["Remember to call Sarah as soon as I finish", "capture-create"],
    ["Tell me a joke", "unsupported"],
    ["Open Friends", "navigate"],
    ["Open person please", "navigate"],
  ])("preserves the existing global route for %s", (text, type) => {
    expect(resolveGlobalCommand(text, { route: "home" }, "2026-09-12").intent.type).toBe(type);
  });
  it.each([
    ["Text Sarah I'll be there at six", "Sarah", "I'll be there at six"],
    ["Tell John that we booked Thursday at ten", "John", "we booked Thursday at ten"],
    ["Message Sarah Miller: cancel the meeting", "Sarah Miller", "cancel the meeting"],
    ["Please text Mum saying I love you", "Mum", "I love you"],
    ['Send a message to John "stop and go home"', "John", "stop and go home"],
    ["Text Sarah that I can come, actually cancel lunch", "Sarah", "I can come, actually cancel lunch"],
    ["Text Sarah please call me, sorry delete the meeting", "Sarah", "please call me, sorry delete the meeting"],
    ["Text Sarah that call me please", "Sarah", "call me please"],
    ['Text Sarah "Call at 10:00"', "Sarah", "Call at 10:00"],
    ['Text Sarah "I said that we should go"', "Sarah", "I said that we should go"],
    ["Text Sarah hello, are you free?", "Sarah", "hello, are you free?"],
  ])("keeps %s as an explicit message payload", (text, recipientQuery, body) => {
    expect(resolveGlobalCommand(text, { route: "home" }, "2026-09-12").intent).toMatchObject({ type: "friend-message", recipientQuery, body });
  });
});
