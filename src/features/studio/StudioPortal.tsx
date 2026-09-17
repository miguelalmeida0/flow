import { motion } from "motion/react";
import { useFlowEnvironment } from "../../app/FlowEnvironmentProvider";
import { useReducedMotionPreference } from "../../shared/motion/useReducedMotionPreference";
import { useStudioRuntime } from "./StudioRuntimeProvider";

export function StudioPortal() {
  const environment = useFlowEnvironment();
  const runtime = useStudioRuntime();
  const reducedMotion = useReducedMotionPreference();
  const latestEntry = [...environment.document.studio.journalEntries].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  const latestMemory = [...environment.document.studio.memories].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  const active = environment.document.studio.activeAtmosphere;
  const activePreset = active && environment.document.studio.atmospherePresets.find(({ id }) => id === active.presetId);

  return <motion.section
    animate={{ opacity: 1, y: 0 }}
    className="mt-5 overflow-hidden rounded-[28px] border border-[#DDD6CE] bg-[#171B18] text-[#F4EFE5] shadow-[0_18px_42px_rgba(34,39,36,0.08)]"
    data-testid="studio-portal"
    initial={reducedMotion ? false : { opacity: 0, y: 8 }}
    transition={{ duration: reducedMotion ? 0.1 : 0.36 }}
  >
    <div className="grid md:grid-cols-[1.35fr_1fr_1fr]">
      <button data-action-id="home.domain-card" className="group min-h-32 border-b border-[#303731] px-6 py-5 text-left transition hover:bg-[#202620] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#7EA7A4] md:border-b-0 md:border-r" data-flow-action="Journal" onClick={() => environment.runCommand("Journal", "quick")} type="button">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7EA7A4]">Journal</span>
        <strong className="mt-3 block font-serif text-2xl font-normal">{latestEntry?.title ?? "There is room to talk."}</strong>
        <span className="mt-2 block text-sm text-[#A7AAA4]">{latestEntry ? `${latestEntry.bookmarks.length} marked ${latestEntry.bookmarks.length === 1 ? "moment" : "moments"} · ${latestEntry.status}` : "Begin with your voice or the page."}</span>
      </button>
      <button data-action-id="home.domain-card" className="min-h-32 border-b border-[#303731] px-6 py-5 text-left transition hover:bg-[#202620] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#7EA7A4] md:border-b-0 md:border-r" data-flow-action="Atmosphere" onClick={() => {
        if (activePreset) environment.navigate("atmosphere");
        else { void runtime.unlockAtmosphere(); environment.runCommand("Play Sunday evening", "quick"); }
      }} type="button">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#D4A65D]">Atmosphere</span>
        <strong className="mt-3 block font-serif text-2xl font-normal">{activePreset?.name ?? "Sunday evening"}</strong>
        <span className="mt-2 block text-sm text-[#A7AAA4]">{active?.playing ? "Playing through Flow" : "Shape a room from sound."}</span>
      </button>
      <button data-action-id="home.domain-card" className="min-h-32 px-6 py-5 text-left transition hover:bg-[#202620] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#7EA7A4]" data-flow-action="Memories" onClick={() => environment.runCommand("Memories", "quick")} type="button">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#C67C65]">Memories</span>
        <strong className="mt-3 block font-serif text-2xl font-normal">{latestMemory?.title ?? "Make something personal."}</strong>
        <span className="mt-2 block text-sm text-[#A7AAA4]">Only your words, photographs, marks, and voice.</span>
      </button>
    </div>
  </motion.section>;
}
