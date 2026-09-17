---

# FILE: 00_START_HERE.md

# FLOW — Elite Handoff / Final Design Lock

**Snapshot:** 2026-09-04
**Status:** product direction + home UI are locked for implementation
**Source of visual truth:** `design/FLOW_FINAL_LOCKED_REFERENCE.png`

This package consolidates the prior Flow product-strategy handoff and the final UX/UI direction approved after the design exploration. It is meant to be attached to a fresh ChatGPT/Codex/agent session so the next agent can continue without re-litigating the product thesis or redesigning the home screen.

## Read in this order

1. `01_PRODUCT_MANDATE.md`
2. `02_FINAL_DESIGN_LOCK.md`
3. `03_UX_BEHAVIOR_SPEC.md`
4. `design/DESIGN_SYSTEM.md`
5. `design/tokens.css`
6. `engineering/ARCHITECTURE.md`
7. `product/SENSES_AND_INSTINCTS.md`
8. `product/TIME_TRAVEL_WEATHER_OUTFIT.md`
9. `product/MASCOT_BEHAVIOR.md`
10. `engineering/IMPLEMENTATION_SEQUENCE.md`
11. `qa/ACCEPTANCE_AND_QA.md`
12. `agents/AGENT_PROMPTS.md`
13. `13_RUNBOOK.md`

## Hard lock

Do **not** generate a new visual direction. Do **not** replace the palette. Do **not** add a sidebar. Do **not** reintroduce a scenic/photo background. Do **not** duplicate weather in the header. Do **not** add generic motivational handwriting, “AI” slogans, mode tiles, or persistent live/status chrome.

The reference image is the visual source of truth. If prose and pixels ever conflict, the reference image wins unless this handoff explicitly calls out a behavior that is not visually representable in a static mock.

## Final home composition

The home is one calm voice-first scene with five context lenses:

**Today → Focus → Weather & Outfit → People → Good to know**

Under them:

**Mascot → single proactive prompt → persistent command bar → Today / Tomorrow / This Week time control**

This is not a five-card dashboard in the product sense. These are five stable semantic zones inside one Flow world. Their content may adapt, but their spatial positions remain stable enough to build user memory.

## North-star reaction

> “It noticed the small thing I was about to think about myself.”

The product should feel futuristic because it is context-aware, immediate, voice-native, reversible, calm and coherent—not because it contains sci-fi decoration or constant generative AI.


---

# FILE: 01_PRODUCT_MANDATE.md

# Product Mandate — Flow as a Living Personal Environment

## Mission

Flow is not a voice-controlled calendar. It is a **living personal environment** in which the user speaks naturally and the world reorganizes around intent.

The interface should make ordinary life feel lighter by continuously translating context into small, useful decisions.

Examples:

- “It will be colder when you come home. Take the warmer jacket.”
- “Rain starts around when you leave. Umbrella is a good idea.”
- “You have 28 clear minutes before lunch.”
- “Sunday is the first good drying day.”
- “You asked for 40 minutes, but you only have 28 before the next commitment.”
- “If you want daylight, go before 19:48.”

## Core product thesis

Traditional software:

`Human → app → navigation → screen → button → form → result`

Flow:

`Human intent → voice command → shared state changes → world responds`

Voice is the primary command language. The visual world is the source of truth and the user’s orientation layer.

## Non-negotiable principles

### One world, not a set of pages

Calendar, focus, people, weather, outfit guidance, notes, routines and future utilities should feel like different aspects of the same environment.

### Voice first; clicking never required

Every core action must be achievable by voice. Visible controls may exist as accessible fallback affordances, but no primary flow may depend on clicking.

### The product must remain useful without an LLM

Core intelligence is built from:

- state machines
- deterministic commands
- rule systems
- free/public data where appropriate
- calendar/time arithmetic
- local preferences
- browser/device context

LLMs are optional later for genuinely ambiguous requests—not the default execution path.

### Useful surprise over feature count

Optimize for **useful surprises per session** rather than number of modules, commands or animations.

### Information becomes physical and contextual

The long-term world can support:

- summon
- dismiss
- move
- time travel
- throw into the future
- combine objects
- focus transformations
- rooms/modes
- little machines / routines
- undo / redo

