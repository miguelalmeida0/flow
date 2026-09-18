import type { ConversationSession, EntityReference } from "./session";
import type { SearchHit } from "./search";

const HIT_DOMAIN_TO_ENTITY_KIND: Partial<Record<SearchHit["domain"], EntityReference["kind"]>> = {
  journal: "journal-entry",
  plans: "plan",
  people: "person",
  commitments: "commitment",
  calendar: "calendar-event",
};

/**
 * A universal recall result normalized into the one referent shape. A hit
 * that maps to a real domain entity (journal/plans/people/commitments/
 * calendar) keeps that LifeEntityKind, so it round-trips through legacy's
 * own context too (see kernelReferentBridge.ts); memory-fact and Earmark
 * hits have no LifeEntityId, so they stay "search-hit" — real, openable by
 * the kernel, just invisible to legacy's pronoun resolution.
 */
export function searchHitToReference(hit: SearchHit): EntityReference {
  return {
    id: hit.sourceId,
    kind: HIT_DOMAIN_TO_ENTITY_KIND[hit.domain] ?? "search-hit",
    label: hit.title,
    domain: hit.domain,
    personIds: hit.personIds,
    audioTimestamp: hit.audioTimestampStart != null
      ? { recordingId: hit.deepLink, atMs: hit.audioTimestampStart, endAtMs: hit.audioTimestampEnd, confidence: hit.timestampConfidence }
      : undefined,
  };
}

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

const ORDINAL_WORDS: Record<string, number> = { first: 0, second: 1, third: 2, fourth: 3, fifth: 4 };

/**
 * Record a fresh ordered result set (a recall search, a desktop file
 * listing) as the active referents: the top result becomes
 * lastMentioned/selected (and person, if it's a person) exactly like any
 * other capability result via rememberResult, and the full list becomes
 * lastSearchResults for ordinal follow-ups ("open the second one").
 */
export function rememberSearchResults(session: ConversationSession, results: EntityReference[], atMs: number): ConversationSession {
  const stamped = results.map((result) => ({ ...result, at: result.at ?? atMs }));
  const top = stamped[0];
  const referents = { ...session.referents, lastSearchResults: stamped };
  if (top) {
    referents.lastMentioned = top;
    referents.selected = top;
    if (top.kind === "person") referents.person = top;
  }
  return { ...session, referents };
}

/**
 * Resolve "the second one" / "the one with Sofia" / "the one before that"
 * against the last recorded result set. Bare "it"/"that"/"her" go through
 * resolveReferentWord instead (lastMentioned/selected/person) — this is
 * strictly for list-position and content phrases, not pronouns, so it
 * doesn't duplicate that resolution.
 */
export function resolveOrdinal(session: ConversationSession, fragment: string): EntityReference | undefined {
  const results = session.referents.lastSearchResults;
  if (!results || results.length === 0) return undefined;
  const needle = fragment.trim().toLowerCase();
  if (/^(?:the )?(?:one before that|previous one)$/.test(needle)) return results[1];
  const ordinalMatch = needle.match(/^the (\w+) one$/);
  if (ordinalMatch && ordinalMatch[1]! in ORDINAL_WORDS) return results[ORDINAL_WORDS[ordinalMatch[1]!]!];
  const withMatch = needle.match(/^the one (?:with|about|from) (.+)$/);
  if (withMatch) {
    const target = withMatch[1]!;
    return results.find((result) => result.label?.toLowerCase().includes(target) || result.personIds?.some((id) => id.toLowerCase().includes(target)));
  }
  return undefined;
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
