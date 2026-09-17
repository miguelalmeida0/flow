import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useFlowEnvironment } from "../../app/FlowEnvironmentProvider";
import { WorldPageShell, warmButton, warmCard, warmQuietButton } from "../../shared/design-system/WorldPageShell";
import { buildEliteHomeModel } from "../elite/eliteViewModel";
import { formatTime } from "../day-planner/time";

export function FocusSpace() {
  const { document, temporalScope, currentTime, runCommand, navigate } = useFlowEnvironment();
  const model = buildEliteHomeModel(document, temporalScope, currentTime);
  const active = document.focus.active;
  const [clock, setClock] = useState(() => Date.now());
  const completed = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!active) return;
    const tick = () => setClock(Date.now());
    tick();
    const interval = window.setInterval(tick, 1_000);
    return () => window.clearInterval(interval);
  }, [active]);
  const elapsedSeconds = active ? Math.max(0, Math.floor((clock - new Date(active.startedAt).getTime()) / 1_000)) : 0;
  const remainingSeconds = active ? Math.max(0, active.durationMinutes * 60 - elapsedSeconds) : model.focusWindow.minutes * 60;
  useEffect(() => {
    if (!active || remainingSeconds > 0 || completed.current === active.id) return;
    completed.current = active.id;
    runCommand("Stop focus", "quick");
  }, [active, remainingSeconds, runCommand]);
  const minutes = active ? Math.ceil(remainingSeconds / 60) : model.focusWindow.minutes;
  // Completion is durable product state, not a transient reward projection.
  // Keep it visible after React scheduling, reload, or a finished ceremony;
  // the RewardDirector still decides whether the current stop merits Level 3.
  const lastCompleted = !active ? document.focus.lastCompleted : undefined;
  const completedMinutes = lastCompleted
    ? Math.max(1, Math.min(lastCompleted.durationMinutes, Math.floor((new Date(lastCompleted.completedAt ?? lastCompleted.startedAt).getTime() - new Date(lastCompleted.startedAt).getTime()) / 60_000)))
    : 0;
  const circumference = Math.PI * 236;
  const progress = active ? Math.max(0, remainingSeconds / (active.durationMinutes * 60)) : Math.min(0.94, Math.max(0.08, minutes / 120));
  return <WorldPageShell destination="focus" eyebrow="A quiet room inside your day" title="Focus" description={active ? "Your session is in motion. Flow keeps the surrounding anchors visible." : "Use a real open window. Flow will never pretend busy time is free."} testId="focus-space">
    {lastCompleted && <motion.section className="mb-6 flex items-center justify-between rounded-[22px] border border-flow-green/30 bg-flow-green-soft px-6 py-4" data-life-entity-id={lastCompleted.id} layout>
      <span><span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-flow-green-strong">Focus complete</span><strong className="mt-1 block font-serif text-2xl text-flow-ink">{completedMinutes} minutes protected.</strong></span>
      <span aria-hidden className="grid size-10 place-items-center rounded-full bg-white text-flow-green-strong">✓</span>
    </motion.section>}
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)]">
      <motion.div className={`${warmCard} flex min-h-[430px] flex-col items-center justify-center p-8 text-center`} layout>
        <div className="relative grid size-[250px] place-items-center"><svg aria-hidden className="absolute inset-0 -rotate-90" viewBox="0 0 250 250"><circle cx="125" cy="125" fill="none" r="118" stroke="#ECE7E2" strokeWidth="8"/><motion.circle animate={{ strokeDashoffset: circumference * (1 - progress) }} cx="125" cy="125" fill="none" initial={{ strokeDashoffset: circumference }} r="118" stroke="#4D91F5" strokeDasharray={circumference} strokeLinecap="round" strokeWidth="8" transition={{ duration: .7 }}/></svg><div><p className="font-serif text-6xl tracking-[-0.06em]">{active ? `${String(Math.floor(remainingSeconds / 60)).padStart(2, "0")}:${String(remainingSeconds % 60).padStart(2, "0")}` : minutes}</p><p className="mt-2 text-sm text-flow-secondary">{active ? `${active.durationMinutes} minutes running` : "minutes available"}</p></div></div>
        <div className="mt-8 flex flex-wrap justify-center gap-2"><button data-action-id="focus.start-stop" className={warmButton} data-flow-action="Start or stop Focus" onClick={() => runCommand(active ? "Stop focus" : `Give me ${Math.min(25, Math.max(5, minutes))} minutes`, "quick")} type="button">{active ? "End session" : "Start 25 minutes"}</button>{active && <button data-action-id="focus.extend" className={warmQuietButton} data-flow-action="Extend Focus" onClick={() => runCommand("Add 10 minutes", "quick")} type="button">Add 10 minutes</button>}<button data-action-id="focus.see-day" className={warmQuietButton} data-flow-action="See the day" onClick={() => navigate("today")} type="button">See the day</button></div>
      </motion.div>
      <aside className={`${warmCard} p-7`}><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4D91F5]">Window</p><h3 className="mt-4 font-serif text-3xl">{formatTime(active?.startMinutes ?? model.focusWindow.start)} – {formatTime((active?.startMinutes ?? model.focusWindow.start) + (active?.durationMinutes ?? minutes))}</h3><p className="mt-3 text-sm leading-6 text-flow-secondary">{model.focusWindow.sourceTitle ? `Available in ${model.focusWindow.sourceTitle}, until ${formatTime(model.focusWindow.end)}.` : model.focusWindow.anchorTitle ? `Before ${model.focusWindow.anchorTitle}.` : "Before your day boundary."}</p><div className="my-7 h-px bg-flow-border"/><p className="text-sm font-medium">Your calendar stays intact</p><p className="mt-2 text-sm leading-6 text-flow-secondary">Focus can use an existing flexible work block without moving your appointments. Finish early whenever you need to; Flow keeps track of the time you actually used.</p></aside>
    </div>
  </WorldPageShell>;
}
