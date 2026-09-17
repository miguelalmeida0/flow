import type { ActiveAtmosphere, AtmosphereLayer, AtmosphereLayerId } from "../../domain/studio-model";

interface LayerRuntime {
  source: AudioScheduledSourceNode;
  gain: GainNode;
  modulation?: OscillatorNode;
  modulationGain?: GainNode;
}

declare global {
  interface Window {
    __FLOW_ATMOSPHERE__?: { contextsCreated: number; activeSources: number; state: string; presetId?: string };
  }
}

function diagnostics() {
  if (typeof window === "undefined") return undefined;
  return window.__FLOW_ATMOSPHERE__ ??= { contextsCreated: 0, activeSources: 0, state: "locked" };
}

function createNoiseBuffer(context: AudioContext, color: AtmosphereLayerId) {
  const length = context.sampleRate * 2;
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let index = 0; index < length; index += 1) {
    const white = Math.random() * 2 - 1;
    last = color === "rain" ? 0.82 * last + 0.18 * white : 0.985 * last + 0.015 * white;
    data[index] = color === "rain" ? white * 0.55 + last * 0.45 : last * 3.2;
  }
  return buffer;
}

export class AtmosphereEngine {
  private context?: AudioContext;
  private master?: GainNode;
  private layers = new Map<AtmosphereLayerId, LayerRuntime>();
  private unlocked = false;

  async unlockFromGesture() {
    this.unlocked = true;
    this.ensureContext();
    if (this.context?.state === "suspended") await this.context.resume().catch(() => undefined);
    const state = diagnostics();
    if (state) state.state = this.context?.state ?? "unavailable";
    return this.context?.state === "running";
  }

  private ensureContext() {
    if (this.context || !this.unlocked || typeof window === "undefined") return this.context;
    const Constructor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Constructor) return undefined;
    this.context = new Constructor();
    this.master = this.context.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.context.destination);
    const state = diagnostics();
    if (state) state.contextsCreated += 1;
    return this.context;
  }

  private startLayer(layer: AtmosphereLayer) {
    const context = this.context;
    const master = this.master;
    if (!context || !master || this.layers.has(layer.id)) return;
    const gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(master);
    let source: AudioScheduledSourceNode;
    let modulation: OscillatorNode | undefined;
    let modulationGain: GainNode | undefined;
    if (layer.id === "tone" || layer.id === "pulse") {
      const oscillator = context.createOscillator();
      oscillator.type = layer.id === "tone" ? "sine" : "triangle";
      oscillator.frequency.value = layer.id === "tone" ? 174.61 + layer.character * 46 : 55;
      if (layer.id === "pulse") {
        modulation = context.createOscillator();
        modulationGain = context.createGain();
        modulation.frequency.value = Math.max(0.08, layer.rate * 0.32);
        modulationGain.gain.value = 0.45;
        modulation.connect(modulationGain); modulationGain.connect(gain.gain); modulation.start();
      }
      source = oscillator;
    } else {
      const noise = context.createBufferSource();
      noise.buffer = createNoiseBuffer(context, layer.id);
      noise.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = layer.id === "rain" ? "highpass" : "lowpass";
      filter.frequency.value = layer.id === "rain" ? 950 + layer.character * 2600 : 480 + layer.character * 900;
      noise.connect(filter); filter.connect(gain);
      source = noise;
    }
    if (layer.id === "tone" || layer.id === "pulse") source.connect(gain);
    source.start();
    this.layers.set(layer.id, { source, gain, modulation, modulationGain });
  }

  async apply(active?: ActiveAtmosphere) {
    if (!active || !active.playing) {
      if (this.master && this.context) this.master.gain.setTargetAtTime(0, this.context.currentTime, 0.04);
      const state = diagnostics();
      if (state) { state.state = active ? "paused" : "idle"; state.presetId = active?.presetId; }
      return false;
    }
    const context = this.ensureContext();
    if (!context || !this.master) return false;
    if (context.state === "suspended") await context.resume().catch(() => undefined);
    active.layers.forEach((layer) => this.startLayer(layer));
    const now = context.currentTime;
    for (const layer of active.layers) {
      const runtime = this.layers.get(layer.id);
      if (!runtime) continue;
      runtime.gain.gain.setTargetAtTime(layer.enabled ? layer.volume * 0.34 : 0, now, 0.08);
      if (runtime.modulation) runtime.modulation.frequency.setTargetAtTime(Math.max(0.08, layer.rate * 0.32), now, 0.08);
    }
    this.master.gain.setTargetAtTime(active.muted ? 0 : active.masterVolume, now, 0.08);
    const state = diagnostics();
    if (state) { state.activeSources = this.layers.size; state.state = context.state; state.presetId = active.presetId; }
    return context.state === "running";
  }

  async dispose() {
    for (const runtime of this.layers.values()) {
      try { runtime.source.stop(); } catch { /* already stopped */ }
      try { runtime.modulation?.stop(); } catch { /* already stopped */ }
    }
    this.layers.clear();
    const context = this.context;
    this.context = undefined; this.master = undefined;
    if (context && context.state !== "closed") await context.close().catch(() => undefined);
    const state = diagnostics();
    if (state) { state.activeSources = 0; state.state = "closed"; }
  }

  get isUnlocked() { return this.unlocked; }
}
