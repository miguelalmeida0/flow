import type { RewardEvent, RewardFact, RewardLevel } from "./reward-types";

const ceremony = new Set<RewardFact["type"]>(["day-recovered", "outcome-completed", "commitment-kept"]);
const meaningful = new Set<RewardFact["type"]>([
  "event-created", "event-moved", "event-resized", "event-deferred", "time-protected", "time-released",
  "time-reclaimed", "breathing-room-created", "focus-started", "capture-routed", "outcome-created",
  "outcome-step-scheduled", "outcome-advanced", "commitment-created", "commitment-protected", "instinct-acted-on",
]);

export function rewardLevelForFact(fact: RewardFact): RewardLevel {
  if (fact.type === "focus-completed") return fact.meaningful ? 3 : 2;
  if (ceremony.has(fact.type)) return 3;
  if (meaningful.has(fact.type)) return 2;
  return 1;
}

export function rewardLevelForEvent(event: RewardEvent): RewardLevel {
  if (event.type === "uncertain") return 0;
  if (event.type === "history-restored") return event.direction === "redo" ? 2 : 1;
  if (event.type === "world-opened") return event.source === "browser-back" ? 0 : 1;
  if (event.type === "time-scope-changed" || event.type === "voice-understood") return 1;
  return event.facts.reduce<RewardLevel>((highest, fact) => Math.max(highest, rewardLevelForFact(fact)) as RewardLevel, 0);
}