But no future interaction may break the calm, immediately understandable home surface.

## Anti-goals

Flow is not:

- a ChatGPT wrapper
- a calendar skin
- a Notion clone
- an AI dashboard
- a card wall
- a notification machine
- a weather app
- a life-coach app
- a Pinterest board
- sci-fi concept art
- a set of disconnected mini-apps

## 60-second north-star demo

1. User opens Flow.
2. Flow immediately communicates the current free window and next anchor.
3. User: “Tomorrow.”
4. The world shifts to tomorrow. Weather, timeline, outfit, people and instincts update together.
5. User: “What should I wear?”
6. Flow answers briefly using deterministic weather/outfit logic.
7. User: “Give me 40 minutes to work.”
8. Flow detects only 28 available minutes before lunch and proposes 28.
9. User: “Do it.”
10. Focus state begins; irrelevant context quiets, but the user never loses temporal orientation.
11. User: “Undo.”
12. State returns cleanly.

If that sequence is not delightful and obvious, stop adding features and improve it.


---

# FILE: 02_FINAL_DESIGN_LOCK.md

# Final Design Lock

## Locked reference

`design/FLOW_FINAL_LOCKED_REFERENCE.png`

The file checksum is stored beside it in `design/FLOW_FINAL_LOCKED_REFERENCE.sha256`.

## What is locked

### Background

- flat warm **marfim / ivory**
- no scenic background image
- no mountains
- no room photography
- no decorative gradients as the primary background
- no glassmorphism wallpaper

Very subtle ambient tint changes are allowed later for time/weather, but never enough to read as a scene or illustration.

### Header

Keep the header sparse:

- Flow wordmark top-left
- short restrained brand line beneath it
- centered date above the greeting
- large serif greeting
- one-line situational summary beneath the greeting

Do not repeat weather in the header; weather belongs in the Weather & Outfit lens.

### Main semantic zones

Stable left-to-right order:

1. **Today**
2. **Focus**
3. **Weather & Outfit**
4. **People**
5. **Good to know**

These zones must visually use different internal grammars so they do not look like five copies of one calendar card.

### Bottom

- mascot at lower-left
- one short proactive prompt beside mascot
- command bar centered
- `Today / Tomorrow / This Week` time-travel control lower-right

The time control stays. It doubles as a visual state indicator and optional fallback; voice remains primary.

## Elements explicitly rejected and permanently removed

Do not reintroduce:

- top-right duplicate weather summary
- top “Listening…” status chip
- “Live — everything in flow” footer status
- handwritten slogans such as “Small steps, brighter days”
- Focus / Relax / Travel mode buttons at the bottom
- persistent sidebar navigation
- scenic photographic backgrounds
- decorative AI sparkle/glow everywhere
- redundant cards showing the same data twice
- motivational copy with no operational value

## UX hierarchy

The page should answer these questions in this order:

1. **Where am I in the day?**
2. **How much usable time do I have now?**
3. **What comes next?**
4. **What should I know about the physical world?**
5. **Who matters soon?**
6. **Is there one useful thing Flow noticed for me?**

The visual hierarchy—not text volume—must communicate this.


---

# FILE: 03_UX_BEHAVIOR_SPEC.md

# UX Behavior Specification

## Three-second comprehension target

Within three seconds of opening home, a first-time user should understand:

- this is **today**
- the current/available time window
- the next anchor
- the main weather/outfit recommendation
- whether a person/meeting needs attention
- the single highest-value Flow instinct
- that they can speak to Flow from the bottom command surface

## Stable spatial memory

Stable zones prevent cognitive churn:

- left = time/today
- left-center = current focus opportunity
- center = physical context / outfit
- right-center = people
- right = ambient intelligence
- bottom-center = voice
- bottom-right = time scope
- bottom-left = mascot/proactive cue

Content can adapt inside a zone. The entire layout should not randomly reshuffle every session.

## Today lens

The Today lens must be the easiest part of the design to read.

Required structure:

- real vertical time axis
- visible time labels
- event start/end times
- a visible current-time marker when relevant
- open time shown as space, not as a fake event
- the **next anchor** visually distinguishable
- past events muted
- future events readable but calmer than the next anchor
- event category accents are subtle and semantic

