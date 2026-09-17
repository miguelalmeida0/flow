# Flow Tide — Current State and Known Gap

## Repository

Expected local path:

```text
~/Downloads/flow-voice-calendar
```

The repository may not have Git metadata. Do not initialize Git or claim a commit unless `.git` exists.

## Verified foundation

Recent reported baseline:

- strict TypeScript build passes
- lint passes
- 181 automated tests pass
- deterministic English command corpus is extensive
- typed and synthetic final-voice transcript paths exist
- storage/history/scheduling invariants have been tested
- release evidence harness exists

Re-run the repository to establish the exact current counts before editing.

## Real observed product gap

The current product remains too close to:

```text
select event
→ press microphone
→ say a low-level command
→ update one rectangle
```

A user reported that a selected event can work, while a global microphone command such as:

> “Move the 2 PM to 4 PM.”

does not behave automatically as expected.

Treat this as a product and reference-resolution gap, not as permission to discard the tested parser/scheduler.

## Current UX gap

The current implementation has:

- a white conventional day grid
- a persistent right-side feedback/status panel
- verbose failure explanations
- a permanently visible command bar
- calendar events that primarily behave like ordinary cards
- little automatic adaptation
- selection-dependent interaction

The next release must transform this into the Breathing Day/Tide experience without losing reliability.

## Voice truthfulness

Synthetic final transcript tests prove:

```text
recognized text → controller → interpreter → scheduler
```

They do not prove:

```text
human speech → browser recognition → correct transcript
```

Keep a separate physical-microphone gate.

## Product target

The finished release should feel valuable even with the microphone disabled.

- Dragging is best for one direct move.
- Typing/voice is best for compound constraints and batch edits.
- Tide automatically resolves safe schedule consequences.
- The visual calendar is the feedback.
