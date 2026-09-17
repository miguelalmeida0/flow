import type { MascotState, RewardEvent, RewardFact, RewardFamily, RewardLevel, RewardPreferences, RewardRecipe, SoundCue } from "./reward-types";

const motionDurations: Record<RewardLevel, number> = { 0: 0, 1: 180, 2: 560, 3: 1120 };
const reducedDurations: Record<RewardLevel, number> = { 0: 0, 1: 120, 2: 160, 3: 180 };

function primaryFact(event: RewardEvent): RewardFact | undefined {
  if (event.type !== "transaction-committed") return undefined;
  const order: RewardFact["type"][] = [
    "day-recovered", "focus-completed", "outcome-completed", "commitment-kept",
    "capture-routed", "outcome-step-scheduled", "commitment-protected", "breathing-room-created",
    "time-reclaimed", "event-deferred", "event-moved", "event-created", "event-resized",
    "time-protected", "time-released", "outcome-advanced", "instinct-acted-on", "event-styled",
  ];
  return [...event.facts].sort((left, right) => {
    const leftIndex = order.indexOf(left.type);
    const rightIndex = order.indexOf(right.type);
    return (leftIndex < 0 ? order.length : leftIndex) - (rightIndex < 0 ? order.length : rightIndex);
  })[0];
}

function familyFor(event: RewardEvent, fact?: RewardFact): RewardFamily {
  if (event.type === "history-restored") return "neutral";
  if (event.type === "world-opened" && event.source === "browser-back") return "none";
  if (event.type === "time-scope-changed" || event.type === "world-opened") return "tide";
  if (event.type === "voice-understood") return "bloom";
  if (!fact) return "none";
  if (["event-moved", "event-deferred", "time-reclaimed", "day-recovered", "capture-routed", "outcome-step-scheduled"].includes(fact.type)) return "tide";
  if (["time-protected", "time-released", "commitment-protected", "commitment-kept"].includes(fact.type)) return "anchor";
  return "bloom";
}

function mascotFor(level: RewardLevel, event: RewardEvent, fact?: RewardFact): MascotState {
  if (level === 0) return "resting";
  if (event.type === "uncertain") return "uncertain";
  if (event.type === "voice-understood") return "understood";
  if (fact?.type === "focus-started") return "focused";
  if (level === 3) return "big-win";
  if (level === 2 && ["day-recovered", "capture-routed", "outcome-advanced", "commitment-protected"].includes(fact?.type ?? "event-created")) return "small-win";
  if (level === 2) return "resolved";
  if (level === 1) return "understood";
  return "resting";
}

function soundFor(level: RewardLevel, event: RewardEvent, fact?: RewardFact): SoundCue | undefined {
  if (level === 0) return undefined;
  if (event.type === "history-restored") return "undo";
  if (event.type === "voice-understood") return "understood";
  if (level === 3) return "completed";
  if (fact && ["time-protected", "commitment-protected"].includes(fact.type)) return "protected";
  if (level === 2 && fact && ["event-moved", "event-created", "capture-routed", "outcome-step-scheduled"].includes(fact.type)) return "placed";
  if (level === 2) return "resolved";
  return undefined;
}

function labelFor(event: RewardEvent, fact?: RewardFact) {
  if (event.type === "history-restored") return event.direction === "undo" ? "Returned safely" : "Change restored";
  if (event.type === "time-scope-changed") return "The whole world moved together";
  if (event.type === "world-opened") return `Opened ${event.to}`;
  if (event.type === "voice-understood") return "Understood";
  if (!fact) return "Settled";
  if (fact.type === "day-recovered") return `${fact.reclaimedMinutes} minutes recovered`;
  if (fact.type === "focus-completed") return `${Math.max(1, Math.round(fact.elapsedMinutes))} minutes protected`;
  if (fact.type === "breathing-room-created") return `${fact.minutes} minutes of breathing room`;
  if (fact.type === "commitment-kept") return "Promise kept";
  if (fact.type === "outcome-completed") return "Outcome complete";
  return fact.type.replaceAll("-", " ");
}

export function recipeForReward(event: RewardEvent, level: RewardLevel, preferences: RewardPreferences, reducedMotion: boolean): RewardRecipe {
  const fact = primaryFact(event);
  const family = familyFor(event, fact);
  return {
    id: `${family}-${level}-${fact?.type ?? event.type}${reducedMotion ? "-reduced" : ""}`,
    family,
    durationMs: (reducedMotion ? reducedDurations : motionDurations)[level],
    ...(preferences.sound ? { sound: soundFor(level, event, fact) } : {}),
    mascot: preferences.mascot === "minimal" && level < 3 ? "resting" : mascotFor(level, event, fact),
    label: labelFor(event, fact),
  };
}

export function rewardPrimaryFact(event: RewardEvent) { return primaryFact(event); }