Recommended semantics:

- blue: focus / deep work
- orange: food / anchor / appointment
- violet: creative / review
- green/teal: people / social coordination
- neutral gray: open time / passive context

The timeline should never look like a stack of unrelated cards.

## Focus lens

Purpose: answer **“What can I use right now?”**

The ring is not decorative progress. It represents available usable time before the next anchor.

Primary text hierarchy:

- `28 min`
- `of deep work time`
- `before lunch`

The most useful contextual explanation may appear beneath the ring.

Voice examples:

- “Start focus.”
- “Give me 20 minutes.”
- “I need 40 minutes.”
- “Stop focus.”
- “Undo.”

If a requested duration exceeds available time, Flow proposes the available window.

## Weather & Outfit lens

Decision first, data second.

The lens must communicate:

1. recommendation: `Light layers should be enough.`
2. visual outfit suggestion
3. temperature / condition
4. only the weather details that materially change the recommendation

Do not dump telemetry.

Do not duplicate the same weather facts elsewhere on the screen.

## People lens

People earn space only when they are temporally relevant.

Useful triggers:

- meeting soon
- follow-up required
- shared plan today
- a voice note would be useful
- a commitment with that person is at risk

When no person is relevant, this zone may show a quiet empty state or another higher-value people context. Do not manufacture content just to fill the card.

## Good to know lens

This is the output of the Instinct Engine, not a generic insights feed.

Rules:

- one primary instinct at a time
- up to three quiet secondary signals
- sort by usefulness, urgency and confidence
- never repeat information already obvious elsewhere
- no push-notification tone
- no alarming language unless truly warranted

Examples:

- Great window for deep work
- UV is moderate
- Low chance of rain
- Sunset at 19:48

## Mascot

Mascot has one UX responsibility: embody the most useful intervention without becoming a talking head.

Use one short bubble maximum.

Good:

> “You’ve got a clear 28 minutes. Want to focus on your project?”

Bad:

> “Hello! I am Flow, your AI assistant. I noticed that according to your calendar…”

## Voice command surface

The bottom command bar is the primary control plane.

Resting state:

`Ask Flow or give a command…`

Listening state should change **inside this bar** only; do not add a second top listening chip.

States:

- idle
- listening
- parsing
- previewing a change
- committed
- recoverable error

Every committed change should support undo when technically possible.

## Time scope control

Keep:

- Today
- Tomorrow
- This Week

Voice equivalents:

- “Today.”
- “Tomorrow.”
- “This week.”
- “Friday.”
- “Next weekend.”
- “Go back.”

The visual control shows where the user is in time even if navigation happened by voice.


---

# FILE: design/DESIGN_SYSTEM.md

# Flow Final Design System

## Design character

Keywords:

**marfim, quiet, editorial, breathable, kind, precise, soft, modern, trustworthy**

Avoid:

**neon, black selected pills, purple AI default, glassmorphism, scenic stock photography, large gradients, generic “AI” glows, dense dashboard chrome, heavy shadows**

## Typography

Recommended implementation pair:

- Display / editorial: `Playfair Display`, 400–500
- UI/body: `Inter`, 400–600

Fallbacks:

```css
--font-display: "Playfair Display", "Times New Roman", Georgia, serif;
--font-ui: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

Do not use decorative handwritten fonts.

### Type scale

- page greeting: 56px / 1.02, weight 400
- card title: 24px / 1.2 display serif
- large metric: 42–48px / 1.0 display serif
- primary body: 16px / 1.45
- secondary body: 14px / 1.4
- eyebrow/date: 13px, uppercase, 0.08em tracking
- tiny metadata: 12px / 1.35

Desktop scaling can use `clamp()` but preserve ratios.

## Layout

Reference canvas: **1672 × 941**.

Approximate desktop structure:

- outer horizontal margin: 48–56px
- top brand area: 34–50px from top
- greeting begins around 118px from top
- main lens row begins around 244px
- main lens row height: ~460px
- inter-card gap: 12–16px
- bottom command bar y: ~798px
- bottom time switch y: ~800px

Recommended grid at reference width:

```text
Today        356px
Focus        288px
Weather      298px
People       286px
Good to know 274px
Gaps          14px x 4
```

Treat these as fidelity targets, not rigid responsive constants.

## Card anatomy

- background: warm white, slightly brighter than page
- border: 1px low-contrast warm neutral
- radius: 24px
- padding: 22–26px
- shadow: extremely restrained
- no nested card explosion
- use separators only when they improve scanning

Cards must differ internally:

- Today = timeline rail
- Focus = ring / current-time opportunity
- Weather & Outfit = decision + visual row
- People = avatars + time relevance
- Good to know = concise instinct list

This asymmetry is deliberate; it prevents the “all cards are the same calendar” failure.

## Iconography

Use simple line icons with consistent optical weight.

- 1.75–2px stroke
- rounded caps
- no filled emoji-style UI icons
- accent colors may identify semantic categories

## Shadows

Very subtle only:

```css
box-shadow:
  0 1px 2px rgba(35, 43, 55, .025),
  0 12px 32px rgba(35, 43, 55, .045);
