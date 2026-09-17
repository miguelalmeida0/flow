import type { RewardEvent, RewardLevel, RewardSuppressionReason } from "./reward-types";

export interface RewardSuppressionContext {
  hidden: boolean;
  level: RewardLevel;
  processedIds: ReadonlySet<string>;
  now: number;
  lastFingerprint?: string;
  lastAt?: number;
  activeCeremony: boolean;
  ceremonyFingerprintAt: ReadonlyMap<string, number>;
}

export function rewardFingerprint(event: RewardEvent) {
  if (event.type === "transaction-committed") return event.facts.map((fact) => `${fact.type}:${"eventId" in fact ? fact.eventId : "entityId" in fact ? fact.entityId : "outcomeId" in fact ? fact.outcomeId : "commitmentId" in fact ? fact.commitmentId : "focusId" in fact ? fact.focusId : "captureId" in fact ? fact.captureId : "instinctId" in fact ? fact.instinctId : "global"}`).sort().join("|");
  if (event.type === "world-opened") return `world:${event.to}`;
  if (event.type === "time-scope-changed") return `time:${event.to.kind}:${event.to.dateKey}`;
  return event.type;
}

export function suppressionReason(event: RewardEvent, context: RewardSuppressionContext): RewardSuppressionReason {
  if (context.hidden) return "hidden-tab";
  if (context.level === 0) return "level-zero";
  if (context.processedIds.has(event.id)) return "duplicate-transaction";
  const fingerprint = rewardFingerprint(event);
  if (context.level === 1 && context.lastFingerprint === fingerprint && context.lastAt !== undefined && context.now - context.lastAt < 750) return "coalesced";
  if (event.type === "transaction-committed" && event.facts.some(({ type }) => type === "event-styled") && context.lastFingerprint === fingerprint && context.lastAt !== undefined && context.now - context.lastAt < 900) return "coalesced";
  if (context.level === 3 && context.activeCeremony) return "ceremony-busy";
  if (context.level === 3 && context.now - (context.ceremonyFingerprintAt.get(fingerprint) ?? -Infinity) < 10_000) return "ceremony-cooldown";
  return "none";
}
