import { useAnimate } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { useReducedMotionPreference } from "../../shared/motion/useReducedMotionPreference";
import { HOME_SCENE_DURATION_MS } from "./home-motion";

/** Date travel owns this child; entrance and entity layout keep their owners. */
export function HomeDateScene({ scopeKey, active, children }: { scopeKey: string; active: boolean; children: ReactNode }) {
  const previous = useRef(scopeKey);
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const reduced = useReducedMotionPreference();
  useEffect(() => {
    const changed = previous.current !== scopeKey;
    previous.current = scopeKey;
    const element = scope.current;
    if (!element) return;
    if (!changed || !active || reduced || document.hidden) {
      void animate(element, { opacity: 1, transform: "translateY(0px)" }, { duration: 0 });
      return;
    }
    // State is already persisted. This bounded projection never delays a
    // command, remounts its cards, or owns any scheduling/history operation.
    const animation = animate(element, { opacity: [0.78, 1], transform: ["translateY(12px)", "translateY(0px)"] }, { duration: HOME_SCENE_DURATION_MS / 1000, ease: [0.22, 1, 0.36, 1] });
    return () => animation.stop();
  }, [scopeKey, active, reduced, animate, scope]);
  useEffect(() => {
    const hide = () => { if (document.hidden && scope.current) void animate(scope.current, { opacity: 1, transform: "translateY(0px)" }, { duration: 0 }); };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, [animate, scope]);
  return <div ref={scope} data-home-date-scene data-home-date-key={scopeKey}>{children}</div>;
}