```

Avoid floating, glowing, “hologram” treatment.

## Motion

Motion communicates state changes.

- micro feedback: 120–180ms
- card/content transition: 220–320ms
- time-travel scene transition: 420–650ms
- ease: soft cubic-bezier, no springy overshoot by default

No animation solely for decoration.


---

# FILE: product/SENSES_AND_INSTINCTS.md

# Flow Senses & Instinct Engine

## Mental model

**Senses answer: “What is true?”**
**Instincts answer: “What useful conclusion follows?”**

This is deterministic infrastructure, not an AI-agent framework.

## Initial senses

### TimeSense

- local date/time
- daypart
- timezone
- current time scope

### CalendarSense

- current event
- next event
- next anchor
- free windows
- overloaded periods
- requested focus duration compatibility

### WeatherSense

- temperature
- feels-like
- precipitation probability
- precipitation window
- condition
- wind
- UV
- sunrise/sunset

### DaylightSense

- sunrise
- sunset
- daylight remaining
- outdoor-plan overlap

### FocusSense

- available focus minutes
- active focus state
- interruption boundary

## Future senses

- LocationSense
- BatterySense
- RoutineSense
- PeopleSense
- TravelSense

## Instinct schema

Each instinct should expose:

```ts
type FlowInstinct = {
  id: string;
  kind: string;
  title: string;
  detail?: string;
  priority: number;
  confidence: number;
  relevanceStart?: string;
  relevanceEnd?: string;
  cooldownKey?: string;
  sourceFacts: string[];
  suggestedCommand?: string;
};
```

## Initial rules

1. **Outfit** — weather → short clothing recommendation
2. **Umbrella** — rain probability/window + likely outside period
3. **Temperature later** — meaningful temperature drop before user returns
4. **Focus fit** — requested duration > available free window
5. **Daylight** — outdoor plan overlaps sunset
6. **Good-weather free window** — free time + favorable conditions
7. **Early next event** — useful evening/morning context
8. **UV** — daytime outdoor relevance + elevated UV
9. **Laundry window** — future dry/warm period after wetter days
10. **Packing primitive** — trip duration + forecast → small checklist

## Ranking policy

Score roughly by:

`usefulness × temporal relevance × confidence × novelty`

Apply penalties for:

- duplicate information
- recently dismissed items
- repeated exposure
- low actionability

The Good to know lens should never become a feed.


---

# FILE: product/TIME_TRAVEL_WEATHER_OUTFIT.md

# Time Travel, Weather & Outfit

## Time travel

Time is part of the environment, not a separate calendar page.

Voice examples:

- “Today.”
- “Tomorrow.”
- “Friday.”
- “Tonight.”
- “Next weekend.”
- “This week.”
- “Go back.”

On temporal navigation, update together:

- greeting/date
- Today lens
- Focus availability
- weather/outfit
- relevant people
- instincts
- mascot context

Never update only the date label.

## Visual time scope

Keep the bottom-right state indicator:

`Today | Tomorrow | This Week`

This remains visually present even if changed by voice so the user never loses orientation.

## Forecast

Target approximately **14 days** when the provider supports it.

At minimum ingest:

- min/max/current temperature
- feels-like if available
- precipitation probability
- weather condition
- wind
- UV if available
- sunrise/sunset

The provider may expose lower-confidence data farther into the future; the UI should not imply false precision.

## Outfit engine

The output is a short recommendation, not a weather report.

Inputs:

- temperature
- feels-like
- precipitation
- wind
- UV
- time of day

Example rule families:

```text
<= 5°C                → warm coat
6–10°C + wind         → proper jacket / layer up
8–14°C + rain         → jacket + umbrella
15–19°C               → light layers
20–25°C               → light clothing
>= 26°C               → very light clothing; surface UV guidance if relevant
rainProbability high  → umbrella if user is likely outside
high UV               → sunscreen/sunglasses suggestion
```

These thresholds are configurable policy, not medical advice.

## Copy standard

Good:

- “Light layers should be enough.”
- “Cold and wet. Jacket + umbrella.”
- “It’ll be cooler when you come home.”
- “UV is moderate. Sunglasses optional.”

Bad:

- “Based on the current meteorological conditions, I recommend…”
- “Temperature: 14°C. Humidity: 62%. Wind…”

The user should get the decision first.


---

# FILE: product/MASCOT_BEHAVIOR.md

# Mascot Behavior Lock

## Visual identity

Use the **soft cream/white plush-like mascot** represented in the locked reference.

Do not replace it with:

- a black robot head
- a glowing orb
- a neon AI creature
- a complex 3D humanoid
- a generic cloud icon

## Role

The mascot is an ambient presence and contextual guide, not a chatbot.

## Initial states

- idle
- listening
- acknowledging
- focus/quiet
- happy completion
- sleepy/late
- cold
- hot/sunny
- rain/umbrella
- waiting
- carrying/moving an object later

## UX rules

- one speech bubble maximum
- only speak when the intervention is useful
- default to behavior over text
- no tutorial spam
- no permanent bouncing
- no constant blinking/waving
- never compete with the command bar

## Example

If CalendarSense exposes 28 free minutes before lunch and FocusSense identifies a useful window:

Mascot may show:

> “You’ve got a clear 28 minutes. Want to focus on your project?”

If there is nothing useful to say, mascot simply rests.


---

# FILE: engineering/ARCHITECTURE.md

# Engineering Architecture

## Architectural objective

The impressive behavior must come from an engineered command/state system, not from prompting an LLM for every interaction.

## Core pipeline

```text
VOICE / POINTER / TOUCH
        ↓
      COMMAND
        ↓
   WORLD ACTION
        ↓
 STATE TRANSITION
        ↓
  SENSE REFRESH
        ↓
