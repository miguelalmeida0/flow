import type { ReactNode } from "react";
import { motion } from "motion/react";
import type { WorldDestination } from "../../domain/life-model";
import { useReducedMotionPreference } from "../motion/useReducedMotionPreference";
import { WorldContinuitySurface } from "../motion/WorldContinuitySurface";

export function WorldPageShell({ eyebrow, title, description, action, children, testId, destination }: { eyebrow: string; title: string; description: string; action?: ReactNode; children: ReactNode; testId: string; destination?: WorldDestination }) {
  const reducedMotion = useReducedMotionPreference();
  return <section className="mx-auto min-h-full w-full max-w-[1680px] px-4 pb-8 pt-5 text-flow-ink sm:px-7 sm:pb-10 sm:pt-7 lg:px-10 xl:px-12" data-testid={testId}>
    <motion.header className="relative flex flex-col gap-5 overflow-hidden border-b border-[#E7E0D9] pb-8 sm:flex-row sm:items-end sm:justify-between" data-world-heading layout={reducedMotion ? false : "position"}>
      <WorldContinuitySurface className="bg-flow-page" destination={destination} />
      <div className="relative max-w-2xl"><p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#4D91F5]">{eyebrow}</p><h2 className="mt-2 font-serif text-[clamp(2.4rem,5vw,4.8rem)] font-normal leading-none tracking-[-0.05em]">{title}</h2><p className="mt-4 max-w-xl text-sm leading-6 text-flow-secondary sm:text-base">{description}</p></div>
      {action && <div className="relative w-full sm:w-auto sm:max-w-[48%]">{action}</div>}
    </motion.header>
    <div className="pt-6" data-page-task="body">{children}</div>
  </section>;
}

export const warmField = "min-h-12 w-full rounded-2xl border border-[#E2DAD2] bg-white px-4 text-sm text-flow-ink outline-none placeholder:text-flow-muted focus:border-flow-blue focus:ring-2 focus:ring-flow-blue/15";
export const warmCard = "rounded-[24px] border border-[#E8E1DA] bg-flow-elevated shadow-[0_14px_38px_rgba(35,43,55,0.05)]";
export const warmButton = "inline-flex min-h-11 items-center justify-center rounded-full bg-flow-ink px-5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#26384F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-blue";
export const warmQuietButton = "inline-flex min-h-11 items-center justify-center rounded-full border border-[#DED7D0] bg-white px-4 text-sm text-[#52606D] transition hover:bg-flow-neutral-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-blue";
