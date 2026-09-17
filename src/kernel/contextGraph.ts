import type { LifeDocument, LifeEntityId, LifeEntityKind } from "../domain/life-model";

/**
 * A lightweight personal context graph — not a graph database. It's a
 * read-only projection of LifeDocument's existing entities and links
 * (captures, plans, people, commitments, journal entries, memories, calendar
 * events) into a uniform node/edge shape so cross-domain features (search,
 * proactive checks, "who am I seeing this weekend") can walk relationships
 * without every feature re-deriving them independently.
 */
export interface GraphNode {
  id: LifeEntityId;
  kind: LifeEntityKind;
  label: string;
}

export interface GraphEdge {
  fromId: LifeEntityId;
  toId: LifeEntityId;
  type: string;
}

export interface ContextGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function buildContextGraph(document: LifeDocument): ContextGraph {
  const nodes: GraphNode[] = [
    ...document.people.map((person) => ({ id: person.id, kind: "person" as const, label: person.name })),
    ...document.plans.map((plan) => ({ id: plan.id, kind: "plan" as const, label: plan.title })),
    ...document.commitments.map((commitment) => ({ id: commitment.id, kind: "commitment" as const, label: commitment.title })),
    ...document.studio.journalEntries.map((entry) => ({ id: entry.id, kind: "journal-entry" as const, label: entry.title })),
    ...[...document.calendar.events, ...document.calendar.deferred].map((event) => ({ id: event.id, kind: "calendar-event" as const, label: event.title })),
  ];
  const edges: GraphEdge[] = [
    ...document.links.map((link) => ({ fromId: link.fromId, toId: link.toId, type: link.type })),
    ...document.commitments.map((commitment) => ({ fromId: commitment.personId, toId: commitment.id, type: "person-owns-commitment" })),
  ];
  return { nodes, edges };
}

export function neighbors(graph: ContextGraph, entityId: LifeEntityId): GraphNode[] {
  const neighborIds = new Set(graph.edges.filter((edge) => edge.fromId === entityId || edge.toId === entityId).map((edge) => (edge.fromId === entityId ? edge.toId : edge.fromId)));
  return graph.nodes.filter((node) => neighborIds.has(node.id));
}
