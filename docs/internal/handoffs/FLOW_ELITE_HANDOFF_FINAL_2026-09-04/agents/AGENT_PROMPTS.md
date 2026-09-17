# Copy/Paste Agent Prompts

## Agent A — Lead Architecture Audit

```text
You are the Lead Principal Engineer for Flow. Read this entire handoff before touching code, especially 00_START_HERE.md, 01_PRODUCT_MANDATE.md, 02_FINAL_DESIGN_LOCK.md and engineering/ARCHITECTURE.md.

Your first task is AUDIT ONLY. Do not change production code.

Map:
- routes
- global state
- calendar state/model
- voice parsing and command execution
- undo/redo
- persistence
- animation infrastructure
- mascot assets
- weather integrations
- design token ownership
- tests

Then propose the smallest migration that supports the LOCKED final home design and the shared command → world action → senses → instincts pipeline.

Hard constraints:
- no sidebar on home
- no new visual direction
- no scenic background
- no paid LLM dependency for core behavior
- voice and pointer fallback must share command primitives
- business logic outside React components
- preserve working behavior

Output:
1. current architecture map
2. risks
3. proposed boundaries
4. file-level migration plan
5. dependency-ordered tickets
6. no code changes
```

## Agent B — Final UI Implementation

```text
Implement the locked Flow home UI using design/FLOW_FINAL_LOCKED_REFERENCE.png as the visual source of truth.

Do NOT redesign it.

Use design/DESIGN_SYSTEM.md and design/tokens.css.

Required composition:
- Flow wordmark + restrained subline
- centered date/greeting/context line
- Today lens
- Focus lens
- Weather & Outfit lens
- People lens
- Good to know lens
- approved soft mascot lower-left
- one mascot prompt
- persistent voice command bar bottom-center
- Today / Tomorrow / This Week bottom-right

Explicitly forbidden:
- sidebar
- scenic/photo background
- duplicate header weather
- top listening chip
- handwritten slogans
- Focus/Relax/Travel tiles
- glassmorphism/neon
- generic gradients

Do not invent new product copy unless data requires it. Build components against view-model interfaces; do not embed business logic.

At completion run lint, typecheck, tests and build. Return screenshots at the reference viewport plus mobile/tablet breakpoints.
```

## Agent C — Time / Calendar / Focus

```text
Own Today + Focus behavior.

Build a true temporal model, not a list of calendar cards.

Requirements:
- vertical time rail
- current-time marker
- next anchor emphasis
- open time represented as space
- past events de-emphasized
- available focus minutes calculated from actual schedule
- requested focus duration capped/proposed against free window
- Today/Tomorrow/This Week + named-day voice navigation
- undo/redo where state changes occur

Voice and any fallback controls must call the same command primitives.

Do not alter the locked visual system outside what is necessary to make the timeline more legible.
```

## Agent D — Weather / Outfit / Instincts

```text
Implement WeatherSense, outfit recommendations and the initial Flow Instinct Engine.

No LLM for reasoning.

Weather target: approximately 14 days when the selected free provider supports it.

Normalize:
- temperature
- feels-like
- precipitation probability/window
- condition
- wind
- UV
- sunrise/sunset

Build deterministic outfit rules and initial instincts:
- umbrella
- temperature later
- UV
- daylight
- good-weather/free-window
- focus fit

Weather & Outfit copy is decision-first, concise and human.

Never duplicate raw weather in the header.

Unit test boundaries thoroughly.
```

## Agent E — Mascot

```text
Implement the approved soft cream mascot from design/FLOW_FINAL_LOCKED_REFERENCE.png.

The mascot is an ambient contextual guide, not a chatbot.

Create a small finite-state behavior system for:
idle, listening, acknowledging, focus, completion, sleepy, cold, sunny/hot, rain, waiting.

Rules:
- one bubble max
- behavior before text
- no bouncing loop
- no constant speech
- do not compete with the command bar
- use Senses/Instinct outputs, not duplicated logic

Preserve the exact calm visual tone of the locked reference.
```

## Agent F — Voice Command System

```text
Audit and extend the existing voice system so the locked home can be operated without clicking.

Core commands:
Today / Tomorrow / This week / Friday / Go back
What should I wear?
Do I need an umbrella?
What's next?
Give me 20 minutes.
Give me 40 minutes.
Start focus.
Stop focus.
Show Sarah.
Undo.
Redo.

Architecture rule:
voice → parsed intent → shared command primitive → state transition.

Do not create a second mutation path for voice.

Routine commands must not require an LLM. Use deterministic parsing first; only preserve an optional low-confidence fallback boundary if one already exists.
```

## Agent G — QA / Ruthless Product Verification

```text
Do not change code initially.

Audit the implementation against:
- design/FLOW_FINAL_LOCKED_REFERENCE.png
- 02_FINAL_DESIGN_LOCK.md
- 03_UX_BEHAVIOR_SPEC.md
- qa/ACCEPTANCE_AND_QA.md

Verify visual fidelity, 3-second comprehension, voice parity, temporal correctness, weather/outfit boundary cases, instinct deduplication, mascot restraint, responsive behavior, undo/redo and accessibility.

Click/voice every meaningful CTA/command and verify UI + command + payload + state + persisted result + undo where applicable.

Report blockers in severity order with exact reproduction steps and evidence.
```