INSTINCT EVALUATION
        ↓
   VIEW MODELS
        ↓
  VISUAL RESPONSE
```

## Suggested domains

```text
src/
  flow/
    world/
    commands/
    time/
    calendar/
    weather/
    recommendations/
    senses/
    instincts/
    focus/
    people/
    mascot/
    persistence/
    voice/
    animation/
```

Use the existing repository architecture if it already has equivalent boundaries; do not create duplicate systems only to match folder names.

## Command model

Manual and voice interactions execute the same command primitives.

Examples:

```ts
setTimeScope('tomorrow')
moveObject(objectId, destination)
startFocus(minutes)
stopFocus()
undo()
redo()
showPerson(personId)
```

Voice parsing resolves into these commands; UI fallback controls dispatch the exact same commands.

## State requirements

- serializable
- deterministic transitions
- recoverable / undoable where possible
- no business logic embedded in rendering components
- derived context lives in selectors/view models
- Senses never directly mutate UI
- Instincts never directly mutate UI

## Cost boundary

Core home experience must operate with no paid LLM call.

Routine voice intent, scheduling arithmetic, weather interpretation, outfit guidance, focus fitting and instincts should be deterministic.

Optional LLM fallback is allowed only for low-confidence or genuinely fuzzy commands, behind a clear interface boundary.


---

# FILE: engineering/IMPLEMENTATION_SEQUENCE.md

# Implementation Sequence

## Sprint 0 — Preserve & map

Before editing:

1. map current routes
2. map global state
3. locate voice parser / command execution
4. locate calendar model
5. locate undo/redo
6. locate persistence
7. locate mascot asset/animation
8. locate design tokens
9. identify duplicate weather/focus logic
10. record current lint/build/unit/E2E baseline

Do not redesign during this audit.

## Sprint 1 — Final home shell

Implement the locked home composition with static/mock data first:

- marfim background
- header
- five semantic lenses
- mascot
- command bar
- Today/Tomorrow/This Week state control
- responsive desktop behavior

No sidebar.

No scenic background.

No duplicated weather.

## Sprint 2 — Today + Focus

- real timeline
- current-time marker
- next anchor
- open window calculation
- focus ring connected to actual free-window data
- voice commands for time/focus
- undo/redo where relevant

## Sprint 3 — Weather + Outfit

- free weather provider
- ~14-day forecast data model
- WeatherSense
- outfit rule engine
- Weather & Outfit lens
- relevant weather instincts

## Sprint 4 — Instinct Engine

Ship the first high-quality instincts:

- focus fit
- rain/umbrella
- temperature later
- daylight
- UV
- good weather/free window

## Sprint 5 — People relevance

- rank people by temporal relevance
- surface upcoming shared commitments
- voice-note / prep primitives
- quiet empty behavior when irrelevant

## Sprint 6 — Mascot context

Wire mascot states to actual Senses/Instincts.

Do not over-animate.

## Sprint 7 — Time Travel polish

Voice navigate today/tomorrow/named dates/week and update the entire scene atomically.

## Stop condition

Do not proceed into large new features until the following feels excellent:

> “Tomorrow.” → whole scene updates → “What should I wear?” → concise answer → “Give me 40 minutes.” → Flow proposes available time → user accepts → focus starts → “Undo.” restores state.


---

# FILE: qa/ACCEPTANCE_AND_QA.md

# Acceptance & QA

## Visual acceptance

The implementation fails if any of these are true:

- sidebar exists on home
- scenic/photo background exists
- weather is repeated in header and Weather & Outfit
- top listening/status pill duplicates the command bar
- handwritten motivational slogan appears
- Focus/Relax/Travel mode tiles appear at bottom
- cards use strong glassmorphism or glow
- cards all share the same internal layout
- background is white/gray instead of warm marfim
- mascot differs materially from the approved soft cream form

## 3-second UX test

Give the screen to a new tester for three seconds, then hide it. Ask:

1. How much free time did the person have?
2. What was next?
3. What should they wear?
4. Where would you speak to the assistant?

Target: at least 3/4 correct without instruction.

## Voice parity

Every primary action represented on home must have a voice path.

Minimum voice QA:

- “Today.”
- “Tomorrow.”
- “This week.”
- “What should I wear?”
- “Do I need an umbrella?”
- “Give me 20 minutes.”
- “Give me 40 minutes.”
- “What’s next?”
- “Show Sarah.”
- “Undo.”
- “Redo.”

## Deep assertions

For important interactions verify:

1. UI state
2. command resolved
3. payload/parameters
4. world state mutation
5. persistence if applicable
6. derived senses
7. resulting instinct set
8. undo/redo recovery

## Weather/outfit test matrix

At minimum cover:

- cold + dry
- cold + windy
- cool + rain
- mild + sunny
- hot + high UV
- rain later but dry now
- temperature drop before return
- missing UV
- forecast provider partial failure

## Accessibility

- WCAG AA contrast
- visible focus treatment for fallback controls
- semantic headings
- no color-only event meaning
- keyboard fallback where controls exist
- `aria-live` only for relevant voice/commit status; avoid noisy announcements
- respect reduced motion

## Required release checks

Run the existing project equivalents of:

- lint
- typecheck
- unit tests
- build
- E2E
- voice command tests

No agent may report “done” with failing checks hidden as unrelated.


---

# FILE: agents/AGENT_PROMPTS.md

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


---

# FILE: 13_RUNBOOK.md

# Local Runbook

The handoff does not assume a repo path that has not been verified. Use this exact discovery sequence first.

## Locate Flow

```bash
cd "$HOME/Documents/Development"
find . -maxdepth 3 -name package.json -print | grep -i flow
```

Then enter the correct repo and record state:

```bash
cd <FLOW_REPO>
git status --short --branch
git log -8 --oneline --decorate
node -v
cat package.json | sed -n '1,220p'
```

## Package manager

Use the lockfile already committed to the repo.

```bash
ls -1 | grep -E '^(package-lock.json|pnpm-lock.yaml|yarn.lock|bun.lockb?)$'
```

### npm project

```bash
npm ci
npm run dev
```

### pnpm project

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

### yarn project

```bash
corepack enable
yarn install --immutable
yarn dev
```

## Before editing

```bash
git status --short --branch
npm run lint --if-present
npm run typecheck --if-present
npm test --if-present
npm run build --if-present
```

If npm is not the repository package manager, use the equivalent command from that manager.

## After editing

Run the repository’s actual scripts from `package.json`. At minimum verify equivalents of:

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
```

