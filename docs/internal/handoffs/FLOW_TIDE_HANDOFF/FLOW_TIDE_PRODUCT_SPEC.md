# Flow Tide — Product Specification

## One-line product

**A living calendar that automatically reshapes itself around real life, while every event remains editable like a physical game piece.**

## Why the current interaction is insufficient

Selecting an event, pressing a microphone, and saying “move this to four” is slower than dragging.

Voice becomes valuable only when the instruction contains meaning, groups, multiple operations, or constraints:

- “Make the 2 PM meeting important and red, give me 20 minutes before it, and move anything flexible out of the way.”
- “I’m 35 minutes behind. Keep dinner at seven and push low-priority work to tomorrow.”
- “Clear two to four without moving the interview.”
- “Make tomorrow less fragmented and keep lunch.”

Flow must therefore solve the day, not merely expose voice shortcuts for rectangle manipulation.

## Product pillars

### 1. Zero-selection understanding

Resolve clear references automatically:

- start time: “the 2 PM”
- title: “deep work”
- type: “the interview”
- position: “my next meeting”
- state: “the current event”
- color: “every red meeting”
- label: “all client calls”
- relative anchor: “the event before lunch”

Selection can resolve “this,” but is never required when context is already sufficient.

Clarify only genuine ambiguity.

### 2. Full event editing

Every event is editable through one shared action system.

Required properties:

- title
- date
- start
- duration
- user color
- labels
- importance
- mobility
- protected state
- status
- buffer before
- buffer after
- optional linked group for split events

Color, importance, mobility, and protection are independent.

A red event is not automatically important.
An important event is not automatically fixed.
A protected event may retain any user color.

### 3. Tide automatic reflow

Tide recomputes only the remaining safe flexible schedule.

Fixed and protected events act as immovable anchors.
Important/heavy events resist movement.
Light events can move.
Fluid events can move, split, or batch when explicitly allowed.

Tide must remain deterministic, explainable, testable, and reversible.

### 4. Breathing room is real

Empty space is not a rendering accident.

A Breathing Room object has:

- start
- duration
- optional label
- protection
- reason/source
- visible wave representation

It participates in validation and scheduling.

Examples:

- “Give me 20 minutes before the interview.”
- “Keep half an hour free after lunch.”
- “I need breathing room before I leave.”

### 5. Play without gamification

Events behave like physical pieces:

- paint
- stretch
- anchor
- split
- merge
- defer
- complete
- preview
- rewind

No points, streaks, badges, confetti, or childish reward mechanics.

## Release scope

## P0 — Must ship

### A. Breathing Day redesign

- Dark calm canvas.
- Thin time spine.
- Floating event blocks.
- Current-time marker.
- Density state: Open, Calm, Tight, Overloaded.
- Breathing Room wave.
- No right sidebar.
- Collapsible command surface.
- Inline clarification/error.
- Desktop and mobile.

### B. Zero-selection resolver

Resolve:

- exact start times
- times with AM/PM and number words
- events overlapping a named time
- current event
- next event
- previous event
- title and title aliases
- labels
- colors
- event status
- relative anchors such as before/after lunch

Example:

> “Move the 2 PM to 4.”

If exactly one event begins at 2 PM, move it.
If two events qualify, ask one focused question.

### C. Event property editing

Support compound updates:

- rename
- recolor
- add/remove label
- important/normal
- mobility
- protect/unprotect

Required example:

> “Make the 2 PM meeting important and red.”

One atomic transaction.
One undo step.

### D. Event lifecycle editing

- create
- move
- resize
- defer
- delete with confirmation
- mark done
- reopen
- undo
- redo
- reset

### E. Direct manipulation parity

- drag to move
- resize handle to change duration
- event quick action for done/protect
- all direct interactions dispatch the same domain actions as voice/type
- keyboard alternatives for drag/resize

### F. Tide reflow after user actions

Reflow after:

