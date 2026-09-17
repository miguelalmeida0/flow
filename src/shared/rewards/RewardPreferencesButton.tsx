import { useCallback, useEffect, useRef, useState } from "react";
import { useFlowEnvironment } from "../../app/FlowEnvironmentProvider";
import type { MascotPreference, MotionPreference } from "../../core/rewards/reward-types";

const option = "min-h-10 rounded-full border border-flow-border px-3 text-xs text-flow-secondary transition hover:bg-flow-page aria-checked:border-flow-blue aria-checked:bg-flow-blue-soft aria-checked:text-[#245D9C]";

export function RewardPreferencesButton({ compact = false, open: controlledOpen, onOpenChange }: { compact?: boolean; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const { rewardPreferences, dispatchPresentation, commandPresentation } = useFlowEnvironment();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = useCallback((next: boolean | ((current: boolean) => boolean)) => {
    const resolved = typeof next === "function" ? next(open) : next;
    setInternalOpen(resolved);
    onOpenChange?.(resolved);
  }, [onOpenChange, open]);
  const root = useRef<HTMLDivElement>(null);
  const preferencesRef = useRef(rewardPreferences);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [setOpen]);
  useEffect(() => { preferencesRef.current = rewardPreferences; }, [rewardPreferences]);
  const update = (patch: Partial<typeof rewardPreferences>, fromGesture = false) => {
    const next = { ...preferencesRef.current, ...patch };
    preferencesRef.current = next;
    dispatchPresentation({ type: "sensory-preference", patch }, fromGesture);
  };
  const setMotion = (motion: MotionPreference) => update({ motion });
  const setMascot = (mascot: MascotPreference) => update({ mascot });
  return <div className="relative" ref={root}>
    <button data-action-id="settings.open" aria-expanded={open} aria-label="Reward and motion settings" className={`${compact ? "min-h-10 px-3" : "min-h-11 px-4"} rounded-full text-xs text-flow-secondary hover:bg-flow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-blue`} data-flow-action="Reward and motion settings" onClick={() => setOpen((value) => !value)} type="button">Sensory</button>
    {open && <div className="absolute bottom-full right-0 z-[70] mb-3 w-[290px] rounded-[22px] border border-flow-border bg-flow-elevated p-5 text-left shadow-[0_18px_54px_rgba(35,43,55,0.13)]" data-reward-settings>
      <p className="font-serif text-xl text-flow-ink">Flow response</p>
      <p className="mt-1 text-xs leading-5 text-flow-secondary">Motion and sound are confirmation, never decoration.</p>
      {commandPresentation.soundAwaitingGesture && <p className="mt-3 text-xs text-flow-secondary" data-sensory-continuation="awaiting-user-gesture">Use the sound control below to consent and request browser audio. Sound has not been enabled yet.</p>}
      <fieldset className="mt-5"><legend className="text-[10px] font-semibold uppercase tracking-[0.16em] text-flow-muted">Motion</legend><div className="mt-2 flex flex-wrap gap-1" role="radiogroup">{(["system", "full", "reduced"] as const).map((value) => <button data-action-id="settings.motion" aria-checked={rewardPreferences.motion === value} className={option} data-flow-action="Motion preference" key={value} onClick={() => setMotion(value)} role="radio" type="button">{value[0]!.toUpperCase() + value.slice(1)}</button>)}</div></fieldset>
      <fieldset className="mt-4"><legend className="text-[10px] font-semibold uppercase tracking-[0.16em] text-flow-muted">Sound</legend><button data-action-id="settings.sound" aria-pressed={rewardPreferences.sound} className={`${option} mt-2`} data-flow-action="Sound preference" onClick={() => update({ sound: !preferencesRef.current.sound }, !preferencesRef.current.sound)} type="button">{rewardPreferences.sound ? "On · consented" : "Off"}</button></fieldset>
      <fieldset className="mt-4"><legend className="text-[10px] font-semibold uppercase tracking-[0.16em] text-flow-muted">Mascot</legend><div className="mt-2 flex gap-1" role="radiogroup">{(["helpful", "minimal"] as const).map((value) => <button data-action-id="settings.mascot" aria-checked={rewardPreferences.mascot === value} className={option} data-flow-action="Mascot preference" key={value} onClick={() => setMascot(value)} role="radio" type="button">{value[0]!.toUpperCase() + value.slice(1)}</button>)}</div></fieldset>
    </div>}
  </div>;
}
