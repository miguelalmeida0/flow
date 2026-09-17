export type SpaceId =
  | "home"
  | "today"
  | "capture"
  | "outcomes"
  | "commitments";

export type EventColor =
  | "teal"
  | "amber"
  | "red"
  | "blue"
  | "green"
  | "neutral";

export interface InteractionContext {
  currentSpace: SpaceId;
  lastReferencedEntityId?: string;
  lastCreatedEntityId?: string;
  lastChangedEntityId?: string;
  pendingClarification?: {
    id: string;
    question: string;
    candidateIds: string[];
  };
  pendingConfirmation?: {
    id: string;
    prompt: string;
    actionIds: string[];
  };
  lastTranscript?: string;
  updatedAt: number;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  start: string;
  end: string;
  mobility: "fixed" | "heavy" | "flexible" | "fluid";
  protected: boolean;
  importance: "normal" | "important";
  color?: EventColor;
  label?: string;
  status: "planned" | "confirmed" | "done" | "cancelled";
  sourceEntityId?: string;
}

export interface Capture {
  id: string;
  text: string;
  kind: "idea" | "task" | "reference" | "unresolved";
  createdAt: string;
  resolvedEntityId?: string;
}

export interface Outcome {
  id: string;
  title: string;
  targetDate?: string;
  targetCondition?: string;
  status: "active" | "paused" | "complete";
  stepIds: string[];
  nextStepId?: string;
}

export interface OutcomeStep {
  id: string;
  outcomeId: string;
  title: string;
  durationMinutes?: number;
  status: "pending" | "scheduled" | "complete" | "blocked";
  eventId?: string;
}

export interface PersonReference {
  id: string;
  displayName: string;
}

export interface Commitment {
  id: string;
  personId: string;
  direction: "i-owe" | "waiting-on" | "next-conversation";
  title: string;
  dueDate?: string;
  status: "open" | "complete";
  outcomeId?: string;
  eventId?: string;
}

export interface LifeState {
  version: number;
  events: Record<string, CalendarEvent>;
  captures: Record<string, Capture>;
  outcomes: Record<string, Outcome>;
  steps: Record<string, OutcomeStep>;
  commitments: Record<string, Commitment>;
  people: Record<string, PersonReference>;
  interaction: InteractionContext;
}
