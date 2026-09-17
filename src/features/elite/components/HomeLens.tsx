import type { ReactNode } from "react";
import type { WorldDestination } from "../../../domain/life-model";
import { WorldContinuitySurface } from "../../../shared/motion/WorldContinuitySurface";

export function HomeLens({ title, icon, children, className = "", testId, destination }: { title: string; icon: ReactNode; children: ReactNode; className?: string; testId: string; destination?: WorldDestination }) {
  return <section className={`relative min-h-[360px] rounded-[24px] border border-transparent p-5 lg:min-h-[430px] xl:min-h-[470px] ${className}`} data-testid={testId}>
    <WorldContinuitySurface className="rounded-[24px] border border-flow-border bg-flow-surface shadow-[0_1px_2px_rgba(35,43,55,0.025),0_12px_32px_rgba(35,43,55,0.045)]" destination={destination} />
    <div className="relative">
    <header className="flex items-center gap-3">
      <span className="text-[#4D91F5]">{icon}</span>
      <h2 className="font-serif text-[22px] font-normal tracking-[-0.025em] text-flow-ink">{title}</h2>
    </header>
    {children}
    </div>
  </section>;
}
