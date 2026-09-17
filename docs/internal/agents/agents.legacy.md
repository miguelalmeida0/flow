# agents.md

## Purpose

Flow is a voice-first React application for arranging and recovering a day. It should feel immediate: the user describes a constraint, calendar objects move, and the movement itself confirms what changed.

The codebase is deliberately small. Prefer a clear function over a framework, a direct prop over context, and a deterministic rule over an unnecessary model call.

## Architecture

```text
src/
├── app/                         Application composition only
├── features/day-planner/        Complete planner feature
│   ├── model.ts                 Domain contracts
│   ├── parser.ts                Natural-language → PlanCommand
│   ├── planner.ts               Command dispatch
│   ├── schedule.ts              Pure scheduling rules
│   ├── storage.ts               Validated local persistence
│   ├── useFlowPlanner.ts        UI orchestration and history
│   ├── useVoiceInput.ts         Browser voice adapter
│   └── *.tsx                    Focused feature UI
├── shared/design-system/        Semantic tokens and icons
├── shared/lib/                  Truly cross-feature helpers
└── test/                        Shared test setup
```

### Data flow

```text
Voice or typed text
        ↓
parseCommand()
        ↓
PlanCommand union
        ↓
applyCommand()
        ↓
Pure schedule transformation
        ↓
DayPlan + PlannerFeedback
        ↓
React renders; Motion animates layout deltas
        ↓
Validated localStorage persistence
```

No component calls a scheduler directly except the feature orchestration hook. No visual component knows how commands are parsed. No domain function imports React.

## Core philosophy

### Deterministic before intelligent

The primary experience must work without a network or API key. Natural language is mapped into a small command union, and each command is executed by pure scheduling functions.

An LLM may later help interpret unsupported wording. It must produce the same `PlanCommand` contract and must never mutate calendar state directly.

### The animation is confirmation

Do not add success toasts for visible changes. When a block moves, locks, leaves today, or returns through undo, that motion is the primary acknowledgement. Supporting copy should remain brief.

### Fixed means fixed

`fixed` and `protected` events are hard constraints. A planner change may only move them after explicit user approval. Silent constraint violations are release blockers.

### Fail closed

An unknown or ambiguous command must leave the plan untouched. Show one concrete example rather than guessing.

## Component responsibilities

- `FlowPlannerScreen`: composes the feature; contains no business logic.
- `PlannerHeader`: title, undo, and reset controls.
- `DayTimeline`: time grid and event collection.
- `EventBlock`: one interactive calendar block.
- `DayStatusPanel`: current planner result and deferred items.
- `VoiceCommandBar`: typed/voice command capture.
- `QuickCommands`: zero-cost showcase entry points.
- `Legend`: explains the three scheduling constraints.

A component should change for one reason. If a component starts parsing commands, storing data, and rendering UI, split it.

## State ownership

`useFlowPlanner` owns the active `DayPlan`, feedback, selection, and undo history. State is passed only to direct children that use it. Do not introduce context unless two distant subtrees need the same state and lifting it would create repeated pass-through props.

React state stores domain snapshots, not animation frames. Motion derives animations from layout changes.

## Domain contracts

`PlanCommand` is a discriminated union. Add a command by extending the union and handling it exhaustively in the parser and planner.

`DayPlan` is serializable. Do not store DOM nodes, class instances, callbacks, or derived UI values in it.

`PlannerFeedback` describes what the user should understand after a change. It must not duplicate the complete plan.

## Scheduling rules

Scheduling functions must be pure:

```ts
const result = arrangeDay(plan, after, duration);
```

They receive a plan and return a new plan. They do not read the clock, browser state, localStorage, or React state.

Preserve event IDs across moves. Stable IDs are required for layout animation, undo, testing, and future calendar synchronization.

Never mutate the input plan or its events.

## Styling conventions

All product styling uses Tailwind utility classes.

