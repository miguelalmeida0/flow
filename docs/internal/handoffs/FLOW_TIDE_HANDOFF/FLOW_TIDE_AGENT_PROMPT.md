# Flow Tide — Principal Staff Engineer Execution Prompt

You are the principal staff engineer and product-minded frontend lead responsible for turning the existing Flow calendar into a portfolio-defining product.

This is an implementation mission, not a design exercise.

## First action

Read, in full:

- repository `docs/internal/automation/AGENTS.md`
- repository `docs/quality/VERIFICATION.md`
- `FLOW_TIDE_HANDOFF/FLOW_TIDE_CURRENT_STATE.md`
- every Markdown file under `FLOW_TIDE_HANDOFF/`
- `FLOW_TIDE_HANDOFF/reference/design-tokens.reference.ts`

Inspect both design references:

- `FLOW_TIDE_HANDOFF/assets/breathing-day-reference.png`
- `FLOW_TIDE_HANDOFF/assets/breathing-day-annotated.png`

Then inspect the current source, tests, release harness, and actual running UI before editing.

Do not pin or change the Codex model. Use the model already available in the current session.

## Product mandate

Build:

> **Flow — a living day that automatically reshapes itself around real life.**

Combine three ideas into one coherent product:

1. **Breathing Day** is the visual surface: dark, calm, spacious, alive, and centered on the timeline.
2. **Tide** is the deterministic scheduling engine: safe flexible work flows around fixed and protected commitments.
3. **Calendar game** is the interaction language: events can be painted, stretched, anchored, split, merged, completed, deferred, previewed, and moved with direct manipulation or natural language.

This must no longer feel like “select a meeting, press a microphone, say a command.”

Selection is a convenience, never a prerequisite.

The core user promise is:

> **Tell Flow what changed or what must remain true. Flow repairs the day immediately.**

## Required user outcomes

A user must be able to do all of the following without selecting an event first when the reference is already unambiguous:

- “Move the 2 PM meeting to 4.”
- “Make the 2 PM meeting important and red.”
- “Rename the 2 PM meeting to design review.”
- “Make the 2 PM meeting 45 minutes.”
- “Give me 20 minutes before the interview.”
- “Protect lunch.”
- “Make dinner flexible again.”
- “Add lunch with Ana tomorrow at one.”
- “Clear everything between two and four.”
- “Move every red meeting to Thursday.”
- “Split deep work into two 45-minute sessions.”
- “Combine email, expenses, and admin.”
- “I’m 35 minutes behind. Keep dinner at seven.”
- “I’m done at six today.”
- “What if I add a workout at five?”
- “Do it.”
- “Undo that.”
- “Redo.”

A direct drag, resize handle, quick action, typed instruction, final voice transcript, and automatic Tide recovery must all produce the same domain actions and pass through the same validation and event-history pipeline.

## Experience rules

- The full calendar is the dominant surface.
- Remove the persistent right-side status/error panel.
- Remove verbose success explanations.
- A successful change is confirmed by the event visibly changing.
- A failed change appears next to the affected event or time:
  - “Dinner is protected.”
  - “Two meetings start at 2. Which one?”
- Never show “Try a simpler change.”
- Show the final recognized voice transcript briefly in the command surface.
- Keep the command surface quiet until typing, pressing the microphone, or invoking a keyboard shortcut.
- Do not add a dashboard, assistant avatar, generated imagery, gamification points, streaks, badges, or a heavy inspector.
- Playfulness must come from physical continuity and reversible cause-and-effect.

## Release scope

Implement every P0 and P1 requirement in `FLOW_TIDE_PRODUCT_SPEC.md`.

P2 is explicitly out of scope unless all P0/P1 work is complete and all release gates remain green.

Do not stop after planning. Do not return partial scaffolding. Do not claim completion because unit tests pass while the running product still feels unchanged.

## Architecture rules

Use the architecture in `FLOW_TIDE_ARCHITECTURE.md`.

The critical invariant is:

