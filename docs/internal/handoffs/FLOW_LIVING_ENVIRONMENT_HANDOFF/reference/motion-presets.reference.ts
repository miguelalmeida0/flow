import type { Transition } from "motion/react";

export const motionPresets = {
  micro: {
    duration: 0.14,
    ease: [0.2, 0.8, 0.2, 1],
  } satisfies Transition,
  quiet: {
    type: "spring",
    stiffness: 280,
    damping: 34,
    mass: 0.8,
  } satisfies Transition,
  float: {
    type: "spring",
    stiffness: 190,
    damping: 28,
    mass: 0.95,
  } satisfies Transition,
  tide: {
    type: "spring",
    stiffness: 145,
    damping: 25,
    mass: 1.05,
  } satisfies Transition,
  anchor: {
    type: "spring",
    stiffness: 330,
    damping: 36,
    mass: 0.85,
  } satisfies Transition,
  settle: {
    type: "spring",
    stiffness: 220,
    damping: 32,
    mass: 0.9,
  } satisfies Transition,
} as const;

export const motionDurations = {
  focusMs: 140,
  propertyEditMs: 340,
  localMoveMs: 520,
  crossSpaceMinMs: 780,
  crossSpaceMaxMs: 1250,
  tideReflowMaxMs: 1400,
} as const;