Do not create a new branch/commit strategy without being asked. Preserve the user's preference for one clean commit at the end of a branch when that is the active workflow.


---

# FILE: 14_COPY_GUIDE.md

# Flow Copy Guide

## Voice

Flow speaks like a competent, quiet personal assistant.

Traits:

- short
- human
- specific
- situational
- no “AI” self-promotion
- no corporate productivity jargon
- no motivational filler

## Good examples

- “You have 28 minutes before lunch.”
- “Light layers should be enough.”
- “Great window for deep work.”
- “Low chance of rain. Keep it light.”
- “Sunset at 19:48.”
- “You asked for 40 minutes. You have 28 clear.”

## Avoid

- “Small steps, brighter days.”
- “Everything in flow.”
- “Unlock your potential.”
- “AI-powered insights.”
- “I have analyzed your schedule and determined…”
- “Based on current meteorological conditions…”

## Priority rule

**Decision > explanation > telemetry.**

The UI can show supporting data, but Flow’s copy should tell the user what matters.


---

# FILE: 15_ANTI_GOALS.md

# Permanent Anti-Goals / Regression Guard

If an agent proposes any of the following, reject it unless the user explicitly changes direction:

- home sidebar navigation
- black/dark selected states as the default visual language
- scenic mountain/lake/room background
- background stock photography
- duplicated weather blocks
- top listening badge plus bottom voice bar
- generic gradient hero
- neon cyan/purple AI glow
- excessive glass panels
- motivational handwritten phrases
- permanent Focus/Relax/Travel mode chips
- equal card templates for all information types
- map/radar/security-dashboard motifs
- chatbot conversation as the primary home UI
- another Plans/Inbox-style destination without a critical unique purpose
- paid LLM call for ordinary calendar/weather/focus logic
- “preparing your screen” loaders
- uncontrolled autonomous actions without preview/undo boundaries


