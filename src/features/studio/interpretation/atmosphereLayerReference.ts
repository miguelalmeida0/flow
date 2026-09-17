import type { AtmosphereLayerId } from "../../../domain/studio-model";

const aliases: Record<string, AtmosphereLayerId> = {
  rain: "rain", rainfall: "rain", tone: "tone", "tonal bed": "tone", tonal: "tone", music: "tone", piano: "tone", melody: "tone",
  pulse: "pulse", rhythm: "pulse", beat: "pulse", texture: "texture", room: "texture", noise: "texture",
};
export const atmosphereLayerPattern = `(?:${Object.keys(aliases).join("|")})`;

/** A layer reference consumes its whole argument. Finding a known noun inside
 * unknown instructions must never authorize a sound edit. */
export function atmosphereLayerReference(value: string): AtmosphereLayerId | undefined {
  const name = value.trim().replace(/^(?:of )?(?:the |my )?/, "").replace(/ (?:layer|sound|volume|level|presence|pace|rate)$/, "");
  return aliases[name];
}