- create
- move
- resize
- protect
- unprotect
- breathing-room creation
- delay declaration
- active-event extension
- early completion
- end-of-day boundary

### G. Safe automation

Auto-apply only:

- local flexible-event movements
- no destructive change
- no fixed/protected movement
- valid schedule
- one clear deterministic result

Always provide immediate undo.

## P1 — Must ship for this portfolio release

### A. Compound day transformation

Example:

> “Make the 2 PM meeting important and red, give me 20 minutes before it, and move anything flexible out of the way.”

### B. Split and merge

- “Split deep work into two 45-minute sessions.”
- “Put the second one after lunch.”
- “Combine email, expenses, and admin.”

Maintain stable IDs and linked ancestry.

### C. Batch editing

- “Move every red meeting to Thursday.”
- “Protect all interviews.”
- “Make all admin tasks gray.”
- “Move flexible work after lunch.”

### D. What-if mode

- “What if I add a workout at five?”
- Render ghost positions.
- Do not commit.
- “Try six instead.”
- “Do it.”
- “Cancel the preview.”

### E. End-of-day boundary

- “I’m done at six.”
- Render a visible boundary.
- Tide moves only legal flexible work.
- If impossible: concise explanation and closest safe alternative.

### F. Completion and reclaimed time

- “Done.”
- Release remaining time.
- Tide may keep it open or pull one suitable flexible task forward.
- The user must see where reclaimed time came from.

### G. What changed

- “What changed?”
- Show ghost origin positions and a concise local summary.
- No chat transcript or audit sidebar.

## P2 — Explicitly out of scope for this release

- Google/Apple/Outlook sync
- accounts or backend
- multi-user shared calendar behavior
- recurrence editor
- full week/month views
- time-zone engine
- multilingual deterministic parser
- runtime GPT/LLM
- autonomous email or meeting communication
- notification service
- mobile native app

Do not pull P2 into the mission while P0/P1 remain incomplete.

## Domain vocabulary

### Importance

- normal
- important
- critical

Importance affects Tide movement cost, not immovability.

### Mobility

- anchored: cannot move automatically
- heavy: can move, high penalty
- light: can move freely
- fluid: can move and participate in explicit split/batch operations

### Protection

Boolean safety guarantee. Protected events cannot move automatically regardless of mobility.

### Color

User-owned visual classification:

- neutral
- red
- orange
- yellow
- green
- cyan
- blue
- indigo

Avoid purple as a default. Color cannot be the sole accessibility signal.

### Status

- planned
- active
- done
- cancelled

## Trust policy

| Change | Default behavior |
|---|---|
| Rename, color, label | Apply immediately |
| Importance or mobility | Apply immediately with undo |
| Move local flexible event | Apply immediately with undo |
| Automatic Tide movement of local flexible work | Apply immediately with undo |
| Create breathing room | Apply if valid; otherwise explain conflict |
| Delete/cancel | Confirm |
| Move fixed/protected event | Preview or ask |
| Batch destructive operation | Preview and confirm |
| Shared/provider event | Out of scope; never pretend |

## Density states

Compute from concrete schedule geometry.

### Open

- meaningful unscheduled capacity
- no sustained back-to-back run
- requested buffers preserved

### Calm

- day fits
- limited fragmentation
- at least one useful gap remains

### Tight

- little slack
- long back-to-back run or fragmented short gaps
- no direct conflict yet

### Overloaded

- remaining work cannot fit inside constraints
- required breathing room or boundary cannot be preserved

Do not invent a wellness score.

## Signature demonstration

Start with a real day.

Command:

> “Make the 2 PM meeting important and red, give me 20 minutes before it, and move anything flexible out of the way.”

Then:

> “Split deep work into two sessions and keep one before lunch.”

Then:

> “I’m 30 minutes behind. Keep dinner.”

Then:

> “What changed?”

The product must look complete, not like a sequence of disconnected demos.
