export const flowMotion = {
  micro: { duration: 0.14, ease: [0.2, 0.8, 0.2, 1] as const },
  quiet: { type: "spring" as const, stiffness: 280, damping: 34, mass: 0.8 },
  float: { type: "spring" as const, stiffness: 190, damping: 28, mass: 0.95 },
  tide: { type: "spring" as const, stiffness: 145, damping: 25, mass: 1.05 },
  settle: { type: "spring" as const, stiffness: 220, damping: 32, mass: 0.9 },
  tideTravel: { type: "spring" as const, stiffness: 150, damping: 26, mass: 0.98 },
  anchorConfirm: { type: "spring" as const, stiffness: 310, damping: 30, mass: 0.72 },
  bloomReveal: { duration: 0.56, ease: [0.16, 1, 0.3, 1] as const },
  ceremonySettle: { duration: 1.12, times: [0, 0.2, 0.6, 1] as number[], ease: [0.16, 1, 0.3, 1] as const },
  reducedConfirm: { duration: 0.16, ease: "linear" as const },
} as const;
