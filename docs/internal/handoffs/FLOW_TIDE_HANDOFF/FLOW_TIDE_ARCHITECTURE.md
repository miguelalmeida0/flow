# Flow Tide — Architecture and Data Flow

## Guiding rule

Do not rewrite the app into a framework.

Extend the current feature-oriented architecture with the minimum domain modules needed to keep interpretation, scheduling, Tide automation, and rendering separate.

## Core pipeline

```text
Input adapters
  ├─ typed command
  ├─ browser voice transcript
  ├─ drag
  ├─ resize
  ├─ quick action
  └─ Tide trigger
          ↓
CalendarAction[]
          ↓
resolve references
          ↓
build draft transaction
          ↓
validate invariants
          ↓
classify risk
          ↓
commit or preview
          ↓
event history + persistence
          ↓
React render + Motion choreography
```

## Domain model

Adapt the existing event model rather than duplicating it.

Suggested types:

```ts
export type EventColor =
  | "neutral"
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "cyan"
  | "blue"
  | "indigo";

export type EventImportance = "normal" | "important" | "critical";

export type EventMobility = "anchored" | "heavy" | "light" | "fluid";

export type EventStatus = "planned" | "active" | "done" | "cancelled";

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  startMinutes: number;
  durationMinutes: number;
  color: EventColor;
  labels: string[];
  importance: EventImportance;
  mobility: EventMobility;
  protected: boolean;
  status: EventStatus;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  linkedGroupId?: string;
}
```

Do not add fields that the release does not use.

Breathing room should be explicit:

```ts
export interface BreathingRoom {
  id: string;
  date: string;
  startMinutes: number;
  durationMinutes: number;
  protected: boolean;
  label?: string;
  source: "user" | "tide";
}
```

It may share a common schedule-item union if that makes existing invariants simpler.

## Actions

Use discriminated unions.

Required action families:

```ts
export type CalendarAction =
  | CreateEventAction
  | MoveEventAction
  | ResizeEventAction
  | UpdateEventAction
  | ProtectEventAction
  | CreateBreathingRoomAction
  | SplitEventAction
  | MergeEventsAction
  | DeferEventAction
  | CompleteEventAction
  | DeleteEventAction
  | SetDayBoundaryAction
  | DeclareDelayAction
  | UndoAction
  | RedoAction
  | ResetAction;
```

`UpdateEventAction` may carry a typed patch for title, color, labels, importance, or mobility.

Compound natural-language requests produce an ordered action array and commit atomically.

## Reference resolution

Resolution precedence should remain strict and explainable.

Suggested stages:

1. explicit stable ID from direct manipulation/selection
2. exact time plus date
3. current/next/previous positional reference
4. exact normalized title
5. contiguous title phrase
6. complete token match
7. label/color/status/type filter
8. conversational suffix relaxation
9. focused clarification

Examples:

- “the 2 PM” → event starting at 14:00
- “the 2 PM meeting” → event at 14:00, optional type suffix
- “the event before lunch” → nearest event ending before Lunch
- “every red meeting” → batch selector
- “this” → current explicit selection only

Never convert bare “meeting” into every event.

## Tide engine

Keep Tide separate from generic action application.

Suggested modules:

```text
features/day-planner/tide/
  detectTideTrigger.ts
  buildTideProposal.ts
  scoreSchedule.ts
  classifyTideRisk.ts
  summarizeTideChange.ts
```

### Trigger input

```ts
export type TideTrigger =
  | { type: "schedule-changed"; transactionId: string }
  | { type: "delay-declared"; minutes: number }
  | { type: "event-extended"; eventId: string; minutes: number }
  | { type: "event-completed-early"; eventId: string }
  | { type: "day-boundary-set"; endMinutes: number }
  | { type: "time-drift"; nowMinutes: number };
```

### Proposal

```ts
export interface TideProposal {
  actions: CalendarAction[];
  beforeScore: ScheduleScore;
  afterScore: ScheduleScore;
  risk: "safe" | "review" | "blocked";
  reasons: string[];
}
```

### Schedule scoring

Use concrete penalties:

- illegal overlap: infinite/blocked
- protected/fixed movement: blocked
- deadline miss
- day-boundary overflow
- required-buffer violation
- event movement distance
- fragmentation
- context switching
- tiny unusable gaps
- deferral cost based on importance/mobility

Do not introduce opaque machine-learning scores.

## Preview versus commit

The same draft schedule is used for:

- what-if
- destructive preview
- protected-event conflict
- Tide review state

Never maintain a separate fake preview implementation.

## History

Event-sourced transaction history is preferred over ad hoc snapshots, but use the existing tested approach if exact undo/redo is already reliable.

Each transaction must include:

- ID
- source: voice/type/drag/resize/tide/quick
- actions
- before state
- after state or reversible inverse
- timestamp
- human summary

Compound command = one transaction.

## Persistence and migration

- Keep versioned local storage.
- Add a migration for new event fields.
- Existing users must not lose the schedule.
- Apply safe defaults:
  - color neutral
  - importance normal
  - mobility inferred from current fixed/flexible state
  - protected from existing protection flag
  - status planned
  - buffers zero
- Invalid persisted state fails closed to a recoverable reset, not a white screen.

## UI module direction

Adapt to the existing project; names are illustrative:

```text
features/day-planner/
  FlowPlannerScreen.tsx
  model.ts
  useFlowPlanner.ts

  tide/
  interpretation/
  scheduling/
  voice/

  ui/
    PlannerHeader.tsx
    TimeSpine.tsx
    EventBlock.tsx
    BreathingRoomBlock.tsx
    CommandSurface.tsx
    ClarificationPopover.tsx
    TideChangeSummary.tsx
```

Do not create a generic app-wide `components/` dumping ground.

## State ownership

- `useFlowPlanner` may coordinate feature state.
- Pure reducers/functions own schedule transformations.
- Components receive focused view models and callbacks.
- Avoid context unless it removes real multi-level plumbing.
- Do not put animation frame state into React.
- Do not store derived schedule geometry as source-of-truth state.

## Geometry

Time-to-pixel mapping must remain a pure function.

Use runtime inline styles only for:

- top
- height
- transform
- measured container dimensions

Everything else comes from Tailwind token bundles.

## Runtime dependencies

Prefer existing dependencies.

Do not add:

- state-management framework
- date library unless current parsing truly requires it
- drag-and-drop framework if pointer events/Motion already suffice
- canvas/WebGL renderer
- runtime AI SDK
- animation timeline library in addition to Motion

A small app should remain small.
