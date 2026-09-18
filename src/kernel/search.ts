import type { LifeDocument, LifeEntityId, LifeEntityKind } from "../domain/life-model";
import type { PersonalMemoryFact } from "./types";
import type { DerivedItem } from "./earmark";

export type SearchDomain = "journal" | "memory" | "plans" | "people" | "commitments" | "calendar" | "earmark";

/**
 * Every result must be able to point back to exactly where it came from.
 * `deepLink` uses a small synthetic `"<domain>/<id>"` convention (e.g.
 * `"journal/entry-1"`, `"calendar/event-9"`) that a presentation layer maps
 * to real navigation — it is never itself rendered as a URL. Nothing here is
 * ever synthesized without a hit id it can be traced back to; if a query
 * can't be answered from indexed data, `searchEverything` returns no hit for
 * it rather than fabricating one.
 */
export interface SearchHit {
  id: string;
  domain: SearchDomain;
  entityType: LifeEntityKind | "memory-fact" | "earmark-item";
  title: string;
  snippet: string;
  sourceId: LifeEntityId;
  sourceDate?: string;
  deepLink: string;
  audioTimestampStart?: number;
  audioTimestampEnd?: number;
  /** Whether the timestamp came from a measured segment boundary or an
   * interpolated estimate — never claim "exact" for an estimated one.
   * Present only when an audio timestamp is present. */
  timestampConfidence?: "exact" | "estimated";
  personIds?: LifeEntityId[];
  relevance: number;
}

function snippetAround(text: string, needle: string, radius = 60): string {
  const index = text.toLowerCase().indexOf(needle);
  if (index < 0) return text.slice(0, 120);
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + needle.length + radius);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

function scoreMatch(haystack: string, needle: string): number {
  const lower = haystack.toLowerCase();
  if (lower === needle) return 1;
  const wordBoundary = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  if (wordBoundary.test(lower)) return 0.85;
  return lower.includes(needle) ? 0.6 : 0;
}

/**
 * Deterministic, substring-based search across every domain the kernel
 * understands, with source provenance on every hit. Not fuzzy, not ranked by
 * ML — relevance is a small deterministic score (exact > word match >
 * substring), sorted descending, so results are reproducible and testable.
 */
