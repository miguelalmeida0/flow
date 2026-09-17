# Flow Tide — Acceptance Criteria and QA Gates

## Definition of done

The release is complete only when:

- P0 and P1 work through the real UI.
- Existing behavior remains green.
- No-selection commands work.
- Direct manipulation and voice/type share the same action pipeline.
- Tide is deterministic and safe.
- The Breathing Day redesign is fully implemented.
- Motion explains state changes.
- Desktop/mobile/reduced-motion evidence exists.
- Real microphone status is honestly reported.

## Required automated command

```bash
npm run qa:release
```

It must continue to run:

- lint
- unit/integration/component tests
- TypeScript production build
- Chromium E2E
- console/page/request error capture
- screenshot evidence
- results JSON

Extend, do not weaken, the current release harness.

## Domain invariant tests

For every transaction verify:

- stable event IDs
- no silent loss
- no duplicate event
- no invalid duration
- no illegal overlap
- protected/fixed anchors preserved
- atomic compound command
- failed/clarified request does not mutate
- exact undo
- exact redo
- storage round-trip
- deterministic Tide proposal

## Required interpretation corpus

Add at least 100 new cases beyond the existing baseline, grouped by capability.

### Time references

- the 2 PM
- the two PM meeting
- the event at fourteen hundred
- the one before lunch
- my next meeting
- the current event
- the last event today

### Property editing

- make the 2 PM red
- make the 2 PM important and red
- label the 2 PM client
- remove the client label
- make lunch heavy
- make dinner flexible again
- protect the interview

### Compound actions

- make the 2 PM important and red, give me 20 minutes before it
- move the 2 PM to four and make it 45 minutes
- protect lunch and clear two to four
- move every red meeting to Thursday but keep the interview

### Breathing room

- give me 20 minutes before the interview
- keep half an hour free after lunch
- add a 15-minute buffer before my next meeting

### Split/merge

- split deep work into two 45-minute sessions
- split this in half
- combine email and admin
- batch all three admin tasks

### Tide/recovery

- I’m 35 minutes behind
- I need another 20 minutes on this
- I’m done early
- I’m done at six today
- clear my afternoon without moving dinner

### What-if

- what if I add a workout at five
- try six instead
- do it
- cancel that preview

## Required E2E flows

### 1. No-selection update by time

Input:

> Make the 2 PM meeting important and red.

Assert:

- unique 2 PM event resolved
- event importance important
- event color red
- no selection prerequisite
- one history transaction
- unrelated events unchanged
- screenshot

### 2. Move by time

Input:

> Move the 2 PM to 4.

Assert geometry, time label, invariants, undo/redo.

### 3. Breathing Room and Tide

Input:

> Give me 20 minutes before the interview and move anything flexible out of the way.

Assert explicit Breathing Room exists, interview remains, safe reflow, no dropped events.

### 4. Signature compound command

Input the full signature sentence.

Assert all actions commit atomically.

### 5. Drag parity

Drag one flexible event.

Assert the same model/history shape as typed move.

### 6. Resize parity

Resize event through UI.

Assert same action and validation behavior as typed duration change.

### 7. Protected conflict

Try to auto-move protected Dinner.

Assert no mutation and inline reason.

### 8. Split and merge

Assert stable resulting IDs/links, no duplicates, exact undo.

### 9. Delay recovery

Input:

> I’m 35 minutes behind. Keep dinner at seven.

Assert Dinner unchanged, legal reflow, one transaction.

### 10. End boundary

Input:

> I’m done at six today.

Assert visible boundary, legal deferral, impossible state explained.

### 11. What-if

Assert preview changes no persisted/current state until `Do it`.

### 12. Mobile and reduced motion

At 390×844:

- no horizontal viewport overflow
- command surface usable
- event content readable
- drag/resize alternatives available
- screenshots

Reduced motion:

- no long travel
- state and causality remain understandable

## Voice QA

### Automated synthetic path

Inject a final browser-recognition transcript through the real voice adapter.

Verify it uses the same command pipeline.

### Physical microphone acceptance

This cannot be replaced by injected text.

On Chrome/macOS, speak naturally:

1. “Make the 2 PM meeting important and red.”
2. “Move the 2 PM to four.”
3. “Give me 20 minutes before the interview.”
4. “I’m 35 minutes behind. Keep dinner at seven.”
5. “Undo that.”

Record:

- raw alternatives
- selected transcript
- interpretation
- calendar result

Report separately:

- Synthetic voice pipeline: PASS/FAIL
- Real microphone acceptance: PASS/FAIL/NOT RUN

Never collapse these into one “voice PASS.”

## Visual release evidence

Save under:

```text
artifacts/tide-release/
```

Required:

1. `01-initial-breathing-day.png`
2. `02-important-red-event.png`
3. `03-breathing-room.png`
4. `04-tide-reflow.png`
5. `05-split-events.png`
6. `06-what-if.png`
7. `07-undo.png`
8. `08-mobile.png`
9. `09-reduced-motion.png`

Also save:

- `results.json`
- Playwright report
- traces on failure
- console/page/request error arrays

## UX acceptance

Fail the release if:

- user must preselect an unambiguous event
- persistent right sidebar remains
- success is communicated mainly through text instead of calendar motion
- unsupported input says “try a simpler change”
- colors are mixed with protection/importance semantics
- events disappear or teleport without trace
- automatic Tide moves protected/fixed events
- what-if mutates real state
- mobile becomes a squeezed desktop layout
- reduced motion becomes unusable
- event text fails contrast

## Performance acceptance

- no persistent animation when tab is hidden
- no layout-thrashing loop
- event move animations remain transform-based
- current-time updates do not rerender the whole tree unnecessarily
- no console errors or React warnings
- no failed app requests
- production build succeeds
- interaction remains responsive during compound reflow

Target smoothness:

- 60fps on a normal laptop
- graceful behavior on lower-power devices
- command action visible feedback in under 150ms
- no CLS from command surface or event transitions
