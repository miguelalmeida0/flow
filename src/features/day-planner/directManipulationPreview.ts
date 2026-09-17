import type { CalendarAction, CalendarRequest, DayPlan } from "./model";
import { executeRequest } from "./scheduling/engine";

export interface DirectManipulationPreview {
  plan: DayPlan;
  changedIds: string[];
  originById: Record<string, { start: number; end: number }>;
}

/** Runs pointer geometry through the production draft, Tide, and invariants. */
export function buildDirectManipulationPreview(
  plan: DayPlan,
  actions: CalendarAction[],
  nowMinutes: number,
): DirectManipulationPreview | null {
  const request: CalendarRequest = {
    transcript: "Direct manipulation preview",
    normalized: "direct manipulation preview",
    actions,
    constraints: [],
    mode: "preview",
    nowMinutes,
  };
  const review = executeRequest(plan, request);
  if (review.status === "confirmation") {
    return { plan, changedIds: [], originById: {} };
  }
  const result = review.status === "success" ? review : executeRequest(plan, request, undefined, true);
  if (result.status !== "success") return null;
  return {
    plan: result.plan,
    changedIds: [...result.changes.changedIds],
    originById: result.changes.originById,
  };
}
