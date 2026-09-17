import type { LifeDocument, LifeEntityId, LifeEntityKind } from "../domain/life-model";
import type { PersonalMemoryFact } from "./types";

export interface SearchHit {
  entityId: LifeEntityId;
  entityKind: LifeEntityKind | "memory-fact";
  domain: "journal" | "memory" | "plans" | "people";
  title: string;
  snippet: string;
}

/**
 * Deterministic, substring-based search across every domain the kernel
 * currently understands. Not fuzzy, not ranked by ML — foundation for a
 * richer conceptual search (voice recordings, cross-referenced moments) once
 * Earmark lands (see earmark.ts).
 */
export function searchEverything(document: LifeDocument, memory: PersonalMemoryFact[], query: string): SearchHit[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const hits: SearchHit[] = [];
  for (const entry of document.studio.journalEntries) {
    if (entry.title.toLowerCase().includes(needle) || entry.text.toLowerCase().includes(needle)) {
      hits.push({ entityId: entry.id, entityKind: "journal-entry", domain: "journal", title: entry.title, snippet: entry.text.slice(0, 120) });
    }
  }
  for (const fact of memory) {
    if (fact.text.toLowerCase().includes(needle)) {
      hits.push({ entityId: fact.id, entityKind: "memory-fact", domain: "memory", title: fact.text, snippet: fact.text });
    }
  }
  for (const plan of document.plans) {
    if (plan.title.toLowerCase().includes(needle) || plan.outcome.toLowerCase().includes(needle)) {
      hits.push({ entityId: plan.id, entityKind: "plan", domain: "plans", title: plan.title, snippet: plan.outcome });
    }
  }
  for (const person of document.people) {
    if (person.name.toLowerCase().includes(needle) || person.aliases?.some((alias) => alias.toLowerCase().includes(needle))) {
      hits.push({ entityId: person.id, entityKind: "person", domain: "people", title: person.name, snippet: person.name });
    }
  }
  return hits;
}
