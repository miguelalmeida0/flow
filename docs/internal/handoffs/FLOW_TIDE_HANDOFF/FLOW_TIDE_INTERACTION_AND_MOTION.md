# Flow Tide — Interaction and Motion Specification

## Motion principle

Motion is not decoration.

Every transition must communicate:

1. what changed
2. what caused it
3. where the object went
4. what remained fixed
5. whether the change is committed or only proposed

No confetti, bouncy toys, spinning, elastic overshoot, particle explosions, or arbitrary morphing.

## Shared interaction pipeline

These inputs must dispatch the same typed actions:

- typed command
- final voice transcript
- drag
- resize handle
- quick action
- keyboard action
- automatic Tide proposal

The renderer does not invent behavior per input method.

## Signature interactions

### 1. Paint / recolor

Command:

> “Make the 2 PM meeting red.”

Choreography:

- resolve event
- raise it 2–4px in visual depth
- move a color wash left-to-right through the surface
- update border and marker
- settle

Duration: 320–420ms.

Do not crossfade the entire card instantly.

### 2. Importance

Command:

> “Make it important.”

Choreography:

- small importance marker appears
- title gains slightly stronger weight
- event’s Tide movement cost changes
- no automatic recolor
- no pulse loop

Duration: 220–320ms.

### 3. Protect / anchor

Command:

> “Protect lunch.”

Choreography:

- small amber anchor/shield descends into place
- a connector/mooring to the time spine becomes firm
- other events may reflow around it
- protected event remains visually still

Unprotect reverses this movement.

Duration: 380–520ms.

### 4. Move

Drag or command:

> “Move the 2 PM to four.”

Choreography:

- origin remains as a faint ghost
- event follows a curved Tide path to its destination
- the path fades as it arrives
- affected flexible events move in coordinated order
- fixed/protected events remain still

Duration: 520–760ms.

Use layout animation/FLIP and transforms, not top/left frame-by-frame animation.

### 5. Resize / stretch

Command:

> “Make it 45 minutes.”

Choreography:

- bottom edge stretches or contracts
- time label updates continuously
- nearby flexible events begin reacting before completion
- breathing gaps compress/expand
- validation prevents illegal overlap

Duration: 420–620ms.

### 6. Create Breathing Room

Command:

> “Give me 20 minutes before the interview.”

Choreography:

- target event remains focused
- a teal point appears before it
- the point draws a low wave across the opening gap
- flexible events flow away
- label appears only after enough space exists

Duration: 600–850ms.

### 7. Split

Command:

> “Split deep work into two sessions.”

Choreography:

- thin division appears
- event separates into two stable blocks
- linked ancestry is represented by a very subtle temporary thread
- follow-up can move “the second one”

Duration: 480–650ms.

### 8. Merge

Command:

> “Combine email and admin.”

Choreography:

- blocks move toward a legal shared slot
- surfaces visually align
- titles condense into one batch title
- count appears: `3 items`
- original IDs remain in the event-history payload

Duration: 520–700ms.

### 9. Defer

Command:

> “Move roadmap to tomorrow morning.”

Choreography:

- block lifts
- travels toward date heading or a future-day portal
- disappears with a faint destination label
- a small origin trace remains until commit settles

Duration: 520–720ms.

### 10. Complete early

Command:

> “Done.”

Choreography:

- current event contracts into a completion mark on the spine
- unused time becomes visible
- Tide may keep it open or move one safe task forward
- reclaimed minutes are briefly labeled

Duration: 420–700ms.

### 11. What-if

Command:

> “What if I add a workout at five?”

Choreography:

- proposed event uses a dashed or translucent surface
- current events show ghost destination positions
- no persistent state changes
- `Do it` solidifies proposed positions
- `Cancel` reverses to the current schedule

No blur overlay. The actual calendar remains visible.

### 12. Undo/redo

Undo must reverse the original transaction’s visual changes.

Compound action undo is one operation.

Do not teleport to an old snapshot.

## Tide automatic reflow choreography

When a change makes the remaining day invalid:

1. fixed/protected objects subtly assert their anchors
2. candidate flexible objects lift
3. origin ghosts remain
4. Tide path(s) draw
5. objects move in causal order
6. breathing room expands/contracts
7. density state changes
8. status settles:
   - `Recovered 35m`
   - `2 tasks moved to tomorrow`
   - `Finish unchanged`

The summary should disappear after a short interval and remain accessible through “What changed?”

## Timing tokens

Suggested defaults:

- immediate feedback: 80–140ms
- micro state change: 180–280ms
- color/label: 320–420ms
- single event move: 520–700ms
- compound reflow: 650–950ms
- history replay: preserve event-relative timing, cap total at about 2.5s

Easing:

- small state: ease-out
- event travel: critically damped spring
- wave: smooth ease-in-out
- no large overshoot

## Interruptibility

- A new command can interrupt a current animation.
- Pause/reduced motion cannot corrupt schedule state.
- The domain transaction commits independently from animation completion.
- Rendering always converges to committed state.
- No orphaned animation promises.

## Reduced motion

Replace travel with:

- immediate destination placement
- 150–220ms border/background emphasis
- origin marker if needed
- text summary for “what changed”

Do not remove causality entirely.

## Direct manipulation

### Drag

- drag event body to move
- snap in 5-minute increments visually; 15-minute default keyboard increments
- show destination time while dragging
- fixed/protected events resist and explain why
- commit through `MoveEventAction`

### Resize

- bottom-edge handle
- minimum 15 minutes
- show live duration
- commit through `ResizeEventAction`

### Keyboard

- arrow: focus neighboring event
- `Shift+ArrowUp/Down`: move 15 minutes
- `Alt+ArrowUp/Down`: resize 15 minutes
- `P`: protect/unprotect
- `Space`: start/complete current event when safe
- `Cmd/Ctrl+Z`: undo
- `Cmd/Ctrl+Shift+Z`: redo
- `/` or `Cmd/Ctrl+K`: open command surface

Do not expose keyboard shortcuts visually until requested.
