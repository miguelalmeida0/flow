import type { LifeDocument } from "../../domain/life-model";
import type { RitualStep } from "../../domain/studio-model";

export type HomeRitualStep = "sound" | "journal" | "quiet";
export type RitualConfigurationIntent = { type: "ritual-configure" } & ({ operation: "enabled"; enabled: boolean } | { operation: "step"; step: HomeRitualStep; included: boolean });
export const homeRitualStepLabels = { sound: "Play Sunday evening", journal: "Keep Journal nearby", quiet: "Quiet the studio" } as const;

export function ritualStepKey(step: RitualStep): HomeRitualStep {
  return step.type === "atmosphere.play" ? "sound" : step.type === "workspace.open" ? "journal" : "quiet";
}
export function homeRitualStep(document: LifeDocument, key: HomeRitualStep): RitualStep | undefined {
  if (key === "journal") return { type: "workspace.open", surface: "journal", placement: "secondary" };
  if (key === "quiet") return { type: "workspace.showLess" };
  const preset = document.studio.atmospherePresets.find(({ name }) => name === "Sunday evening");
  return preset ? { type: "atmosphere.play", presetId: preset.id } : undefined;
}
export function parseRitualConfiguration(text: string): RitualConfigurationIntent | null {
  const enabled = text.match(/^(enable|disable|turn on|turn off) (?:the |my )?home ritual$/);
  if (enabled) return { type: "ritual-configure", operation: "enabled", enabled: ["enable", "turn on"].includes(enabled[1]!) };
  const step = text.match(/^(include|add|remove|exclude) (?:the )?(sound|music|sunday evening|journal|quiet|quiet the studio)(?: step)? (?:in|to|from) (?:the |my )?home ritual$/);
  if (step) return { type: "ritual-configure", operation: "step", step: /^(sound|music|sunday evening)$/.test(step[2]!) ? "sound" : step[2] === "journal" ? "journal" : "quiet", included: ["include", "add"].includes(step[1]!) };
  return null;
}
