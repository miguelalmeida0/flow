import type {
  ConversationEntityReference,
  LifeContext,
  LifeDocument,
  LifeEntityKind,
  LifeRoute,
  LifeTransactionRecord,
} from "../domain/life-model";
import { allCalendarEvents } from "../domain/life-calendar-world";

export const CONTEXT_FRESHNESS_MS = 120_000;

export function entityKind(document: LifeDocument, id: string): LifeEntityKind | undefined {
  if (allCalendarEvents(document).some((item) => item.id === id)) return "calendar-event";
  if (document.captures.some((item) => item.id === id)) return "capture";
  if (document.plans.some((item) => item.id === id)) return "plan";
  if (document.steps.some((item) => item.id === id)) return "plan-step";
  if (document.people.some((item) => item.id === id)) return "person";
  if (document.commitments.some((item) => item.id === id)) return "commitment";
  if (document.studio.journalEntries.some((item) => item.id === id)) return "journal-entry";
  if (document.studio.atmospherePresets.some((item) => item.id === id)) return "atmosphere";
  if (document.studio.memories.some((item) => item.id === id)) return "memory";
  if (document.studio.rituals.some((item) => item.id === id)) return "ritual";
  return undefined;
}

export function referenceFor(document: LifeDocument, id: string, at: number, transactionId?: string): ConversationEntityReference | undefined {
  const kind = entityKind(document, id);
  return kind ? { id, kind, at, ...(transactionId ? { transactionId } : {}) } : undefined;
}

export function isFresh(reference: ConversationEntityReference | undefined, nowMs: number) {
  return Boolean(reference && nowMs - reference.at <= CONTEXT_FRESHNESS_MS);
}

export function freshReference(context: LifeContext, kinds: LifeEntityKind[], explicitId?: string) {
  const candidates = [context.selected, context.lastReferenced, context.lastChanged, context.lastCreated, ...(context.lastTargets ?? [])];
  if (explicitId) return candidates.find((item) => item?.id === explicitId && kinds.includes(item.kind));
  const nowMs = context.nowMs ?? Date.now();
  return candidates.find((item) => item && kinds.includes(item.kind) && isFresh(item, nowMs));
}

export function routeAccepts(route: LifeRoute, kind: LifeEntityKind) {
  if (route === "calendar" || route === "today" || route === "focus" || route === "weather-outfit" || route === "good-to-know" || route === "now") return kind === "calendar-event";
  if (route === "inbox" || route === "capture") return kind === "capture";
  if (route === "plans" || route === "outcomes") return kind === "plan" || kind === "plan-step";
  if (route === "people") return kind === "person" || kind === "commitment";
  if (route === "journal") return kind === "journal-entry";
  if (route === "atmosphere") return kind === "atmosphere";
  if (route === "memories") return kind === "memory" || kind === "journal-entry";
  return false;
}

export function navigateConversation(context: LifeContext, route: LifeRoute): LifeContext {
  // A projection change is presentation, not a topic change. Keep the bounded
  // conversational references so “make it red” and “schedule it” work after
  // voice navigation. Components may focus a route-compatible entity, but the
  // global interpreter remains able to resolve the prior subject.
  const compatible = context.selected && routeAccepts(route, context.selected.kind) ? context.selected : undefined;
  return {
    ...context,
    previousRoute: context.route,
    route,
    focusedEntityId: compatible?.id,
    selected: context.selected,
    lastReferenced: context.lastReferenced,
    lastChanged: context.lastChanged,
    lastCreated: context.lastCreated,
    lastCreatedEntityId: context.lastCreated?.id,
    pendingIntent: undefined,
    captureMode: false,
    epoch: (context.epoch ?? 0) + 1,
  };
}

export function clearGenericConversation(context: LifeContext): LifeContext {
  return { ...context, focusedEntityId: undefined, selected: undefined, lastReferenced: undefined, lastChanged: undefined, lastCreated: undefined, lastTargets: [], pendingIntent: undefined, captureMode: false, epoch: (context.epoch ?? 0) + 1 };
}

export function restoreConversationFromTransaction(context: LifeContext, transaction: LifeTransactionRecord | undefined, document: LifeDocument, nowMs: number): LifeContext {
  const primary = transaction?.primaryEntity;
  if (!primary || !entityKind(document, primary.id)) return clearGenericConversation(context);
  const restored = { ...primary, at: nowMs };
  return { ...context, focusedEntityId: restored.id, selected: restored, lastReferenced: restored, lastChanged: restored, captureMode: false, epoch: (context.epoch ?? 0) + 1 };
}
