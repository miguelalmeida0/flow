import { useCallback, useEffect, useRef, useState } from "react";
import type { LifeRoute, PeopleView } from "../domain/life-model";
import { endMeasuredTransitions } from "../shared/motion/transitionDiagnostics";
import type { ActiveLifeTransition, TransitionBeat, TransitionBounds } from "./environment-types";
import { prefersReducedRewardMotion, readRewardPreferences } from "../core/rewards/reward-preferences";

type TransitionIntent = Omit<ActiveLifeTransition, "beat" | "sourceBounds" | "destinationBounds" | "reducedMotion"> & { peopleView?: PeopleView };

function boundsFor(element?: Element): TransitionBounds | undefined {
  if (!element) return undefined;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return undefined;
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

function entityElement(id: string) {
  return [...document.querySelectorAll<HTMLElement>("[data-life-entity-id]")]
    .find((element) => element.dataset.lifeEntityId === id);
}

export function useLifeTransition(navigate: (route: LifeRoute, planId?: string, replace?: boolean, peopleView?: PeopleView) => void) {
  const [transition, setTransition] = useState<ActiveLifeTransition>();
  const timers = useRef<number[]>([]);

  const cancelTransition = useCallback(() => {
    // The animation performance window ends at the interruption request.
    // History restoration and route rendering happen after the motion has
    // been synchronously stopped and are measured by their own UI tests.
    endMeasuredTransitions();
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
    setTransition(undefined);
  }, []);

  useEffect(() => {
    const visibility = () => { if (document.hidden) cancelTransition(); };
    document.addEventListener("visibilitychange", visibility);
    return () => { document.removeEventListener("visibilitychange", visibility); cancelTransition(); };
  }, [cancelTransition]);

  const beginTransition = useCallback((value: TransitionIntent, destinationRoute: LifeRoute, planId?: string) => {
    cancelTransition();
    const sourceBounds = boundsFor(entityElement(value.sourceId));
    const routeAnchor = [...document.querySelectorAll<HTMLElement>("[data-life-route]")]
      .find((element) => element.dataset.lifeRoute === destinationRoute && element.offsetParent !== null);
    const destinationBounds = boundsFor(routeAnchor) ?? {
      left: Math.max(24, window.innerWidth / 2 - Math.min(210, (window.innerWidth - 48) / 2)),
      top: 116,
      width: Math.min(420, window.innerWidth - 48),
      height: 96,
    };
    const reducedMotion = prefersReducedRewardMotion(readRewardPreferences());
    const base = { ...value, sourceBounds, destinationBounds, reducedMotion };
    setTransition({ ...base, beat: "focus-source" });
    const beats: [TransitionBeat, number][] = reducedMotion
      ? [["destination-shell", 60], ["resolve-content", 130], ["settled", 190]]
      : [["release-tide", 140], ["transfer-path", 300], ["destination-shell", 700], ["resolve-content", 820], ["settled", 1000]];
    beats.forEach(([beat, delay]) => timers.current.push(window.setTimeout(() => {
      if (document.hidden) return cancelTransition();
      if (beat === "destination-shell") navigate(destinationRoute, planId, false, value.peopleView);
      setTransition({ ...base, beat });
      if (beat === "settled") {
        // Reduced motion removes travel, not causality. Keep the settled card
        // on screen long enough to be perceived (and to survive a busy main
        // thread) while still clearing the entire transition within 500 ms.
        timers.current.push(window.setTimeout(() => setTransition(undefined), reducedMotion ? 30 : 220));
      }
    }, delay)));
  }, [cancelTransition, navigate]);

  return { transition, beginTransition, cancelTransition };
}