- Semantic, repeated class groups live in `DesignTokens.tsx`.
- Dynamic calendar geometry may use React's `style` prop for runtime `top` and `height` values.
- Do not add CSS modules, styled-components, Emotion, Sass, or handwritten selectors.
- `src/tailwind.css` is only the required Tailwind build entry.
- Avoid one-off colors when a semantic token already exists.

Visual rules:

- Warm near-white surface, graphite text, restrained amber action color.
- Blue identifies fixed time; amber identifies protected/flexible time; green identifies recovery space.
- No gradients, glass effects, neon, or decorative dashboards.
- Motion must explain causality and respect reduced-motion settings.

## Voice conventions

Voice is an input adapter, not the architecture.

- Typed input must support every voice action.
- Browser speech recognition is optional and capability-detected.
- The app must not request microphone access on load.
- A final transcript executes once; interim text is display-only.
- Unsupported browsers receive a functional typed experience.

## Adding an LLM interpreter later

Create a new adapter such as `interpretWithModel.ts` that returns `PlanCommand`.

Required boundaries:

1. Run the local parser first.
2. Call a model only when local parsing returns `unknown`.
3. Validate structured output at runtime.
4. Apply existing deterministic scheduling rules.
5. Never expose provider keys in the browser.
6. Rate-limit anonymous traffic.
7. Log command categories, not private calendar text.
8. Keep the app usable when the model is unavailable.

Do not let the model return event coordinates, React markup, Tailwind classes, or animation instructions.

## Persistence

`storage.ts` owns the localStorage key and validates data with Zod before use. Invalid or stale data falls back to a fresh plan.

When the persistence format changes:

- Increment the key version.
- Add an explicit migration only when preserving old local data matters.
- Never loosen validation to accept unknown shapes.

## Testing expectations

Every scheduling rule needs a pure unit test.

Test at least:

- Anchored events remain unchanged.
- Flexible events do not overlap.
- Requested activities fit before their boundary.
- Recovery moves only eligible work.
- Deferred work keeps its identity and duration.
- Unknown commands do not mutate state.
- Undo restores the complete previous snapshot.

Component tests should assert outcomes through accessible names and visible copy. Do not test Motion implementation details.

Before handoff, run:

```bash
npm run check
```

A change is incomplete when lint, tests, TypeScript, or the production build fails.

## Accessibility

- Every icon-only button needs an accessible label.
- Calendar blocks are real buttons and keyboard reachable.
- Planner feedback uses `aria-live="polite"`.
- Voice is never the only interaction path.
- Do not encode event type with color alone; labels and icons must reinforce it.
- New motion must degrade gracefully for `prefers-reduced-motion`.

## Performance

Keep React responsible for state and DOM composition, not frame-by-frame animation.

- Preserve stable keys.
- Avoid global stores for feature-local state.
- Do not memoize components without measured evidence.
- Avoid effects that derive values available during render.
- Keep planner algorithms linear over the number of daily events where practical.
- Do not add virtualization until the product displays enough data to require it.

## Extension guide

### Add a new command

1. Extend `PlanCommand` in `model.ts`.
2. Parse it in `parser.ts`.
3. Add a pure transformation in `schedule.ts` or a focused sibling module.
4. Dispatch it in `planner.ts`.
5. Add parser and schedule tests.
6. Add UI copy only when the existing feedback model cannot express the result.

### Add a week view

Create `features/week-planner/` and reuse domain contracts only where semantics are truly shared. Do not turn the day feature into a generic mega-planner first.

### Add real calendar sync

Place provider-specific code behind a repository interface outside visual components. Import into a draft plan, show the proposed changes, then request explicit confirmation before writing back.

## Anti-patterns

Do not add:

- A generic `components/` dumping ground.
- A global context for one screen.
- A chat transcript beside the calendar.
- A model call for undo, pause, selection, or known commands.
- Generated images or generated UI.
- Silent writes to a connected calendar.
- Dead icon buttons for visual decoration.
- A 300-line `FlowPlannerScreen`.
- Premature plugin systems or abstract factories.

The standard is simple: each module should reveal what it owns within one read.
