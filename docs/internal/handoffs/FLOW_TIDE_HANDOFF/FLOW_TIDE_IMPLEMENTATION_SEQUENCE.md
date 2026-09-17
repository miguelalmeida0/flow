# Flow Tide — Implementation Sequence

The sequence is deliberate. Do not redesign everything first and leave the behavior fake.

## Phase 0 — Baseline and audit

Before editing:

1. Run current lint/tests/build.
2. Read current release evidence.
3. Run the app and capture the current desktop/mobile state.
4. Trace:
   - command interpretation
   - reference resolution
   - scheduler
   - history
   - persistence
   - voice adapter
   - event geometry
   - current design tokens
5. Record the current exact test count.

Output a brief implementation map, then continue directly into code.

## Phase 1 — Domain extension without visual redesign

Add the minimum model fields:

- color
- labels
- importance
- mobility
- status
- buffers
- linked group if needed

Add storage migration and model tests.

Extend actions:

- update event
- breathing room
- day boundary
- completion
- split/merge
- what-if preview

Preserve all current behavior.

Gate:

```bash
npm run lint
npm run test:run
npm run build
```

## Phase 2 — Zero-selection and compound editing

Implement references by time, position, title, label, and color.

Required no-selection commands:

- Move the 2 PM to 4.
- Make the 2 PM meeting important and red.
- Rename the 2 PM meeting to design review.
- Make the 2 PM meeting 45 minutes.
- Give me 20 minutes before the interview.
- Move every red meeting to Thursday.

Add focused clarification for true ambiguity.

Add parser/interpreter corpus cases.

Gate all tests.

## Phase 3 — Unified direct-manipulation actions

Add:

- drag move
- resize
- protect quick action
- complete quick action
- keyboard alternatives

All must dispatch existing domain actions.

No separate mutation logic inside event components.

Gate:

- unit
- component
- E2E for drag/resize
- undo/redo parity

## Phase 4 — Tide engine

Implement deterministic proposal generation.

First triggers:

- user-declared delay
- create/move/resize conflict
- breathing-room request
- end-of-day boundary
- early completion

Then safe auto-apply policy.

Add proposal and scoring tests.

Required:

- no event loss
- no duplicates
- no illegal overlap
- no protected/fixed movement
- deterministic result
- exact one-step undo

## Phase 5 — Breathing Day redesign

Only after behavior is real:

- replace current white/day-grid surface
- remove right sidebar
- implement top density chip
- implement time spine
- implement floating event surfaces
- implement breathing-room wave
- implement hidden command surface
- inline clarification/errors
- mobile layout

Migrate all styling to semantic token bundles.

No raw colors in feature components.

## Phase 6 — Choreography

Implement:

- color wash
- importance
- anchor
- curved event move
- resize
- breathing room
- split
- merge
- defer
- complete
- what-if
- exact undo/replay

Verify reduced motion.

Profile layout thrashing and animation interruption.

## Phase 7 — Product flows

Build and test the signature flows:

### Flow A

“Make the 2 PM meeting important and red, give me 20 minutes before it, and move anything flexible out of the way.”

### Flow B

“Split deep work into two 45-minute sessions and keep one before lunch.”

### Flow C

“I’m 35 minutes behind. Keep dinner at seven.”

### Flow D

“I’m done at six today.”

### Flow E

“What if I add a workout at five?” → “Try six instead.” → “Do it.”

### Flow F

“What changed?”

## Phase 8 — Release evidence

Extend `npm run qa:release`.

Produce:

- initial dark calendar
- recolor/important
- breathing room
- Tide reflow
- split/merge
- what-if
- undo
- mobile
- reduced motion

Store under:

```text
artifacts/tide-release/
```

Run full QA and manual real-microphone acceptance.

## Scope discipline

Do not add week/month views, provider sync, accounts, recurrence UI, backend, or runtime AI.

The portfolio release wins through one exceptional day surface and exceptional interaction quality.