export function searchEverything(document: LifeDocument, memory: PersonalMemoryFact[], query: string): SearchHit[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const hits: SearchHit[] = [];

  for (const entry of document.studio.journalEntries) {
    let bestSegmentHit: SearchHit | undefined;
    for (const segment of entry.transcriptSegments) {
      const relevance = scoreMatch(segment.text, needle);
      if (relevance === 0) continue;
      const hit: SearchHit = {
        id: `journal-segment-${entry.id}-${segment.id}`,
        domain: "journal",
        entityType: "journal-entry",
        title: entry.title,
        snippet: snippetAround(segment.text, needle),
        sourceId: entry.id,
        sourceDate: entry.createdAt,
        deepLink: `journal/${entry.id}`,
        audioTimestampStart: entry.audioAssetId ? segment.startMs : undefined,
        audioTimestampEnd: entry.audioAssetId ? segment.endMs : undefined,
        timestampConfidence: entry.audioAssetId ? (segment.alignment === "segment-estimate" ? "estimated" : "exact") : undefined,
        relevance,
      };
      if (!bestSegmentHit || relevance > bestSegmentHit.relevance) bestSegmentHit = hit;
    }
    if (bestSegmentHit) {
      hits.push(bestSegmentHit);
      continue;
    }
    const relevance = Math.max(scoreMatch(entry.title, needle), scoreMatch(entry.text, needle) * 0.8);
    if (relevance > 0) {
      hits.push({
        id: `journal-${entry.id}`,
        domain: "journal",
        entityType: "journal-entry",
        title: entry.title,
        snippet: snippetAround(entry.text, needle),
        sourceId: entry.id,
        sourceDate: entry.createdAt,
        deepLink: `journal/${entry.id}`,
        relevance,
      });
    }
  }

  for (const fact of memory) {
    const relevance = scoreMatch(fact.text, needle);
    if (relevance === 0) continue;
    hits.push({
      id: `memory-${fact.id}`,
      domain: "memory",
      entityType: "memory-fact",
      title: fact.text,
      snippet: fact.text,
      sourceId: fact.id,
      sourceDate: fact.createdAt,
      deepLink: `memory/${fact.id}`,
      personIds: fact.subjectPersonId ? [fact.subjectPersonId] : undefined,
      relevance,
    });
  }

  for (const plan of document.plans) {
    const relevance = Math.max(scoreMatch(plan.title, needle), scoreMatch(plan.outcome, needle) * 0.8);
    if (relevance > 0) {
      hits.push({
        id: `plan-${plan.id}`,
        domain: "plans",
        entityType: "plan",
        title: plan.title,
        snippet: plan.outcome,
        sourceId: plan.id,
        sourceDate: plan.createdAt,
        deepLink: `plans/${plan.id}`,
        relevance,
      });
    }
  }

  for (const person of document.people) {
    const relevance = Math.max(scoreMatch(person.name, needle), ...(person.aliases ?? []).map((alias) => scoreMatch(alias, needle)));
    if (relevance > 0) {
      hits.push({
        id: `person-${person.id}`,
        domain: "people",
        entityType: "person",
        title: person.name,
        snippet: person.name,
        sourceId: person.id,
        sourceDate: person.createdAt,
        deepLink: `people/${person.id}`,
        personIds: [person.id],
        relevance,
      });
    }
  }

  for (const commitment of document.commitments) {
    const relevance = scoreMatch(commitment.title, needle);
    if (relevance > 0) {
      hits.push({
        id: `commitment-${commitment.id}`,
        domain: "commitments",
        entityType: "commitment",
        title: commitment.title,
        snippet: commitment.title,
        sourceId: commitment.id,
        sourceDate: commitment.createdAt,
        deepLink: `people/${commitment.personId}`,
        personIds: [commitment.personId],
        relevance,
      });
    }
  }

  for (const plan of Object.values(document.calendars)) {
    for (const event of plan.events) {
      const relevance = scoreMatch(event.title, needle);
      if (relevance === 0) continue;
      hits.push({
        id: `calendar-${event.id}`,
        domain: "calendar",
        entityType: "calendar-event",
        title: event.title,
        snippet: `${event.title} · ${plan.dateKey}`,
        sourceId: event.id,
        sourceDate: plan.dateKey,
        deepLink: `calendar/${event.id}`,
        personIds: event.participantIds,
        relevance,
      });
    }
  }

  for (const item of document.earmarkItems ?? []) {
    const relevance = scoreMatch(item.text, needle) || scoreMatch(item.sourceMoment.transcript, needle) * 0.8;
    if (relevance === 0) continue;
    hits.push({
      id: `earmark-hit-${item.id}`,
      domain: "earmark",
      entityType: "earmark-item",
      title: item.text,
      snippet: snippetAround(item.sourceMoment.transcript, needle),
      sourceId: item.id,
      sourceDate: item.createdAt,
      deepLink: `earmark/${item.sourceMoment.recording.recordingId}`,
      audioTimestampStart: item.sourceMoment.recording.atMs,
      audioTimestampEnd: item.sourceMoment.recording.endAtMs,
      timestampConfidence: item.timestampConfidence,
      personIds: item.personIds,
      relevance,
    });
  }

  return hits.sort((a, b) => b.relevance - a.relevance);
}

/** What did I promise `personId`? Commitments plus Earmark commitment items linked to them. */
export function commitmentsFor(document: LifeDocument, personId: LifeEntityId): SearchHit[] {
  const fromCommitments = document.commitments
    .filter((commitment) => commitment.personId === personId && commitment.direction === "i-owe")
    .map<SearchHit>((commitment) => ({
      id: `commitment-${commitment.id}`,
      domain: "commitments",
      entityType: "commitment",
      title: commitment.title,
      snippet: commitment.title,
      sourceId: commitment.id,
      sourceDate: commitment.createdAt,
      deepLink: `people/${personId}`,
      personIds: [personId],
      relevance: 1,
    }));
  const fromEarmark = (document.earmarkItems ?? [])
    .filter((item: DerivedItem) => item.kind === "commitment" && item.personIds?.includes(personId))
    .map<SearchHit>((item) => ({
      id: `earmark-hit-${item.id}`,
      domain: "earmark",
      entityType: "earmark-item",
      title: item.text,
      snippet: item.sourceMoment.transcript,
      sourceId: item.id,
      sourceDate: item.createdAt,
      deepLink: `earmark/${item.sourceMoment.recording.recordingId}`,
      audioTimestampStart: item.sourceMoment.recording.atMs,
      audioTimestampEnd: item.sourceMoment.recording.endAtMs,
      timestampConfidence: item.timestampConfidence,
      personIds: item.personIds,
      relevance: 1,
    }));
  return [...fromCommitments, ...fromEarmark];
}
