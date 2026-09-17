# 08 — Domain Architecture

## Architecture goal

Create one small, explicit life model. Avoid both extremes:

- separate stores and duplicated records per feature;
- an abstract “everything entity” that loses type safety.

Use discriminated unions and feature-owned modules.

## Core entities

Recommended shape is provided in `reference/life-domain-model.reference.ts`.

Primary types:

- `Capture`
- `Plan`
- `PlanStep`
- `Person`
- `Commitment`
- existing `CalendarEvent`
- `EntityLink`

## Identity and lineage

Every entity has a stable ID.

Cross-space relationships are explicit links:

- capture-origin-of-plan;
- step-scheduled-as-event;
- commitment-about-plan;
- commitment-reserved-by-event.

Do not copy titles between features and call that integration.

## Actions

All mutations use discriminated `LifeAction` values.

Representative actions:

```text
capture.create
capture.update
capture.resolve
plan.create-from-capture
plan.update
plan.step.add
plan.step.complete
plan.step.schedule
commitment.create
commitment.complete
link.create
link.remove
calendar.action
history.undo
history.redo
```

Calendar-specific actions continue through the current Calendar engine.

## Transaction model

A user intention may produce multiple actions.

Example “Turn that into a plan”:

```text
plan.create-from-capture
capture.resolve
link.create
```

The transaction must validate and commit atomically.

Store:

- transaction ID;
- source: voice/type/pointer/automation;
- before snapshot or reversible inverse;
- actions;
- timestamp;
- concise human summary.

## Projections

Build selectors rather than copied arrays:

- `selectHomeCalendarPreview`
- `selectUnresolvedCaptures`
- `selectActivePlans`
- `selectOpenCommitments`
- `selectNowCandidates`
- `selectCalendarEvents`

Memoize only where measurements show value.

## State ownership

Use a single application-level provider/reducer only because state crosses feature boundaries and undo/redo must be global.

Do not put all UI state inside it.

### Domain state

- entities;
- links;
- global history;
- schema version.

### Local UI state

- open panel;
- hover/focus preview;
- interim transcript;
- active transition;
- route animation;
- transient error.

## Persistence

Keep local-first versioned persistence for the portfolio release.

- migrate existing Calendar storage;
- preserve stable event IDs;
- store new entities/links safely;
- validate before hydration;
- fail to a recoverable backup/reset state instead of a blank screen;
- do not add IndexedDB unless actual payload size or performance requires it.

## Motion separation

Domain actions must not import Motion.

After commit, derive a `MotionPlan` from:

- before state;
- after state;
- transaction actions;
- measured source/destination surfaces.

The motion layer can fail without corrupting domain state.

## Suggested project organization

Adapt names to the existing repository:

```text
src/
  app/
    FlowEnvironmentApp.tsx
    FlowEnvironmentProvider.tsx
    flow-environment-reducer.ts
    routes.ts

  features/
    home/
    day-planner/          # existing Calendar/Tide
    inbox/
    plans/
    people/
    now/
    voice/

  domain/
    life-model.ts
    life-actions.ts
    life-transaction.ts
    life-selectors.ts
    life-storage.ts
    migrations/

  shared/
    design-system/
    motion/
      SharedFlightLayer.tsx
      TidePath.tsx
      MotionBoundary.tsx
      motion-presets.ts
    command/
      GlobalCommandDock.tsx
```

Keep feature components small and single-purpose. Do not create a 500-line environment component or one giant global interpreter.

## Interpretation architecture

Use two stages:

1. route/navigation intent;
2. domain command interpretation based on explicit context.

Known commands remain deterministic and local.

No paid LLM is required for P0.

For Capture → Plan:

- known templates may create known suggested steps;
- unknown captures create a valid plan shell and invite the user to add the next step;
- do not invent confident life guidance.

## Now engine

Now is a pure selector/scorer over eligible existing items.

It must be deterministic and testable.

No separate “Now tasks” collection.