```text
voice / type / drag / resize / quick action / Tide automation
                         ↓
                 CalendarAction[]
                         ↓
                  preview + validate
                         ↓
                 atomic event commit
                         ↓
            persistence + undo/redo history
                         ↓
               deterministic UI animation
```

Do not create parallel business logic per input method.

Use small pure modules and discriminated unions. Keep components small enough to understand in one read. Avoid god hooks, giant parser files, giant scheduler files, and generic utility dumping grounds.

Inline styles are allowed only for runtime geometry such as computed `top`, `height`, and transform coordinates. All visual styling must use Tailwind classes sourced from centralized TypeScript tokens.

## Design mandate

Implement the exact design direction in `FLOW_TIDE_DESIGN_SYSTEM.md`.

The chosen reference is the attached Breathing Day image. It is a direction, not a pixel-copy mandate.

The final surface must include:

- deep blue-black canvas
- thin vertical time spine
- quiet current-time point
- floating event surfaces
- teal Tide/breathing accents
- amber protected state
- independent user-chosen event colors
- a concrete density label such as Open, Calm, Tight, or Overloaded
- meaningful empty space
- a living Breathing Room object
- no persistent sidebar
- no purple default palette
- no glassmorphism
- no generic AI gradient
- no neon cyber-dashboard look
- no low-contrast text

Use the provided semantic tokens. Do not scatter raw color values through components.

## Motion mandate

Implement the choreography in `FLOW_TIDE_INTERACTION_AND_MOTION.md`.

Motion must explain:

- what changed
- why it changed
- where it went
- what remained fixed

Every animation must be interruptible and reversible. Respect reduced motion.

The signature sequence must work:

> “Make the 2 PM meeting important and red, give me 20 minutes before it, and move anything flexible out of the way.”

Expected choreography:

1. Resolve the event by time without selection.
2. Event rises into focus.
3. Importance marker appears.
4. Red pigment washes through the event.
5. A 20-minute Breathing Room opens before it.
6. Flexible events flow along visible curved paths.
7. Protected/fixed events remain still.
8. The entire compound change commits as one undo step.

## Tide automation

Implement deterministic automatic reflow. No LLM.

Safe triggers include:

- adding, moving, resizing, protecting, or deleting an event
- marking the current event done early
- extending an active event
- declaring a delay
- setting an end-of-day boundary
- creating a breathing buffer
- detecting that the remaining flexible schedule no longer fits

Risk policy:

- visual-only edits: apply immediately
- safe movements of local flexible events: apply immediately with undo
- destructive changes: confirm
- moving protected/fixed/shared events: preview or clarify
- never silently delete or move protected/fixed events

Tide should optimize for concrete geometry, not fake wellness scores:

- preserve fixed/protected commitments
- meet explicit deadlines and boundaries
- preserve requested buffers
- minimize unnecessary movement
- minimize fragmentation and context switching
- keep work inside the visible working window
- preserve or create useful open space
- defer the lowest-risk flexible work only when needed

## Test and release mandate

Follow `FLOW_TIDE_ACCEPTANCE_AND_QA.md`.

Preserve all current tests and release evidence. Extend them.

Run:

```bash
npm install
npm run lint
npm run test:run
npm run build
npm run qa:release
```

If the managed environment cannot launch Chromium, use the existing durable local release-evidence workflow. Do not fake browser evidence.

A physical microphone acceptance pass must be reported separately from the synthetic final-transcript adapter. Never label the product “real microphone PASS” based only on injected transcripts.

## Required final report

Do not say “done” without all required gates.

Report:

1. Before/after product behavior.
2. Product and architecture decisions.
3. Exact changed files.
4. P0/P1 capabilities implemented.
5. Natural-language examples verified without selection.
6. Automatic Tide triggers implemented.
7. Motion and visual states implemented.
8. Accessibility and reduced-motion behavior.
9. Test counts and browser results.
10. Real microphone status.
11. Screenshots and evidence paths.
12. Genuine remaining limitations only.

Execute the mission now.
