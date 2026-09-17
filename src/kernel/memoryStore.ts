import type { PersonalMemoryFact } from "./types";

/**
 * Flow separates three memory categories so nothing durable is stored by
 * accident:
 *
 * - Ephemeral context: lives only on ConversationSession (session.ts) and is
 *   discarded when the conversation ends — the active topic, referents, the
 *   pending proposal.
 * - Session memory: recent results/actions kept for the current interaction,
 *   also on ConversationSession (recentResults, history of turns).
 * - Personal memory: durable, user-approved facts. Flow never promotes a
 *   sentence to personal memory on its own — only an explicit memory.store
 *   capability call (itself only triggered by an explicit "remember ..."
 *   intent from the planner) appends here. That call is inspectable: every
 *   fact records its source and creation time.
 */

let sequence = 0;
function nextId(): string {
  sequence += 1;
  return `memory-${sequence}`;
}

export function createPersonalMemoryFact(text: string, now: string, subjectPersonId?: string): PersonalMemoryFact {
  return { id: nextId(), text, subjectPersonId, createdAt: now, source: "explicit" };
}

export function searchPersonalMemory(facts: PersonalMemoryFact[], query: string): PersonalMemoryFact[] {
  const needle = query.toLowerCase();
  return facts.filter((fact) => fact.text.toLowerCase().includes(needle));
}

export function personalMemoryAbout(facts: PersonalMemoryFact[], personId: string): PersonalMemoryFact[] {
  return facts.filter((fact) => fact.subjectPersonId === personId);
}
