import { SOUND_RECIPES } from "./sound-recipes";
import type { SoundCue } from "../rewards/reward-types";

type AudioContextLike = AudioContext;
type AudioContextFactory = () => AudioContextLike | undefined;

interface FlowSoundDiagnostics {
  contextsCreated: number;
  playCount: number;
  activeNodes: number;
  lastCue?: SoundCue;
}

declare global { interface Window { __FLOW_SOUND__?: FlowSoundDiagnostics } }

function diagnostics() {
  if (typeof window === "undefined") return undefined;
  return window.__FLOW_SOUND__ ??= { contextsCreated: 0, playCount: 0, activeNodes: 0 };
}

function browserAudioContext(): AudioContextLike | undefined {
  if (typeof window === "undefined") return undefined;
  const Constructor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Constructor ? new Constructor() : undefined;
}

export class RewardSoundDirector {
  private context?: AudioContextLike;
  private nodes = new Set<OscillatorNode>();
  private enabled = false;

  constructor(private readonly createContext: AudioContextFactory = browserAudioContext) {}

  async enableFromGesture() {
    this.enabled = true;
    if (!this.context) {
      this.context = this.createContext();
      if (this.context) {
        const state = diagnostics();
        if (state) state.contextsCreated += 1;
      }
    }
    if (this.context?.state === "suspended") await this.context.resume();
    return this.context?.state === "running";
  }

  disable() {
    this.enabled = false;
    this.cancel();
  }

  async play(cue: SoundCue) {
    if (!this.enabled || typeof document !== "undefined" && document.visibilityState === "hidden") return false;
    this.context ??= this.createContext();
    if (!this.context) return false;
    if (this.context.state === "suspended") await this.context.resume().catch(() => undefined);
    if (this.context.state !== "running") return false;
    this.cancel();
    const state = diagnostics();
    if (state) { state.playCount += 1; state.lastCue = cue; }
    const start = this.context.currentTime + 0.006;
    for (const note of SOUND_RECIPES[cue]) {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      const noteStart = start + note.offsetMs / 1000;
      const noteEnd = noteStart + note.durationMs / 1000;
      oscillator.type = note.type;
      oscillator.frequency.setValueAtTime(note.frequency, noteStart);
      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(note.gain, noteStart + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
      oscillator.connect(gain);
      gain.connect(this.context.destination);
      oscillator.onended = () => {
        this.nodes.delete(oscillator);
        const current = diagnostics();
        if (current) current.activeNodes = this.nodes.size;
      };
      this.nodes.add(oscillator);
      if (state) state.activeNodes = this.nodes.size;
      oscillator.start(noteStart);
      oscillator.stop(noteEnd + 0.01);
    }
    return true;
  }

  cancel() {
    for (const node of this.nodes) {
      try { node.stop(); } catch { /* already stopped */ }
    }
    this.nodes.clear();
    const state = diagnostics();
    if (state) state.activeNodes = 0;
  }

  async dispose() {
    this.disable();
    const context = this.context;
    this.context = undefined;
    if (context && context.state !== "closed") await context.close().catch(() => undefined);
  }

  get state() { return this.context?.state ?? "not-created"; }
}
