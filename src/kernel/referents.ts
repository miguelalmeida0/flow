import type { ConversationSession, EntityReference } from "./session";

/**
 * Referent resolution turns "it"/"that"/"her"/"the first one" into a concrete
 * entity id using conversation state, never by guessing destructively — if a
 * referent can't be resolved the kernel raises a clarification instead of
 * acting on a guess (see kernel.ts).
 */
export type ReferentKey = "selected" | "lastMentioned" | "lastCreated" | "person";

const WORD_TO_KEY: Record<string, ReferentKey> = {
  it: "lastMentioned",
  that: "lastMentioned",
  "that one": "lastMentioned",
  this: "selected",
  her: "person",
  him: "person",
  them: "person",
};

export function resolveReferentWord(session: ConversationSession, word: string): EntityReference | undefined {
  const key = WORD_TO_KEY[word.trim().toLowerCase()];
  return key ? session.referents[key] : undefined;
}

/** A step's args may contain `{ $ref: "lastMentioned" }` placeholders in
 * place of a concrete id — the planner emits these when an utterance used a
 * pronoun/ellipsis rather than naming an entity. Returns null if any
 * placeholder can't be resolved, so the caller can raise a clarification. */
export function resolveArgReferents(session: ConversationSession, args: Record<string, unknown>): Record<string, unknown> | null {
  const resolved: Record<string, unknown> = { ...args };
  for (const [key, value] of Object.entries(args)) {
    if (value && typeof value === "object" && "$ref" in value) {
      const refKey = (value as { $ref: ReferentKey }).$ref;
      const reference = session.referents[refKey];
      if (!reference) return null;
      resolved[key] = reference.id;
    }
  }
  return resolved;
}
