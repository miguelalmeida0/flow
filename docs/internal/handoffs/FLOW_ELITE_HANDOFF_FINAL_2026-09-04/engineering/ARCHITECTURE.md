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
