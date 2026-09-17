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
