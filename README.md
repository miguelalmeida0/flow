# Flow

**Voice-first personal computing where conversation directly changes calendars, journals, people, and memories.**

[Live demo ↗](https://miguelalmeida0.github.io/flow/) *(external — leaves GitHub)*

Flow is built around an active spoken loop rather than a command box. Spoken requests update structured application state, clarifications remain contextual, and the visual interface stays directly editable.

<p align="center">
  <img src="./docs/readme/current/00-breathing-week.png" alt="Flow Breathing Week calendar showing a voice-controlled weekly schedule" width="100%">
</p>

<p align="center"><sub><strong>Breathing Week.</strong> A weekly calendar view where Flow preserves editable time blocks while voice remains part of the interaction model.</sub></p>

## Conversation loop

```mermaid
flowchart LR
  SAY(["Speak naturally"]):::actor
  RESOLVE[["Normalize + resolve intent"]]:::system
  CLEAR{"Clear enough?"}:::decision
  CLARIFY(["Spoken clarification"]):::actor
  CONSEQ{"Consequential action?"}:::decision
  PREVIEW["Preview + confirm"]:::guard
  APPLY[["Apply deterministic action"]]:::system
  STATE[("Shared app state")]:::data
  UI(["Editable UI"]):::safe

  SAY --> RESOLVE --> CLEAR
  CLEAR -- "no" --> CLARIFY --> RESOLVE
  CLEAR -- "yes" --> CONSEQ
  CONSEQ -- "yes" --> PREVIEW --> APPLY
  CONSEQ -- "no" --> APPLY
  APPLY --> STATE --> UI
  UI -- "correct · interrupt · undo" --> RESOLVE

  classDef actor fill:#E8F1FF,stroke:#2563EB,color:#0F172A,stroke-width:1.6px;
classDef system fill:#ECFEFF,stroke:#0891B2,color:#0F172A,stroke-width:1.6px;
classDef decision fill:#FFFBEB,stroke:#D97706,color:#0F172A,stroke-width:1.6px;
classDef guard fill:#FFF7ED,stroke:#EA580C,color:#0F172A,stroke-width:1.6px;
classDef safe fill:#ECFDF5,stroke:#059669,color:#0F172A,stroke-width:1.6px;
classDef private fill:#FFF1F2,stroke:#E11D48,color:#0F172A,stroke-width:1.6px;
classDef data fill:#F8FAFC,stroke:#64748B,color:#0F172A,stroke-width:1.6px;
linkStyle default stroke:#94A3B8,stroke-width:1.5px;
```

Natural language is only the input layer. Flow resolves intent, asks for clarification when needed, protects consequential actions, and applies changes to deterministic app state.

## Calendar

Voice-created and voice-edited time blocks remain directly manipulable on screen.

<p align="center">
  <img src="./docs/readme/current/deep-02-calendar.png" alt="Flow Calendar showing the day timeline and scheduled events" width="100%">
</p>

## Journal

Dictation, retained prose, bookmarks, and source-linked moments stay inside the same product rather than opening a separate chatbot.

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

```mermaid
flowchart TB
  VOICE[["Conversation controller"]]:::system
  STATE[("Deterministic shared state")]:::data

  subgraph Surfaces["Living product surfaces"]
    CAL["Calendar<br/>time + commitments"]:::actor
    JOURNAL["Journal<br/>entries + moments"]:::actor
    FRIENDS["Friends<br/>people + relationships"]:::actor
    MEM["Memories<br/>retained context"]:::actor
  end

  UI(["Direct manipulation + voice"]):::safe

  VOICE --> STATE
  STATE --> CAL
  STATE --> JOURNAL
  STATE --> FRIENDS
  STATE --> MEM
  CAL --> UI
  JOURNAL --> UI
  FRIENDS --> UI
  MEM --> UI
  UI -. "contextual follow-up" .-> VOICE

  style Surfaces fill:#F8FAFC,stroke:#CBD5E1,stroke-width:1px
  classDef actor fill:#E8F1FF,stroke:#2563EB,color:#0F172A,stroke-width:1.6px;
classDef system fill:#ECFEFF,stroke:#0891B2,color:#0F172A,stroke-width:1.6px;
classDef decision fill:#FFFBEB,stroke:#D97706,color:#0F172A,stroke-width:1.6px;
classDef guard fill:#FFF7ED,stroke:#EA580C,color:#0F172A,stroke-width:1.6px;
classDef safe fill:#ECFDF5,stroke:#059669,color:#0F172A,stroke-width:1.6px;
classDef private fill:#FFF1F2,stroke:#E11D48,color:#0F172A,stroke-width:1.6px;
classDef data fill:#F8FAFC,stroke:#64748B,color:#0F172A,stroke-width:1.6px;
linkStyle default stroke:#94A3B8,stroke-width:1.5px;
```

- **Calendar** — create, move, rename, protect, defer and recover time by voice or direct manipulation
- **Journal** — dictation, entries, bookmarks and source-linked moments
- **Friends** — people connected across messages, plans, commitments and memories
- **Memories** — retained personal context and compositions
- **Voice loop** — clarification, confirmation, correction, interruption and cancellation without repeating the wake word

## Engineering focus

- deterministic state underneath natural-language input
- accessible keyboard and visual fallbacks
- contextual follow-up and recovery
- explicit confirmation for consequential actions
- responsive behavior across phone, tablet, laptop and wide desktop
- end-to-end verification of interaction state, not only screenshots

## Run locally

```bash
npm ci
npm run dev
```

## Build

```bash
npm run build
```
