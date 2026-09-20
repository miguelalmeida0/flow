import { searchEverything, commitmentsFor, type SearchHit } from "../search";
import { ok, fail, type Capability, type CapabilityResult } from "../types";

export interface RecallSearchArgs {
  query: string;
}

export interface RecallCommitmentsArgs {
  personId: string;
}

/** Universal recall: every result is a SearchHit carrying its own
 * provenance (sourceId/deepLink/timestamps) — see search.ts. This capability
 * never invents an answer; if nothing indexed matches, it says so. */
export const recallSearch: Capability<RecallSearchArgs> = {
  id: "recall.search",
  domain: "recall",
  description: "Search everything Flow knows, with provenance back to the source.",
  mutates: false,
  undoable: false,
  riskLevel: "low",
  argsSchema: {
    type: "object",
    description: "Use this for any personal-recall question about what the user said, decided, or did — e.g. \"What did I decide about Lisbon?\"",
    properties: { query: { type: "string", minLength: 1, maxLength: 200, description: "The topic or keywords to search for, taken from the user's question." } },
    required: ["query"],
  },
  requiresConfirmation: () => false,
  validate: (args) => (!args.query ? "Say what to look for." : null),
  execute: (args, ctx): CapabilityResult => {
    const hits: SearchHit[] = searchEverything(ctx.document, ctx.memory, args.query);
    if (hits.length === 0) return fail("no_results", `Nothing found about "${args.query}".`);
    return ok(`Found ${hits.length} result${hits.length === 1 ? "" : "s"} for "${args.query}".`, {}, { data: hits });
  },
};

export const recallCommitments: Capability<RecallCommitmentsArgs> = {
  id: "recall.commitments",
  domain: "recall",
  description: "What have I promised this person, across commitments and Earmark.",
  mutates: false,
  undoable: false,
  riskLevel: "low",
  argsSchema: {
    type: "object",
    properties: { personId: { type: "string", description: "Exact person id, only from a lookup result already in context — never invented from a spoken name." } },
    required: ["personId"],
  },
  requiresConfirmation: () => false,
  validate: (args) => (!args.personId ? "Say who." : null),
  execute: (args, ctx): CapabilityResult => {
    const hits = commitmentsFor(ctx.document, args.personId);
    if (hits.length === 0) return fail("no_results", "Nothing promised to them yet.");
    return ok(`${hits.length} promise${hits.length === 1 ? "" : "s"}.`, {}, { data: hits });
  },
};

export const recallCapabilities = [recallSearch, recallCommitments];
