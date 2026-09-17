import type { DayPlan } from "../model";
import { DAY_END, DAY_START } from "../time";
import { eventStatus } from "../eventDefaults";

export type DensityState = "Open" | "Calm" | "Tight" | "Overloaded";

export function classifyDensity(plan: DayPlan): DensityState {
  const boundary = plan.endBoundaryMinutes ?? DAY_END;
  const occupied = [
    ...plan.events.filter((event) => !["done", "cancelled"].includes(eventStatus(event))),
    ...(plan.breathingRooms ?? []).filter((room) => room.dateKey === plan.dateKey),
  ].sort((left, right) => left.start - right.start);
  if (occupied.some((item) => item.end > boundary)) return "Overloaded";
  const capacity = Math.max(1, boundary - DAY_START);
  const used = occupied.reduce((total, item) => total + (item.end - item.start), 0);
  const ratio = used / capacity;
  let gaps = occupied.length === 0 ? 1 : 0;
  let cursor = DAY_START;
  for (const item of occupied) {
    if (item.start - cursor >= 30) gaps += 1;
    cursor = Math.max(cursor, item.end);
  }
  if (boundary - cursor >= 30) gaps += 1;
  if (ratio < 0.48 && gaps >= 1) return "Open";
  if (ratio < 0.7) return "Calm";
  if (ratio <= 0.9) return "Tight";
  return "Overloaded";
}
