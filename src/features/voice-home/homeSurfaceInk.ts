import type { HomeEntrancePhase } from "./voiceWorld";

export function homeSurfaceColor(entrance: HomeEntrancePhase) {
  if (entrance === "active" || entrance === "preparing") return "#F2E8DB";
  if (entrance === "wake-reward") return "#D8D5C5";
  return "#23323A";
}

/** Foreground follows the actual animated surface, not the next phase. */
export function homeSurfaceInk(background: string) {
  const rgb = background.startsWith("#")
    ? [1, 3, 5].map((start) => Number.parseInt(background.slice(start, start + 2), 16))
    : (background.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
  const [red = 0, green = 0, blue = 0] = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  if (luminance < 0.12) return "#F8F2E8";
  if (luminance < 0.179) return "#FFFFFF";
  if (luminance < 0.32) return "#000000";
  return "#233039";
}
