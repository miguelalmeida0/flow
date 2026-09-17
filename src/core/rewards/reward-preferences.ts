import { DEFAULT_REWARD_PREFERENCES, type RewardPreferences } from "./reward-types";

export const REWARD_PREFERENCES_KEY = "flow:reward-preferences:v1";
export const REWARD_PREFERENCES_EVENT = "flow:reward-preferences";

export function readRewardPreferences(): RewardPreferences {
  if (typeof window === "undefined") return DEFAULT_REWARD_PREFERENCES;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(REWARD_PREFERENCES_KEY) ?? "null") as Partial<RewardPreferences> | null;
    return {
      motion: parsed?.motion === "full" || parsed?.motion === "reduced" ? parsed.motion : "system",
      sound: parsed?.sound === true,
      mascot: parsed?.mascot === "minimal" ? "minimal" : "helpful",
    };
  } catch {
    return DEFAULT_REWARD_PREFERENCES;
  }
}

export function writeRewardPreferences(preferences: RewardPreferences) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(REWARD_PREFERENCES_KEY, JSON.stringify(preferences));
  window.dispatchEvent(new CustomEvent<RewardPreferences>(REWARD_PREFERENCES_EVENT, { detail: preferences }));
}

export function prefersReducedRewardMotion(preferences: RewardPreferences) {
  if (preferences.motion === "reduced") return true;
  if (preferences.motion === "full") return false;
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
