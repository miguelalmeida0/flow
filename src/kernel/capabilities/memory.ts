import { createPersonalMemoryFact, searchPersonalMemory } from "../memoryStore";
import { fail, ok, type Capability, type CapabilityResult } from "../types";

export interface MemoryStoreArgs {
  text: string;
  subjectPersonId?: string;
}

export interface MemorySearchArgs {
  query: string;
}

export interface MemoryRecallArgs {
  subjectPersonId?: string;
}

export const memoryStore: Capability<MemoryStoreArgs> = {
  id: "memory.store",
  domain: "memory",
  description: "Remember a durable personal fact.",
  mutates: true,
  undoable: true,
  riskLevel: "low",
  requiresConfirmation: () => false,
  validate: (args) => (!args.text ? "Say what to remember." : null),
  execute: (args, ctx): CapabilityResult => {
    const fact = createPersonalMemoryFact(args.text, ctx.clock.now().toISOString(), args.subjectPersonId);
    return ok(`Remembered: ${args.text}`, { memory: [...ctx.memory, fact] }, { entityId: fact.id });
  },
};

export const memorySearch: Capability<MemorySearchArgs> = {
  id: "memory.search",
  domain: "memory",
  description: "Search remembered facts.",
  mutates: false,
  undoable: false,
  riskLevel: "low",
  requiresConfirmation: () => false,
  validate: (args) => (!args.query ? "Say what to search for." : null),
  execute: (args, ctx): CapabilityResult => {
    const matches = searchPersonalMemory(ctx.memory, args.query);
    return ok(matches.length === 0 ? `Nothing remembered about "${args.query}".` : `Found ${matches.length} memor${matches.length === 1 ? "y" : "ies"}.`, {}, { data: matches });
  },
};

export const memoryRecall: Capability<MemoryRecallArgs> = {
  id: "memory.recall",
  domain: "memory",
  description: "Recall everything remembered, optionally about one person.",
  mutates: false,
  undoable: false,
  riskLevel: "low",
  requiresConfirmation: () => false,
  validate: () => null,
  execute: (args, ctx): CapabilityResult => {
    const facts = args.subjectPersonId ? ctx.memory.filter((fact) => fact.subjectPersonId === args.subjectPersonId) : ctx.memory;
    if (facts.length === 0) return fail("empty", "Nothing remembered yet.");
    return ok(`${facts.length} remembered fact${facts.length === 1 ? "" : "s"}.`, {}, { data: facts });
  },
};

export const memoryCapabilities = [memoryStore, memorySearch, memoryRecall];
