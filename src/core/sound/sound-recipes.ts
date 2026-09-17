import type { SoundCue } from "../rewards/reward-types";

export interface SoundNote {
  offsetMs: number;
  durationMs: number;
  frequency: number;
  gain: number;
  type: OscillatorType;
}

const soft = (frequency: number, offsetMs = 0, durationMs = 90, gain = 0.018): SoundNote => ({ offsetMs, durationMs, frequency, gain, type: "sine" });

export const SOUND_RECIPES: Record<SoundCue, SoundNote[]> = {
  listening: [soft(392, 0, 55, 0.012)],
  understood: [soft(523.25, 0, 70, 0.014)],
  placed: [soft(440, 0, 95), soft(659.25, 86, 120)],
  protected: [soft(329.63, 0, 100), soft(493.88, 76, 150)],
  resolved: [soft(392, 0, 90), soft(523.25, 72, 110), soft(659.25, 146, 150)],
  completed: [soft(392, 0, 105), soft(523.25, 92, 125), soft(783.99, 184, 190, 0.021)],
  undo: [soft(493.88, 0, 80, 0.012), soft(392, 70, 105, 0.012)],
  uncertain: [soft(349.23, 0, 70, 0.01)],
};
