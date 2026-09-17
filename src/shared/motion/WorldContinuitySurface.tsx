import { motion } from "motion/react";
import type { WorldDestination } from "../../domain/life-model";
import { useReducedMotionPreference } from "./useReducedMotionPreference";

/** Only the paper changes shape between a tall lens and a shallow page header. */
export function WorldContinuitySurface({ destination, className = "", layoutDependency }: { destination?: WorldDestination; className?: string; layoutDependency?: string }) {
  const reduced = useReducedMotionPreference();
  return <motion.div
    aria-hidden="true"
    className={`pointer-events-none absolute inset-0 ${className}`}
    data-world-continuity-surface={destination}
    layoutDependency={layoutDependency}
    layoutId={!reduced && destination ? `space-${destination}` : undefined}
  />;
}
