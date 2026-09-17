import { motion } from "motion/react";
import { useState, type FormEvent } from "react";
import { useFlowEnvironment } from "../../../app/FlowEnvironmentProvider";
import { WorldPageShell, warmButton, warmCard, warmField, warmQuietButton } from "../../../shared/design-system/WorldPageShell";
import { useStudioRuntime } from "../StudioRuntimeProvider";
import { AtmosphereLayerControl } from "./AtmosphereLayerControl";

export function AtmosphereSpace() {
  const environment = useFlowEnvironment();
  const runtime = useStudioRuntime();
  const [name, setName] = useState("");
  const active = environment.document.studio.activeAtmosphere;
  const preset = active && environment.document.studio.atmospherePresets.find(({ id }) => id === active.presetId);
  function save(event: FormEvent) {
    event.preventDefault();
    environment.runCommand(name.trim() ? `Save this as ${name.trim()}` : "Save", "quick");
    setName("");
  }
  return <WorldPageShell action={<button data-action-id="studio.navigate-journal" className={warmQuietButton} data-flow-action="Return to Journal" onClick={() => environment.runCommand("Return to Journal", "quick")} type="button">Return to Journal</button>} description="Shape one room from texture, rain, tone, and pulse. It keeps playing while the rest of Flow moves." destination="atmosphere" eyebrow="A sound instrument, not a playlist" testId="atmosphere-space" title="Atmosphere">
    <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        {active ? <motion.div animate={{ opacity: 1 }} initial={{ opacity: 0 }}><div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7EA7A4]">{active.playing ? "Playing through the studio" : "Waiting in the room"}</p><h3 className="mt-2 font-serif text-4xl">{preset?.name ?? "Unsaved atmosphere"}</h3></div><div className="flex gap-2">{!runtime.audioUnlocked && <button data-action-id="atmosphere.enable-sound" className={warmButton} data-flow-action="Enable sound" onClick={() => void runtime.unlockAtmosphere()} type="button">Enable sound</button>}<button data-action-id="atmosphere.transport" className={warmQuietButton} data-flow-action={active.playing ? "Pause" : "Resume"} onClick={() => environment.runCommand(active.playing ? "Pause" : "Resume", "quick")} type="button">{active.playing ? "Pause" : "Resume"}</button><button data-action-id="atmosphere.transport" className={warmQuietButton} data-flow-action="Mute" onClick={() => environment.runCommand("Mute", "quick")} type="button">Mute</button></div></div><div className="grid gap-4 md:grid-cols-2">{active.layers.map((layer) => <AtmosphereLayerControl key={layer.id} layer={layer} onCommit={(patch) => environment.dispatchLife([{ type: "atmosphere.layer.update", layerId: layer.id, patch }], `${layer.label} adjusted.`)} />)}</div></motion.div> : <section className={`${warmCard} grid min-h-[420px] place-items-center border-[#D8D0C8] bg-[#171B18] p-10 text-center text-[#F4EFE5]`}><div><div aria-hidden className="mx-auto mb-7 flex w-40 items-end justify-center gap-2">{[22, 48, 76, 36, 62, 28].map((height, index) => <span className="w-3 rounded-full bg-[#A9B89D]" key={index} style={{ height }} />)}</div><p className="font-serif text-4xl">Sunday evening</p><p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#A7AAA4]">A quiet room, softened rain, a low tonal bed, and a patient pulse.</p><button data-action-id="atmosphere.enter" className={`${warmButton} mt-6 bg-[#EFE6D6] text-[#171B18] hover:bg-white`} data-flow-action="Enter the atmosphere" onClick={() => { void runtime.unlockAtmosphere(); environment.runCommand("Enter the atmosphere", "quick"); }} type="button">Enter the atmosphere</button></div></section>}
      </div>
      <aside className="space-y-4">
        <section className={`${warmCard} p-5`}><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7EA7A4]">Saved rooms</p><div className="mt-4 space-y-2">{environment.document.studio.atmospherePresets.map((item) => <button data-action-id="atmosphere.preset-select" className={`min-h-16 w-full rounded-2xl border px-4 text-left ${item.id === active?.presetId ? "border-[#7EA7A4] bg-[#E8EEE7]" : "border-[#D8D0C8] bg-white"}`} data-flow-action="Select atmosphere preset" key={item.id} onClick={() => { void runtime.unlockAtmosphere(); environment.runCommand(`Play ${item.name}`, "quick"); }} type="button"><strong className="block font-serif text-lg">{item.name}</strong><span className="text-xs text-[#756F66]">{item.builtIn ? "Flow original" : "Your atmosphere"}</span></button>)}</div></section>
        {active && <form className={`${warmCard} p-5`} onSubmit={save}><label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7EA7A4]" htmlFor="atmosphere-name">Keep this room</label><input data-action-id="atmosphere.save" className={`${warmField} mt-3`} data-flow-action="Atmosphere name" id="atmosphere-name" onChange={(event) => setName(event.target.value)} placeholder={preset?.name ?? "Atmosphere name"} value={name}/><div className="mt-3 flex gap-2"><button data-action-id="atmosphere.save" className={warmButton} data-flow-action="Save" type="submit">Save</button><button data-action-id="atmosphere.duplicate" className={warmQuietButton} data-flow-action="Duplicate" onClick={() => environment.runCommand("Duplicate", "quick")} type="button">Duplicate</button></div></form>}
        <section className={`${warmCard} p-5`}><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7EA7A4]">Voice feels direct here</p><p className="mt-3 text-sm leading-6 text-[#52606D]">Try “less rain”, “make the piano quieter”, “slow the pulse”, or “leave the music open beside my journal”.</p></section>
      </aside>
    </div>
  </WorldPageShell>;
}
