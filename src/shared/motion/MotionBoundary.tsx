import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { flowMotion } from "./motion-presets";
import { useReducedMotionPreference } from "./useReducedMotionPreference";

/** One accessibility-aware motion policy for every Living projection. */
export function MotionBoundary({ children }: { children: ReactNode }) {
  const reduced = useReducedMotionPreference();
  return <MotionConfig reducedMotion={reduced ? "always" : "never"} transition={flowMotion.quiet}>{children}</MotionConfig>;
}
