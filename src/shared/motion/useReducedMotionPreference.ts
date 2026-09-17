import { useEffect, useState } from "react";
import { prefersReducedRewardMotion, readRewardPreferences, REWARD_PREFERENCES_EVENT } from "../../core/rewards/reward-preferences";

const query = "(prefers-reduced-motion: reduce)";

export function useReducedMotionPreference() {
  const [reduced, setReduced] = useState(() => prefersReducedRewardMotion(readRewardPreferences()));
  useEffect(() => {
    const media = window.matchMedia?.(query);
    const update = () => setReduced(prefersReducedRewardMotion(readRewardPreferences()));
    update(); media?.addEventListener("change", update);
    window.addEventListener(REWARD_PREFERENCES_EVENT, update);
    window.addEventListener("storage", update);
    return () => { media?.removeEventListener("change", update); window.removeEventListener(REWARD_PREFERENCES_EVENT, update); window.removeEventListener("storage", update); };
  }, []);
  return reduced;
}
