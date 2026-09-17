import type { Commitment, LifeDocument } from "../../domain/life-model";

export type CommitmentLens = "all" | "i-owe" | "waiting-on" | "next-conversation" | "completed";
export interface CommitmentViewState { lens: CommitmentLens; search: string }
export type CommitmentViewIntent = { type: "commitment-view"; patch: Partial<CommitmentViewState> };
export const initialCommitmentView: CommitmentViewState = { lens: "all", search: "" };
export const commitmentLenses = [["all", "Open"], ["i-owe", "I owe"], ["waiting-on", "Waiting on"], ["next-conversation", "Next conversation"], ["completed", "Completed"]] as const;

/** Same collection predicate for rendering and canonical view feedback. This
 * deliberately includes deferred items, unlike the active Now query. */
export function visibleCommitments(document: Pick<LifeDocument, "commitments" | "people">, view: CommitmentViewState): Commitment[] {
  return document.commitments.filter((commitment) => {
    const direction = commitment.direction === "mine" ? "i-owe" : commitment.direction === "theirs" ? "waiting-on" : commitment.direction;
    if (view.lens === "completed" ? commitment.status !== "completed" : commitment.status === "completed") return false;
    if (view.lens !== "all" && view.lens !== "completed" && direction !== view.lens) return false;
    const person = document.people.find(({ id }) => id === commitment.personId)?.name ?? "";
    return `${person} ${commitment.title}`.toLowerCase().includes(view.search.toLowerCase());
  });
}

/** Pointer parameter framing only; no component interprets language. */
export const commitmentViewCommands = {
  filter: (lens: CommitmentLens) => lens === "i-owe" ? "Show commitments I owe" : `Show ${lens === "all" ? "open" : lens} commitments`,
  search: (search: string) => search ? `Search commitments for ${JSON.stringify(search)}` : "Clear the commitment search",
};
