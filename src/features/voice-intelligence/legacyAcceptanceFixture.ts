import type { LifeContext, LifeSnapshot } from "../../domain/life-model";
import fullBefore from "./legacyFullFixture.json";

export const legacyAcceptanceDay = "2026-09-05";
export const legacyAcceptanceAt = "2026-09-05T12:00:00.000Z";

/** Complete independently frozen BEFORE, including all twelve original
 * calendar entities and non-calendar defaults. No application factory. */
export function legacyAcceptanceFixture() {
  const snapshot = structuredClone(fullBefore) as LifeSnapshot;
  const context: LifeContext = { route: "home", activeMode: "command", nowMs: Date.parse(legacyAcceptanceAt), weekStartsOn: 1 };
  return { snapshot, context };
}
