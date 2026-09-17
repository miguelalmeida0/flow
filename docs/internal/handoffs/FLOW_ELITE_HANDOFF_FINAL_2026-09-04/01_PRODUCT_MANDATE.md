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
