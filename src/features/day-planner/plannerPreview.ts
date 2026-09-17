import type { CalendarAction, PendingInteraction, PlannerPreview } from "./model";
import { applyBoundaryChoice, applyClarificationChoice, applyDestinationChoice } from "./scheduling/resolution";

export function adjustPreviewRequest(preview: PlannerPreview, action: Extract<CalendarAction, { type: "adjustPreview" }>) {
  let replaced = false;
  const actions = preview.request.actions.map((candidate) => {
    if (replaced || !(candidate.type === "create" || candidate.type === "move" || candidate.type === "createBreathingRoom")) return candidate;
    replaced = true;
    if (action.destination) return { ...candidate, destination: action.destination };
    if (action.durationMinutes && (candidate.type === "create" || candidate.type === "createBreathingRoom")) {
      return { ...candidate, durationMinutes: action.durationMinutes };
    }
    return candidate;
  });
  const adjustment = action.destination
    ? (action.destination.type === "absolute" ? `${action.destination.minutes}` : "another time")
    : `${action.durationMinutes ?? "another duration"} minutes`;
  return { ...preview.request, transcript: `Try ${adjustment} instead`, actions, mode: "preview" as const };
}

export function applyPendingChoice(pending: Extract<PendingInteraction, { type: "clarification" }>, choiceId: string) {
  const { clarification } = pending;
  if (clarification.type === "event") {
    return applyClarificationChoice(pending.request, clarification.selector, choiceId);
  }
  if (clarification.type === "destination") {
    const choice = clarification.choices.find((item) => item.id === choiceId);
    return choice ? applyDestinationChoice(pending.request, clarification.actionIndex, choice.destination) : pending.request;
  }
  const choice = clarification.choices.find((item) => item.id === choiceId);
  return choice ? applyBoundaryChoice(pending.request, clarification.actionIndex, choice.endMinutes) : pending.request;
}
