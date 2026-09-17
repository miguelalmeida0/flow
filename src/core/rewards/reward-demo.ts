import { clearLifeStorage, loadLifeSnapshot } from "../../domain/life-storage";
import type { LifeSnapshot } from "../../domain/life-model";

export const REWARD_DEMO_SESSION_KEY = "flow:visual-reward-demo:v1";

/**
 * Development-only reset into Flow's ordinary deterministic seed. The demo
 * deliberately uses the production document, command runner, scheduler and
 * reward boundary; this helper never injects a reward or edits the DOM.
 */
export function loadVisualRewardDemo(dateKey: string): LifeSnapshot {
  if (!import.meta.env.DEV || typeof window === "undefined") return loadLifeSnapshot(dateKey);
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("rewardDemo");
  if (mode !== "1" && mode !== "reset") return loadLifeSnapshot(dateKey);
  const shouldReset = mode === "reset" || sessionStorage.getItem(REWARD_DEMO_SESSION_KEY) !== dateKey;
  if (shouldReset) {
    clearLifeStorage();
    sessionStorage.setItem(REWARD_DEMO_SESSION_KEY, dateKey);
  }
  if (mode === "reset") {
    params.set("rewardDemo", "1");
    const search = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${search ? `?${search}` : ""}`);
  }
  return loadLifeSnapshot(dateKey);
}
