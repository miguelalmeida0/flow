# 04 — Unified Domain and Action Engine

## Unified state

Use one persisted `LifeState`. Routes render projections; they do not own isolated copies.

```ts
type LifeState = {
  version: number;
  events: Record<string, CalendarEvent>;
  captures: Record<string, Capture>;
  outcomes: Record<string, Outcome>;
  steps: Record<string, OutcomeStep>;
  commitments: Record<string, Commitment>;
  people: Record<string, PersonReference>;
  preferences: UserPreferences;
  interaction: InteractionContext;
  history: HistoryState;
};
```

## Core entities

```ts
type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  date: string;
  mobility: "fixed" | "heavy" | "flexible" | "fluid";
  protected: boolean;
  importance: "normal" | "important";
  color?: EventColor;
  label?: string;
  status: "planned" | "confirmed" | "done" | "cancelled";
  sourceEntityId?: string;
};

type Capture = {
  id: string;
  text: string;
  kind: "idea" | "task" | "reference" | "unresolved";
  createdAt: string;
  resolvedEntityId?: string;
};

type Outcome = {
  id: string;
  title: string;
  targetDate?: string;
  targetCondition?: string;
  status: "active" | "paused" | "complete";
  stepIds: string[];
  nextStepId?: string;
};

type OutcomeStep = {
  id: string;
  outcomeId: string;
  title: string;
  durationMinutes?: number;
  status: "pending" | "scheduled" | "complete" | "blocked";
  eventId?: string;
};

type Commitment = {
  id: string;
  personId: string;
  direction: "i-owe" | "waiting-on" | "next-conversation";
  title: string;
  dueDate?: string;
  status: "open" | "complete";
  outcomeId?: string;
  eventId?: string;
};
```

## One action language

Voice, typing, click, drag, resize, quick action, and Tide automation must produce the same typed actions.

```ts
type LifeAction =
  | NavigateAction
  | CreateEventAction
  | UpdateEventAction
  | MoveEventAction
  | ResizeEventAction
  | CompleteEventAction
  | CreateCaptureAction
  | ResolveCaptureAction
  | CreateOutcomeAction
  | AddOutcomeStepAction
  | ScheduleOutcomeStepAction
  | CompleteOutcomeStepAction
  | CreateCommitmentAction
  | CompleteCommitmentAction
  | LinkEntitiesAction
  | RecoverDayAction
  | SetDayBoundaryAction
  | PreviewScenarioAction
  | ConfirmAction
  | UndoAction
  | RedoAction;
```

## Transaction rules

- Compound requests commit atomically.
- A failing clause causes the whole transaction to remain uncommitted unless the user explicitly accepts a partial proposal.
- Every committed transaction creates one history entry.
- Undo restores all affected projections exactly.
- IDs remain stable.
- No entity is silently duplicated to appear in multiple routes.
- A Capture resolved into another entity keeps a reference but does not remain unresolved.
- Persistence is versioned and migrates existing data safely.

## Global selectors

Create pure selectors for:

- current event;
- next event;
- day viability;
- open time until boundary;
- unresolved captures;
- outcomes lacking a next step;
- next steps lacking scheduled time;
- commitments due soon;
- commitments without preparation time;
- top three “what fits now” candidates.
