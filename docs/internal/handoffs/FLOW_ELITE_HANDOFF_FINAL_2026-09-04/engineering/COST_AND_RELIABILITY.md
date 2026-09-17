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
