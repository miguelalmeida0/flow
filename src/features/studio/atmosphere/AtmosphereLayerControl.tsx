import { motion } from "motion/react";
import { useEffect, useState } from "react";
import type { AtmosphereLayer } from "../../../domain/studio-model";
import { useReducedMotionPreference } from "../../../shared/motion/useReducedMotionPreference";
import { adjustAtmosphereValue } from "../atmosphereValues";

function LayerShape({ layer }: { layer: AtmosphereLayer }) {
  const reducedMotion = useReducedMotionPreference();
  if (layer.id === "rain") return <div aria-hidden className="relative h-24 overflow-hidden rounded-[18px] bg-[#17201E]">{Array.from({ length: 26 }, (_, index) => <motion.span animate={reducedMotion ? { opacity: 0.55 } : { y: [-(index % 3) * 9, 94], opacity: [0, 0.8, 0] }} className="absolute h-3 w-px rounded-full bg-[#7EA7A4]" key={index} style={{ left: `${5 + (index * 37 % 90)}%`, top: `${reducedMotion ? 12 + (index * 17 % 65) : -15 + (index * 17 % 35)}%` }} transition={reducedMotion ? { duration: 0.1 } : { duration: Math.max(0.7, 1.8 / layer.rate), delay: (index % 8) * 0.11, repeat: Infinity }} />)}</div>;
  if (layer.id === "tone") {
    const path = `M 0 52 C 70 ${30 - layer.character * 15}, 115 ${75 + layer.volume * 10}, 180 48 S 270 ${25 + layer.character * 25}, 320 52`;
    // Motion's SVG attribute interpolator can briefly write `undefined` while
    // a path is replaced during rapid range-input commits. Keep geometry a
    // valid native attribute at every frame and animate the replacement's
    // presence instead; the curve still responds immediately and calmly.
    return <svg aria-hidden className="h-24 w-full rounded-[18px] bg-[#E8DFD1]" viewBox="0 0 320 96"><motion.path animate={{ opacity: 1 }} d={path} fill="none" initial={{ opacity: reducedMotion ? 1 : 0.72 }} key={path} stroke="#C67C65" strokeLinecap="round" strokeWidth={5 + layer.volume * 10} transition={{ duration: reducedMotion ? 0.1 : 0.22 }} /></svg>;
  }
  if (layer.id === "pulse") return <div aria-hidden className="grid h-24 place-items-center rounded-[18px] bg-[#EFE6D6]"><motion.span animate={reducedMotion ? { opacity: 0.72 } : { scale: [0.78, 1, 0.78], opacity: [0.45, 0.95, 0.45] }} className="block size-12 rounded-full border-[8px] border-[#D4A65D]" transition={reducedMotion ? { duration: 0.1 } : { duration: Math.max(0.5, 1.6 / layer.rate), repeat: Infinity }} /></div>;
  return <div aria-hidden className="relative h-24 overflow-hidden rounded-[18px] bg-[#1D2420]"><motion.div animate={reducedMotion ? { opacity: 0.38 } : { x: [-20, 20, -20], scaleX: [1, 1.15, 1] }} className="absolute inset-5 rounded-[50%] bg-[#A9B89D]/35 blur-xl" transition={reducedMotion ? { duration: 0.1 } : { duration: 6 / layer.rate, repeat: Infinity }} /><div className="absolute inset-x-8 bottom-6 h-px bg-[#A9B89D]/70" /></div>;
}

export function AtmosphereLayerControl({ layer, onCommit }: { layer: AtmosphereLayer; onCommit: (patch: { volume?: number; rate?: number; enabled?: boolean }) => void }) {
  const [volume, setVolume] = useState(layer.volume);
  const [rate, setRate] = useState(layer.rate);
  useEffect(() => { setVolume(layer.volume); setRate(layer.rate); }, [layer.rate, layer.volume]);
  return <section className={`rounded-[24px] border border-[#D8D0C8] bg-[#F5EFE5] p-4 transition ${layer.enabled ? "" : "opacity-55"}`} data-atmosphere-layer={layer.id}>
    <div className="flex items-center justify-between"><div><p className="font-serif text-xl">{layer.label}</p><p className="mt-1 text-xs text-[#756F66]">{Math.round(volume * 100)}% presence</p></div><button data-action-id="atmosphere.layer-enabled" aria-pressed={layer.enabled} className="min-h-11 rounded-full border border-[#D8D0C8] bg-white px-4 text-xs font-semibold text-[#52606D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7EA7A4]" data-flow-action="Atmosphere layer toggle" onClick={() => onCommit({ enabled: !layer.enabled })} type="button">{layer.enabled ? "In the room" : "Bring back"}</button></div>
    <div className="mt-4"><LayerShape layer={{ ...layer, volume, rate }} /></div>
    <label className="mt-4 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#756F66]" htmlFor={`${layer.id}-volume`}>Presence</label>
    <div className="mt-2 flex items-center gap-2"><button data-action-id="atmosphere.layer-step-volume" aria-label={`Lower ${layer.label}`} className="grid size-11 place-items-center rounded-full border border-[#D8D0C8] bg-white" data-flow-action="Atmosphere layer sliders" onClick={() => { const value = adjustAtmosphereValue(volume, "volume", "decrease"); setVolume(value); onCommit({ volume: value }); }} type="button">−</button><input data-action-id="atmosphere.layer-presence" className="h-11 min-w-0 flex-1 accent-[#7EA7A4]" data-flow-action="Atmosphere layer sliders" id={`${layer.id}-volume`} max="1" min="0" onChange={(event) => setVolume(Number(event.target.value))} onKeyUp={() => onCommit({ volume })} onPointerUp={() => onCommit({ volume })} step="0.01" type="range" value={volume}/><button data-action-id="atmosphere.layer-step-volume" aria-label={`Raise ${layer.label}`} className="grid size-11 place-items-center rounded-full border border-[#D8D0C8] bg-white" data-flow-action="Atmosphere layer sliders" onClick={() => { const value = adjustAtmosphereValue(volume, "volume", "increase"); setVolume(value); onCommit({ volume: value }); }} type="button">+</button></div>
    {layer.id === "pulse" && <><label className="mt-3 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#756F66]" htmlFor={`${layer.id}-rate`}>Pace</label><input data-action-id="atmosphere.pulse-pace" className="h-11 w-full accent-[#D4A65D]" data-flow-action="Atmosphere layer sliders" id={`${layer.id}-rate`} max="2" min="0.2" onChange={(event) => setRate(Number(event.target.value))} onKeyUp={() => onCommit({ rate })} onPointerUp={() => onCommit({ rate })} step="0.05" type="range" value={rate}/></>}
  </section>;
}