---

# FILE: product/FUTURE_WORLD_ROADMAP.md

# Future World Roadmap — Preserve the Bigger Flow Vision

The locked home is the wedge, not the ceiling. It must be implemented so the larger interaction model remains possible without destabilizing the current product.

## 1. Summon

User asks for a capability and it appears in the current world rather than requiring navigation.

Examples:

- “Timer.”
- “Notes.”
- “Show Sarah.”
- “Show tomorrow.”
- “Calculator.”

Implementation principle: summon creates or reveals a world object through the same command bus used by other interactions.

## 2. Time Travel

The user should feel like moving through time, not opening calendar pages.

Voice:

- Today
- Tonight
- Tomorrow
- Friday
- Weekend
- Next week
- Go back

All contextual lenses update atomically.

## 3. Throw Through Time

A task/event can be conceptually sent to another day.

Example:

> “Not today.”
> “Weekend.”

The object moves to Saturday and the resulting world state is undoable.

## 4. Direct Manipulation

Long-term rule:

> If the user can see something, it should feel manipulable.

Potential operations:

- move
- expand
- collapse
- dismiss
- combine
- associate
- defer

Voice remains first-class; direct manipulation is a complementary grammar.

## 5. Ripple

Actions reveal downstream consequences.

Example:

Moving Gym to Wednesday may cause Flow to notice Wednesday becomes overloaded.

Flow should surface the consequence rather than silently accepting every mutation.

## 6. Object Composition

Selected object combinations can create useful actions:

- Person + Event → invite / associate
- Task + Day → schedule
- Project + Free Window → reserve focus block
- Timer + Project → focus session
- Note + Person → contextual reminder

