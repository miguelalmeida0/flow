import { AnimatePresence, motion } from "motion/react";
import { useFlowEnvironment } from "../../app/FlowEnvironmentProvider";
import type { StudioSurfaceId } from "../../domain/studio-model";
import { useReducedMotionPreference } from "../../shared/motion/useReducedMotionPreference";
import { useStudioRuntime } from "./StudioRuntimeProvider";

const labels: Record<StudioSurfaceId, string> = { journal: "Journal", atmosphere: "Atmosphere", memories: "Memories" };

function compactDescription(surface: StudioSurfaceId, environment: ReturnType<typeof useFlowEnvironment>) {
  if (surface === "journal") {
    const entry = [...environment.document.studio.journalEntries].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
    return entry ? `${entry.title} · ${entry.bookmarks.length} marks` : "A quiet page is ready.";
  }
  if (surface === "memories") {
    const count = environment.document.studio.memories.length;
    return count ? `${count} personal ${count === 1 ? "artifact" : "artifacts"}` : "Nothing fabricated. Start in Journal.";
  }
  const active = environment.document.studio.activeAtmosphere;
  const preset = active && environment.document.studio.atmospherePresets.find(({ id }) => id === active.presetId);
  return preset ? `${preset.name} · ${active.playing ? "playing" : "paused"}` : "Sunday evening is ready.";
}

export function StudioSecondarySurface() {
  const environment = useFlowEnvironment();
  const runtime = useStudioRuntime();
  const reducedMotion = useReducedMotionPreference();
  const secondary = environment.document.studio.workspace.secondary;
  const visible = secondary && secondary !== environment.route && !environment.document.studio.workspace.minimized.includes(secondary);
  function putAway(surface: StudioSurfaceId) {
    environment.runCommand(`Put ${labels[surface]} away`, "quick");
  }
  return <AnimatePresence>{visible && <motion.aside
    animate={{ opacity: 1, x: 0 }}
    aria-label={`${labels[secondary]} beside the current space`}
    className="relative mx-auto mb-2 flex w-full max-w-[1680px] flex-wrap items-center justify-between gap-2 rounded-2xl border border-flow-border bg-flow-elevated px-3 py-2 text-flow-ink"
    data-secondary-surface={secondary}
    data-flow-region="secondary"
    exit={{ opacity: 0, x: 32 }}
    initial={reducedMotion ? false : { opacity: 0, x: 32 }}
    transition={{ duration: reducedMotion ? 0.1 : 0.34, ease: [0.22, 1, 0.36, 1] }}
  >
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <button data-action-id="workspace.surface-open" className="min-w-0 truncate text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-blue" data-flow-action="Open secondary studio surface" onClick={() => environment.navigate(secondary)} type="button"><strong className="font-semibold">{labels[secondary]}</strong><span className="ml-2 text-flow-secondary">{compactDescription(secondary, environment)}</span></button>
      <button data-action-id="workspace.surface-put-away" aria-label={`Put ${labels[secondary]} away`} className="grid size-11 shrink-0 place-items-center rounded-full border border-[#39423B] text-[#A7AAA4] hover:bg-[#242A25] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7EA7A4]" data-flow-action="Put away studio surface" onClick={() => putAway(secondary)} type="button">×</button>
    </div>
    {secondary === "atmosphere" && <div className="flex gap-2"><button data-action-id="atmosphere.transport" className="min-h-10 rounded-full bg-flow-neutral-soft px-4 text-xs font-semibold text-flow-ink" data-flow-action="Atmosphere playback" onClick={() => {
      void runtime.unlockAtmosphere();
      const phrase = environment.document.studio.activeAtmosphere?.playing ? "Pause atmosphere" : environment.document.studio.activeAtmosphere ? "Resume atmosphere" : "Play Sunday evening";
      environment.runCommand(phrase, "quick");
    }} type="button">{environment.document.studio.activeAtmosphere?.playing ? "Pause" : environment.document.studio.activeAtmosphere ? "Resume" : "Play Sunday evening"}</button><button data-action-id="atmosphere.less-rain" className="hidden min-h-10 rounded-full border border-flow-border px-4 text-xs sm:block" data-flow-action="Less rain" onClick={() => environment.runCommand("Less rain", "quick")} type="button">Less rain</button></div>}
  </motion.aside>}</AnimatePresence>;
}

export function StudioRestingShelf() {
  const environment = useFlowEnvironment();
  const reducedMotion = useReducedMotionPreference();
  const minimized = environment.document.studio.workspace.minimized;
  if (!minimized.length) return null;
  return <nav aria-label="Put-away studio surfaces" className="relative flex flex-wrap gap-2 rounded-full border border-flow-border bg-flow-page p-1.5">
    {minimized.map((surface) => <motion.button data-action-id="workspace.surface-restore" initial={reducedMotion ? false : { opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="min-h-11 rounded-full px-4 text-xs font-semibold text-[#52606D] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-blue" data-flow-action="Restore studio surface" key={surface} onClick={() => {
      environment.runCommand(`Restore ${labels[surface]}`, "quick");
    }} type="button">Restore {labels[surface]}</motion.button>)}
  </nav>;
}
