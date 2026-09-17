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
