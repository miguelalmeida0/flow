import type { LifeContext } from "../../../domain/life-model";
import { numberToken, parseNumberWords } from "../../day-planner/interpretation/numbers";
import type { StudioIntent } from "./studioInterpreter";
import { atmosphereLayerPattern as layer, atmosphereLayerReference } from "./atmosphereLayerReference";

const quantity = `(?:\\d+(?:\\.\\d+)?|${numberToken})`;
const id = (value: string) => atmosphereLayerReference(value)!; // Matched against the same complete alias catalog.
function number(value: string) { return /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : parseNumberWords(value); }

/** Complete control roles keep quantity, unit and exclusions attached to the
 * same layer. No suffix is discarded or interpreted as a preset name. */
export function parseAtmosphereRoleFrame(text: string, context: LifeContext): StudioIntent | null {
  if (/^(?:lower|reduce|soften) (?:every|all) (?:sound )?layers? by (?:one|a|1) notch without touching the master (?:level|volume)$/.test(text)
    && (context.route === "atmosphere" || context.topic === "atmosphere")) return { type: "atmosphere-adjust", property: "volume", operation: "decrease" };
  const setRate = text.match(new RegExp(`^set (?:the )?(${layer}) (?:speed|pace|rate) to (${quantity}),? without raising its volume$`));
  if (setRate) {
    const value = number(setRate[2]!);
    if (value !== null) return { type: "atmosphere-set", layerId: id(setRate[1]!), property: "rate", value };
  }
  const preserve = text.match(new RegExp(`^keep (?:the )?(${layer}) audible[;,]? (?:reduce|lower|soften) (?:the )?(${layer}) instead$`));
  if (preserve) return { type: "atmosphere-adjust", layerId: id(preserve[2]!), property: "volume", operation: "decrease", preserveAudibleLayerIds: [id(preserve[1]!)] };
  const pace = text.match(new RegExp(`^(?:the )?(${layer}) is too (fast|slow)[;,]? (reduce|increase) its (?:pace|speed|rate) (?:a|one|1) notch$`));
  if (pace && ((pace[2] === "fast") === (pace[3] === "reduce"))) return { type: "atmosphere-adjust", layerId: id(pace[1]!), property: "rate", operation: pace[3] === "reduce" ? "decrease" : "increase" };
  const percent = text.match(new RegExp(`^i want (?:the )?(${layer}) at (${quantity}) percent,? not (${quantity}) times louder$`));
  if (percent) {
    const value = number(percent[2]!), excludedMultiplier = number(percent[3]!);
    if (value !== null && excludedMultiplier !== null) return { type: "atmosphere-set", layerId: id(percent[1]!), property: "volume", value: value / 100 };
  }
  return null;
}