Do not attempt arbitrary combinations before a typed object/command model exists.

## 7. Rooms / Modes

The world can change posture around intent:

- Work
- Home
- Focus
- Planning
- Quiet

These are transformations of the same world, not page routes.

Focus may:

- reduce irrelevant visual activity
- surface active project
- quiet instincts
- preserve next-anchor orientation

## 8. Little Machines

Eventually users can compose simple visible routines:

```text
MON–FRI → 18:00 → GYM
09:00 → WORK → PROJECT + TIMER
```

This is a visual programming language for everyday life.

## 9. Flow Physics

Information can have restrained physical behavior that communicates meaning:

- crowded periods compress
- free time creates space
- urgent objects become more prominent
- undo returns an object from its destination
- timer completion sends a subtle environmental response

No decorative physics.

## 10. Ambient Intelligence Expansion

Candidate micro-assistance:

- dry window for a walk
- laundry/drying window
- sunset/daylight warning
- UV guidance
- temperature later
- early morning context
- sleep-time arithmetic
- packing suggestions
- “can I walk there?” once location routing exists
- battery/charger context
- free-window/focus fit
- commute + weather overlap

Each should satisfy:

> Does this save the user from thinking about a small thing at the moment it matters?

## Sequencing guard

Do not start Little Machines, complex Rooms, arbitrary object composition or advanced physics until the locked home + Time Travel + Senses + Instincts + voice command path are excellent.


---

# FILE: engineering/COST_AND_RELIABILITY.md

# Cost & Reliability Boundary

## Core target

The home experience should approach **zero marginal AI inference cost**.

## Free/deterministic path

Use deterministic software for:

- date parsing where grammar is known
- calendar reads/mutations
- free-window calculation
- focus fitting
- undo/redo
- weather normalization
- outfit rules
- daylight calculations
- instinct ranking
- local preference storage
- time travel
- UI transformations

## Voice

Prefer existing browser/device speech capabilities where appropriate and compatible. Keep the recognition provider behind an adapter so the product can switch between browser/device/local/optional cloud recognition without changing commands.

Do not bind domain logic to a speech vendor.

## Optional model fallback

A model may later help when:

- intent confidence is low
- a command contains multiple ambiguous constraints
- the user asks for genuinely open-ended planning/reasoning

The model returns a proposed structured command/plan. Flow validates it before mutation.

Never use a model merely because a sentence is natural language.

## Reliability hierarchy

1. deterministic command with high confidence
2. deterministic clarification
3. optional model interpretation
4. safe preview
5. commit
6. undo/recovery

## Failure posture

Flow should say what it can safely infer and ask one focused clarification when necessary. Never silently invent a date/person/event match.


---

# FILE: design/RESPONSIVE_SPEC.md

# Responsive Specification

The locked reference is desktop-first, but responsiveness must preserve hierarchy rather than shrink five columns until unreadable.

## Large desktop ≥ 1440px

Use the full five-lens row.

Order:

Today | Focus | Weather & Outfit | People | Good to know

Command bar remains bottom-center. Time scope remains bottom-right. Mascot remains bottom-left.

## Standard desktop / laptop 1100–1439px

Keep five semantic zones but allow two-row composition if necessary:

Top row priority:

Today | Focus | Weather & Outfit

Second row:

People | Good to know

Do not horizontally scroll the entire home just to preserve five columns.

## Tablet 768–1099px

Use situation-first vertical flow:

1. greeting/context
2. Today
3. Focus
4. Weather & Outfit
5. Good to know
6. People if relevant

Command bar becomes sticky bottom control. Time scope stays visible near it.

## Mobile < 768px

The mobile experience is not a miniature desktop dashboard.

Prioritize:

1. current free window / next anchor
2. Today timeline
3. weather + outfit recommendation
4. single top instinct
5. relevant person

Keep cards full-width and readable without zooming.

The mascot may reduce to a smaller presence and should not consume prime vertical real estate.

## Responsive non-negotiables

- no 10–12px body text
- no horizontal overflow for core content
- no collapsing the calendar into unreadable mini rows
- command bar remains easy to reach
- voice status remains inside the command bar
- preserve marfim background and token system
