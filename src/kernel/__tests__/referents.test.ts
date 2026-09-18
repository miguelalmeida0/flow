import { describe, expect, it } from "vitest";
import { resolveReferentWord, resolveArgReferents, rememberSearchResults, resolveOrdinal, searchHitToReference } from "../referents";
import { createSession } from "../session";
import type { SearchHit } from "../search";
import type { EntityReference } from "../session";

const AT = "2026-09-17T09:00:00.000Z";
const NOW = new Date(AT).getTime();

describe("resolveReferentWord", () => {
  it("resolves it/that to lastMentioned, this to selected, her/him/them to person", () => {
    const session = createSession();
    session.referents.lastMentioned = { id: "j1", kind: "journal-entry" };
    session.referents.selected = { id: "p1", kind: "plan" };
    session.referents.person = { id: "sofia", kind: "person" };
    expect(resolveReferentWord(session, "it")?.id).toBe("j1");
    expect(resolveReferentWord(session, "that")?.id).toBe("j1");
    expect(resolveReferentWord(session, "this")?.id).toBe("p1");
    expect(resolveReferentWord(session, "her")?.id).toBe("sofia");
    expect(resolveReferentWord(session, "him")?.id).toBe("sofia");
    expect(resolveReferentWord(session, "them")?.id).toBe("sofia");
  });

  it("returns undefined for a non-pronoun word and for an unset referent", () => {
    const session = createSession();
    expect(resolveReferentWord(session, "Sofia")).toBeUndefined();
    expect(resolveReferentWord(session, "it")).toBeUndefined();
  });
});

describe("rememberSearchResults", () => {
  it("stores the full ordered list and promotes the top result to lastMentioned/selected", () => {
    const session = createSession();
    const refs: EntityReference[] = [
      { id: "a", kind: "journal-entry", label: "First" },
      { id: "b", kind: "journal-entry", label: "Second" },
    ];
    const next = rememberSearchResults(session, refs, NOW);
    expect(next.referents.lastSearchResults?.map((r) => r.id)).toEqual(["a", "b"]);
    expect(next.referents.lastMentioned?.id).toBe("a");
    expect(next.referents.selected?.id).toBe("a");
  });

  it("also promotes to `person` when the top result is a person", () => {
    const session = createSession();
    const next = rememberSearchResults(session, [{ id: "sofia", kind: "person", label: "Sofia" }], NOW);
    expect(next.referents.person?.id).toBe("sofia");
  });

  it("stamps every result with the given timestamp unless it already carries one", () => {
    const session = createSession();
    const next = rememberSearchResults(session, [{ id: "a", kind: "journal-entry" }], NOW);
    expect(next.referents.lastSearchResults?.[0]?.at).toBe(NOW);
  });
});

describe("resolveOrdinal", () => {
  const refs: EntityReference[] = [
    { id: "a", kind: "journal-entry", label: "Trip planning" },
    { id: "b", kind: "person", label: "Sofia", personIds: ["sofia"] },
    { id: "c", kind: "calendar-event", label: "Dinner" },
  ];

  it("resolves 'the second one' / 'the third one' by list position", () => {
    const session = rememberSearchResults(createSession(), refs, NOW);
    expect(resolveOrdinal(session, "the second one")?.id).toBe("b");
    expect(resolveOrdinal(session, "the third one")?.id).toBe("c");
  });

  it("resolves 'the one before that' to the second entry (one position older than the current top)", () => {
    const session = rememberSearchResults(createSession(), refs, NOW);
    expect(resolveOrdinal(session, "the one before that")?.id).toBe("b");
    expect(resolveOrdinal(session, "the previous one")?.id).toBe("b");
  });

  it("resolves 'the one with X' by label or personIds content", () => {
    const session = rememberSearchResults(createSession(), refs, NOW);
    expect(resolveOrdinal(session, "the one with sofia")?.id).toBe("b");
  });

  it("returns undefined rather than guessing when there is no result set or no match", () => {
    expect(resolveOrdinal(createSession(), "the second one")).toBeUndefined();
    const session = rememberSearchResults(createSession(), refs, NOW);
    expect(resolveOrdinal(session, "the tenth one")).toBeUndefined();
    expect(resolveOrdinal(session, "the one with daniel")).toBeUndefined();
  });
});

describe("resolveArgReferents", () => {
  it("resolves a $ref placeholder against the session and returns null if unresolved", () => {
    const session = createSession();
    session.referents.lastMentioned = { id: "j1", kind: "journal-entry" };
    expect(resolveArgReferents(session, { entryId: { $ref: "lastMentioned" } })).toEqual({ entryId: "j1" });
    expect(resolveArgReferents(session, { personId: { $ref: "person" } })).toBeNull();
  });
});

describe("searchHitToReference", () => {
  function hit(overrides: Partial<SearchHit>): SearchHit {
    return { id: "h1", domain: "journal", entityType: "journal-entry", title: "Trip planning", snippet: "", sourceId: "j1", deepLink: "journal/j1", relevance: 1, ...overrides };
  }

  it("maps a journal/plans/people/commitments/calendar hit to its real LifeEntityKind", () => {
    expect(searchHitToReference(hit({ domain: "journal" })).kind).toBe("journal-entry");
    expect(searchHitToReference(hit({ domain: "plans" })).kind).toBe("plan");
    expect(searchHitToReference(hit({ domain: "people" })).kind).toBe("person");
    expect(searchHitToReference(hit({ domain: "commitments" })).kind).toBe("commitment");
    expect(searchHitToReference(hit({ domain: "calendar" })).kind).toBe("calendar-event");
  });

  it("maps a memory/earmark hit (no LifeEntityId) to search-hit — real and openable by the kernel, invisible to legacy", () => {
    expect(searchHitToReference(hit({ domain: "memory" })).kind).toBe("search-hit");
    expect(searchHitToReference(hit({ domain: "earmark" })).kind).toBe("search-hit");
  });

  it("carries audio timestamp and confidence through when present", () => {
    const ref = searchHitToReference(hit({ domain: "earmark", audioTimestampStart: 4200, audioTimestampEnd: 9800, timestampConfidence: "estimated" }));
    expect(ref.audioTimestamp).toEqual({ recordingId: "journal/j1", atMs: 4200, endAtMs: 9800, confidence: "estimated" });
  });

  it("has no audioTimestamp when the hit has none", () => {
    expect(searchHitToReference(hit({})).audioTimestamp).toBeUndefined();
  });
});
