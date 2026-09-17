/**
 * Clarification is a system primitive, not a per-feature afterthought. When a
 * capability's arguments are incomplete or ambiguous, the kernel raises a
 * ClarificationRequest instead of guessing. The very next reply is accepted
 * as the answer — no wake word, no restarting the command.
 */
export interface ClarificationChoice {
  id: string;
  label: string;
  /** Argument patch that resolves the clarification if this choice is picked. */
  args: Record<string, unknown>;
}

export interface ClarificationRequest {
  id: string;
  question: string;
  choices: ClarificationChoice[];
  /** The plan step this clarification blocks, so a reply resumes exactly that step. */
  planStepId: string;
  /** The argument field the choices fill in, e.g. "startMinutes". Free-text answers patch this field directly. */
  field?: string;
  createdAt: string;
}

let sequence = 0;
function nextId(): string {
  sequence += 1;
  return `clarify-${sequence}`;
}

export function createClarification(question: string, planStepId: string, choices: ClarificationChoice[], now: string, field?: string): ClarificationRequest {
  return { id: nextId(), question, choices, planStepId, field, createdAt: now };
}

export type ClarificationAnswer =
  | { kind: "choice"; choice: ClarificationChoice }
  | { kind: "ordinal"; choice: ClarificationChoice }
  | { kind: "unresolved" };

/** Matches a reply against the open choices by id, label (substring, case-insensitive) or ordinal ("the first one"). */
export function matchClarificationReply(request: ClarificationRequest, reply: string): ClarificationAnswer {
  const normalized = reply.trim().toLowerCase();
  const byId = request.choices.find((choice) => choice.id === normalized);
  if (byId) return { kind: "choice", choice: byId };
  const byLabel = request.choices.find((choice) => normalized.includes(choice.label.toLowerCase()) || choice.label.toLowerCase().includes(normalized));
  if (byLabel) return { kind: "choice", choice: byLabel };
  const ordinals: Record<string, number> = { first: 0, second: 1, third: 2, last: request.choices.length - 1 };
  const ordinalMatch = Object.keys(ordinals).find((word) => normalized.includes(word));
  if (ordinalMatch !== undefined) {
    const choice = request.choices[ordinals[ordinalMatch]!];
    if (choice) return { kind: "ordinal", choice };
  }
  return { kind: "unresolved" };
}
