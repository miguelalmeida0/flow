import { expect, it } from "vitest";
import { homeSurfaceInk } from "./homeSurfaceInk";

function luminance(hex: string) {
  const rgb = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
}

it("keeps readable ink throughout every sampled wake brightening frame", () => {
  const from = [35, 50, 58]; const to = [242, 232, 219];
  for (let step = 0; step <= 100; step += 1) {
    const channels = from.map((value, index) => Math.round(value + (to[index]! - value) * step / 100));
    const background = `#${channels.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
    const ink = homeSurfaceInk(`rgba(${channels.join(", ")}, 1)`);
    const light = Math.max(luminance(background), luminance(ink));
    const dark = Math.min(luminance(background), luminance(ink));
    expect((light + 0.05) / (dark + 0.05), `contrast at frame ${step}`).toBeGreaterThanOrEqual(4.5);
  }
  expect(homeSurfaceInk("#23323A")).toBe("#F8F2E8");
  expect(homeSurfaceInk("#D8D5C5")).toBe("#233039");
});
