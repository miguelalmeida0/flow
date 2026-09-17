import { applyLifeTransaction } from "../../domain/life-transaction";
import type { Person } from "../../domain/life-model";
import { createPersonalMemoryFact } from "../memoryStore";
import { fail, ok, type Capability, type CapabilityResult } from "../types";

function findPeople(people: Person[], query: { personId?: string; name?: string }): Person[] {
  if (query.personId) return people.filter((person) => person.id === query.personId);
  if (query.name) {
    const needle = query.name.toLowerCase();
    return people.filter((person) => person.name.toLowerCase().includes(needle) || person.aliases?.some((alias) => alias.toLowerCase().includes(needle)));
  }
  return [];
}

let sequence = 0;
function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

export interface FriendsLookupArgs {
  name: string;
}

export interface FriendsOpenArgs {
  personId?: string;
  name?: string;
}

export interface FriendsRememberArgs {
  name: string;
  fact: string;
}

export const friendsLookup: Capability<FriendsLookupArgs> = {
  id: "friends.lookup",
  domain: "friends",
  description: "Look up a person by name.",
  mutates: false,
  undoable: false,
  riskLevel: "low",
  requiresConfirmation: () => false,
  validate: (args) => (!args.name ? "Say a name." : null),
  execute: (args, ctx): CapabilityResult => {
    const matches = findPeople(ctx.document.people, args);
    return ok(matches.length === 0 ? `Nobody named "${args.name}" yet.` : `Found ${matches.length} match${matches.length === 1 ? "" : "es"}.`, {}, { data: matches });
  },
};

export const friendsOpen: Capability<FriendsOpenArgs> = {
  id: "friends.open",
  domain: "friends",
  description: "Open a person's profile.",
  mutates: false,
  undoable: false,
  riskLevel: "low",
  requiresConfirmation: () => false,
  validate: (args) => (!args.personId && !args.name ? "Say who to open." : null),
  execute: (args, ctx): CapabilityResult => {
    const matches = findPeople(ctx.document.people, args);
    if (matches.length === 0) return fail("not-found", `Couldn't find "${args.name}".`);
    if (matches.length > 1) return fail("ambiguous", `Which ${args.name}? There are ${matches.length}.`);
    const person = matches[0]!;
    return ok(`Opened ${person.name}.`, { navigation: { route: "people", previousRoute: ctx.navigation.route } }, { entityId: person.id, entityKind: "person" });
  },
};

export const friendsRemember: Capability<FriendsRememberArgs> = {
  id: "friends.remember",
  domain: "friends",
  description: "Remember a durable fact about a person.",
  mutates: true,
  undoable: true,
  riskLevel: "low",
  requiresConfirmation: () => false,
  validate: (args) => (!args.name ? "Say who." : !args.fact ? "Say what to remember." : null),
  execute: (args, ctx): CapabilityResult => {
    const existing = findPeople(ctx.document.people, { name: args.name })[0];
    const now = ctx.clock.now().toISOString();
    let document = ctx.document;
    let personId = existing?.id;
    if (!existing) {
      const person: Person = { id: nextId("person"), kind: "person", name: args.name, createdAt: now, updatedAt: now };
      const result = applyLifeTransaction(ctx.document, [{ type: "person.ensure", person }], ctx.clock.now);
      if (result.status !== "success") return fail("friends-remember-failed", result.detail);
      document = result.document;
      personId = document.people.find((candidate) => candidate.name.toLowerCase() === args.name.toLowerCase())?.id ?? person.id;
    }
    const fact = createPersonalMemoryFact(args.fact, now, personId);
    return ok(`Remembered that ${args.name} ${args.fact}.`, { document, memory: [...ctx.memory, fact] }, { entityId: personId, entityKind: "person" });
  },
};

export const friendsCapabilities = [friendsLookup, friendsOpen, friendsRemember];
