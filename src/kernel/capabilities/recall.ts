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
  requiresConfirmation: () => false,
  validate: (args) => (!args.personId ? "Say who." : null),
  execute: (args, ctx): CapabilityResult => {
    const hits = commitmentsFor(ctx.document, args.personId);
    if (hits.length === 0) return fail("no_results", "Nothing promised to them yet.");
    return ok(`${hits.length} promise${hits.length === 1 ? "" : "s"}.`, {}, { data: hits });
  },
};

export const recallCapabilities = [recallSearch, recallCommitments];
