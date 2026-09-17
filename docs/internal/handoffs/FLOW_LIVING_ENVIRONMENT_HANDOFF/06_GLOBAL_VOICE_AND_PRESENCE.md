# 06 — Global Voice and Presence

## Product decision

The user should not click the microphone for every command.

The browser release will provide **Flow Live**, an explicit session that the user activates once. While the tab is visible and the session remains active, Flow automatically resumes listening after each completed utterance.

This is not marketed as a system-wide wake-word assistant.

## Voice states

```text
sleeping
requesting-permission
live-idle
listening
interpreting
previewing
committing
recovering
permission-denied
unavailable
```

### Sleeping

No microphone track or speech recognition activity.

### Live idle

Session enabled. The top-right `Flow voice active` indicator is visible. Recognition may be ready/restarting, but the interface is otherwise still.

### Listening

A restrained waveform appears only in the indicator/command dock. Interim transcript appears in the dock.

### Interpreting

Target focus may preview. Domain mutation has not occurred.

### Committing

One validated action transaction commits, then the visual choreography runs.

## Activation and privacy

- user activates Flow Live explicitly once;
- active state is always visible;
- `Escape`, clicking the indicator, or saying “Flow sleep” stops it;
- suspend/stop recognition when the tab is hidden;
- do not store raw audio;
- do not imply local-only recognition if the browser service may use a remote recognizer;
- typed input remains available without microphone permission.

## Continuous browser behavior

Chrome speech recognition may stop after an utterance even with `continuous` enabled.

Implement a controlled restart loop:

- one recognizer instance at a time;
- restart only when session is active, tab is visible, and no mutation is processing;
- short bounded backoff after recoverable errors;
- no restart after permission denial or user stop;
- teardown on unmount.

## Language and transcript quality

Preserve the explicit supported locale and semantic alternative selection already developed for Calendar.

All final voice transcripts feed the same global interpreter used by typing.

```text
microphone
  → candidates
  → semantic candidate selection
  → global intent routing
  → typed LifeAction[]
  → shared transaction pipeline
```

## Interim preview

Interim speech can control **visual preview only**.

Example:

> “Turn that…”

Focused capture rises.

> “…into a plan.”

Tide path preview begins.

Only the final valid transcript commits.

If final speech differs, preview reverses without history mutation.

## Navigation vocabulary

The following should execute locally and immediately:

- Home
- Calendar
- Inbox
- Plans
- People
- Now
- What fits right now?
- Go back
- Undo
- Redo
- Stop listening / Flow sleep

## Global context

The interpreter receives a small explicit context object:

```text
current route
focused entity
last created entity
last capture
active plan
current calendar event
next calendar event
preview state
```

Do not pass entire UI state through arbitrary component props.

## Wake phrase

A true always-on local wake word is out of scope for the browser release.

A future native shell may add it. Do not build a fake wake word by continuously sending ambient speech to a remote service while claiming privacy.

## Error UX

Errors are concise and local:

- “Microphone access is blocked.”
- “I didn’t catch that clearly.”
- “Two plans match. Which one?”
- “Flow Live paused while this tab is hidden.”

No generic assistant error panel.
