# Flow

[Live Flow ↗](https://miguelalmeida0.github.io/flow/) *(external — leaves GitHub)*

**Voice-first personal computing where conversation directly changes calendars, journals, people, and memories.**

Flow is built around an active spoken loop rather than a command box. The user wakes the assistant, speaks naturally, receives spoken clarification when needed, and changes structured application state without repeatedly reaching for the screen.

## Calendar

Voice-created and voice-edited time blocks remain directly manipulable on screen.

<p align="center">
  <img src="./docs/readme/current/deep-02-calendar.png" alt="Flow Calendar showing the day timeline and scheduled events" width="100%">
</p>

## Journal

Dictation, retained prose, bookmarks, and source-linked moments live in the same voice-first environment.

<p align="center">
  <img src="./docs/readme/current/deep-03-journal.png" alt="Flow Journal workspace" width="100%">
</p>

## Friends

People are first-class entities connected to plans, messages, commitments, voice notes, and shared memories.

<p align="center">
  <img src="./docs/readme/current/deep-04-friends.png" alt="Flow Friends workspace" width="100%">
</p>

## Memories

Personal context and retained moments stay connected to the rest of the system instead of living in an isolated archive.

<p align="center">
  <img src="./docs/readme/current/deep-05-memories.png" alt="Flow Memories workspace" width="100%">
</p>

## Product model

- **Calendar** — voice-created and voice-edited time blocks
- **Journal** — dictation and source-linked moments
- **Friends** — people connected across messages, plans, commitments and memories
- **Memories** — retained personal context and compositions
- **Voice loop** — spoken clarification, confirmation, correction, interruption and cancellation without repeatedly reaching for the screen

## Engineering focus

- deterministic state underneath natural-language input
- accessible keyboard and visual fallbacks
- interruption, correction and cancellation
- contextual follow-up without repeating the wake word
- explicit confirmation for consequential actions
- responsive behavior across phone, tablet, laptop and wide desktop
- visual reward without turning the app into a dashboard

## Run locally

```bash
npm ci
npm run dev
```

## Build

```bash
npm run build
```
