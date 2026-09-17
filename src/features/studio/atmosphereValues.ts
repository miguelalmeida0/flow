/** Visible +/- means ten percentage points. Speech uses the same increment;
 * absolute presence and pace sliders retain their finer granularity. */
export function adjustAtmosphereValue(value: number, property: "volume" | "rate", direction: "increase" | "decrease") {
  const step = property === "volume" ? 0.1 : 0.15;
  const minimum = property === "volume" ? 0 : 0.2;
  const maximum = property === "volume" ? 1 : 2;
  return Number(Math.max(minimum, Math.min(maximum, value + step * (direction === "increase" ? 1 : -1))).toFixed(6));
}
