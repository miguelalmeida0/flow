# Flow Tide — Elite Product Handoff

This package is the complete implementation brief for the next Flow release.

## Product definition

**Flow = Breathing Day visual surface + Tide automatic reflow engine + a playful, universal event-editing system.**

The app is not a voice-controlled calendar. It is a calendar that continuously reshapes itself around real life, while every event remains directly editable.

> Drag when one thing needs moving. Speak or type when the whole day needs understanding. Let Tide handle everything in between.

## Read in this order

1. `FLOW_TIDE_AGENT_PROMPT.md`
2. `FLOW_TIDE_CURRENT_STATE.md`
3. `FLOW_TIDE_PRODUCT_SPEC.md`
4. `FLOW_TIDE_DESIGN_SYSTEM.md`
5. `FLOW_TIDE_INTERACTION_AND_MOTION.md`
6. `FLOW_TIDE_ARCHITECTURE.md`
7. `FLOW_TIDE_IMPLEMENTATION_SEQUENCE.md`
8. `FLOW_TIDE_ACCEPTANCE_AND_QA.md`
9. `assets/breathing-day-reference.png`
10. `assets/breathing-day-annotated.png`
11. `reference/design-tokens.reference.ts`

## Non-negotiable boundaries

- React + strict TypeScript.
- Tailwind classes and centralized TypeScript design tokens. No handwritten CSS files or CSS modules.
- No runtime GPT, paid LLM, backend, authentication, image generation, or calendar-provider integration for this release.
- Voice, typing, dragging, resizing, automatic Tide actions, and quick actions must all use the same typed calendar action pipeline.
- Selection is always optional. It may disambiguate, but it must never be required for commands that are already clear from title, time, current event, next event, label, or position.
- The calendar itself is the feedback. No chat transcript, verbose side panel, success toast, or generic “try a simpler command” state.
- Never silently move fixed/shared/protected events or delete anything.
- Preserve and extend the current passing behavior; do not rewrite stable scheduling logic without evidence.

## Install into the project

```bash
cd ~/Downloads/flow-voice-calendar
unzip -o ~/Downloads/flow-tide-elite-handoff.zip -d .
```

This creates `FLOW_TIDE_HANDOFF/` without overwriting production files.

Then start a fresh Codex task and paste the contents of `FLOW_TIDE_AGENT_PROMPT.md`.
