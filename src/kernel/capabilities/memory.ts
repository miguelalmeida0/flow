import { createPersonalMemoryFact, findPersonalMemoryToForget, searchPersonalMemory } from "../memoryStore";
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
  argsSchema: {
    type: "object",
    properties: {
      text: { type: "string", minLength: 1, maxLength: 400, description: "The fact to remember, verbatim." },
      subjectPersonId: { type: "string", description: "Id of the person this fact is about, only if already resolved from context." },
    },
    required: ["text"],
  },
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
  argsSchema: {
    type: "object",
    properties: { query: { type: "string", minLength: 1, maxLength: 200, description: "Free-text search query." } },
    required: ["query"],
  },
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
  argsSchema: {
    type: "object",
    properties: { subjectPersonId: { type: "string", description: "Id of the person to recall memories about, only if already resolved from context." } },
    required: [],
  },
  requiresConfirmation: () => false,
  validate: () => null,
  execute: (args, ctx): CapabilityResult => {
    const facts = args.subjectPersonId ? ctx.memory.filter((fact) => fact.subjectPersonId === args.subjectPersonId) : ctx.memory;
    if (facts.length === 0) return fail("empty", "Nothing remembered yet.");
    return ok(`${facts.length} remembered fact${facts.length === 1 ? "" : "s"}.`, {}, { data: facts });
  },
};

export interface MemoryForgetArgs {
  query: string;
}

export const memoryForget: Capability<MemoryForgetArgs> = {
  id: "memory.forget",
  domain: "memory",
  description: "Delete a durable personal fact.",
  mutates: true,
  undoable: true,
  riskLevel: "low",
  argsSchema: {
    type: "object",
    properties: { query: { type: "string", minLength: 1, maxLength: 200, description: "Text identifying which remembered fact to delete." } },
    required: ["query"],
  },
  requiresConfirmation: () => false,
  validate: (args) => (!args.query ? "Say what to forget." : null),
  execute: (args, ctx): CapabilityResult => {
    const matches = findPersonalMemoryToForget(ctx.memory, args.query);
    if (matches.length === 0) return fail("not_found", `Nothing remembered about "${args.query}".`);
    if (matches.length > 1) return fail("ambiguous", `Multiple memories match "${args.query}": ${matches.map((fact) => `"${fact.text}"`).join(", ")}. Be more specific.`);
    const [fact] = matches;
    return ok(`Forgot: ${fact!.text}`, { memory: ctx.memory.filter((existing) => existing.id !== fact!.id) }, { entityId: fact!.id });
  },
};

export const memoryCapabilities = [memoryStore, memorySearch, memoryRecall, memoryForget];
