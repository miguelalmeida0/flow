# Flow Always-On Voice Shell — P0 Repair Handoff

This handoff must be executed **before** mascot integration or any further visual expansion.

The current product has a release-blocking interaction defect: phrases such as “Open the calendar” and “Open the inbox” are being stored as Inbox captures instead of navigating. Flow therefore behaves like a capture form with a microphone, not a visual Alexa-like environment.

## Required read order

1. `CURRENT_FAILURE.md`
2. `PRODUCT_BEHAVIOR.md`
3. `VOICE_ARCHITECTURE.md`
4. `UX_AND_MOTION.md`
5. `ACCEPTANCE_AND_QA.md`
6. `FLOW_ALWAYS_ON_VOICE_MASTER_PROMPT.md`
7. `reference/voice-domain.reference.ts`

## Non-negotiable outcome

A user grants microphone permission once, starts a Live Session once, and can then say:

- “Calendar”
- “Move the two PM meeting to four”
- “Make it red”
- “Home”
- “Inbox”
- “Remember to buy coffee tomorrow”
- “Plans”
- “Turn the passport item into a plan”
- “What fits right now?”

without pressing the microphone again, selecting a container first, or having navigation phrases accidentally saved as data.

## Scope boundary

Keep the existing deterministic life/calendar domain engine. Do not add a paid LLM, backend, account system, image generation, Three.js, or a second mutation path.
