import type { PreflightAlternative, PreflightResult } from "./types";
import type { PlanStep } from "./planner";

/**
 * A Proposal is Flow's way of saying "here's what I'd do" before doing it.
 * Critical rule enforced by the kernel (see kernel.ts): "yes" approves ONLY
 * the session's current activeProposal. Any new proposal — including one
 * generated because the user corrected themselves ("actually move it to
 * 9") — replaces the previous one outright. A stale proposal can never be
 * approved after it has been replaced.
 */
export type ProposalStatus = "pending" | "approved" | "invalidated" | "expired";

export interface Proposal {
  id: string;
  originatingPlanId: string;
  sourceUtterance: string;
  /** The step still awaiting confirmation/resolution. */
  step: PlanStep;
  consequences: PreflightResult;
  status: ProposalStatus;
  createdAt: string;
}

let sequence = 0;
function nextId(): string {
  sequence += 1;
  return `proposal-${sequence}`;
}

export function createProposal(originatingPlanId: string, sourceUtterance: string, step: PlanStep, consequences: PreflightResult, now: string): Proposal {
  return { id: nextId(), originatingPlanId, sourceUtterance, step, consequences, status: "pending", createdAt: now };
}

export function invalidateProposal(proposal: Proposal): Proposal {
  return { ...proposal, status: "invalidated" };
}

export function approveProposal(proposal: Proposal): Proposal {
  return { ...proposal, status: "approved" };
}

const APPROVAL_WORDS = new Set(["yes", "yeah", "yep", "yup", "sure", "do it", "confirm", "go ahead", "please do", "ok", "okay"]);
const REJECTION_WORDS = new Set(["no", "nah", "nope", "don't"]);
const CANCEL_WORDS = new Set(["cancel", "cancel that", "never mind", "nevermind", "stop", "wait", "forget it"]);
const UNDO_WORDS = new Set(["undo", "undo that", "put it back"]);
const REDO_WORDS = new Set(["redo", "redo that"]);
const WHAT_CHANGED_WORDS = new Set(["what changed", "what's changed", "what changed?", "what did you change", "what did that change"]);

/** Matches a free-text reply ("8:30 works", "the 9 PM one") against a
 * pending proposal's offered alternatives — the proposal-side counterpart to
 * clarification.ts's matchClarificationReply, so accepting an alternative
 * doesn't require the caller to already know to call chooseAlternative()
 * with an exact label. */
export function matchProposalAlternative(proposal: Proposal, reply: string): PreflightAlternative | undefined {
  const normalized = reply.trim().toLowerCase();
  return proposal.consequences.alternatives.find((alternative) => {
    const label = alternative.label.toLowerCase();
    // Match the full label ("8:30 pm") or just its time portion ("8:30"),
    // since a natural reply like "8:30 works" or "let's do 8:30" never
    // repeats the AM/PM suffix the label carries for display.
    const timeOnly = label.replace(/\s*(am|pm)$/, "").trim();
    return normalized.includes(label) || label.includes(normalized) || (timeOnly.length > 0 && normalized.includes(timeOnly));
  });
}

export type ReplyIntent = "approve" | "reject" | "cancel" | "undo" | "redo" | "whatChanged" | "unknown";

/** Classifies a small, closed set of discourse markers ("yes"/"no"/"cancel"/
 * "undo"/"redo"/"what changed"). This is deliberately not a general command
 * parser — it only recognizes the fixed vocabulary conversation control
 * requires. */
export function classifyReply(reply: string): ReplyIntent {
  const normalized = reply.trim().toLowerCase().replace(/[.!]+$/, "");
  if (UNDO_WORDS.has(normalized)) return "undo";
  if (REDO_WORDS.has(normalized)) return "redo";
  if (CANCEL_WORDS.has(normalized)) return "cancel";
  if (APPROVAL_WORDS.has(normalized)) return "approve";
  if (REJECTION_WORDS.has(normalized)) return "reject";
  if (WHAT_CHANGED_WORDS.has(normalized)) return "whatChanged";
  return "unknown";
}
