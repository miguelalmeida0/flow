# Flow repository instructions

## Product contract

Flow is a voice-first calendar that lets a person rearrange and recover a real day by speaking naturally. The calendar itself is the response: events move, stay anchored, defer, resize, or surface conflicts. There is no chat transcript and no generated imagery.

The product must be useful with zero paid services:

- no hosted LLM or AI API,
- no image generation,
- no account or backend requirement,
- no OAuth or calendar-provider sync in this repair mission,
- local persistence and deterministic scheduling,
- typed input supports every voice behavior.

Voice recognition is only a transcript adapter. Product intelligence lives in a testable local interpretation and scheduling pipeline.

## Current severity-zero problem

The existing product is not a general voice calendar. It recognizes only a tiny set of regex-shaped phrases and then runs seed-specific scheduling code. Most normal commands fall into the generic error:

> Try a simpler change — I did not move anything.

The repair must remove the architecture causing that behavior, not add a handful of phrases to the same brittle parser.

Known baseline risks to verify in code before editing:

- `parseCommand` supports only undo/reset, a narrow `N minutes behind/late` form, any text containing `flexible` or `fit`, and `protect`/`keep`.
- the single `PlanCommand` union cannot represent compound actions and constraints cleanly,
- `recoverDay` is hardcoded to seed IDs and a fixed afternoon start,
- `arrangeDay` can omit flexible events that do not fit instead of preserving or explicitly deferring them,
- the authored quick commands create the illusion of coverage,
- tests prove the showcase, not ordinary language.

Treat these as hypotheses until traced and reproduced. Report any additional defects.

## Required runtime architecture

Keep the design lean, but enforce these boundaries:

```text
voice adapter or typed input
        ↓
transcript normalization
        ↓
local request interpreter
        ↓
parsed actions + constraints or focused clarification
        ↓
event reference resolution
        ↓
pure schedule transformation on a draft
        ↓
invariant validation
        ↓
atomic commit + history entry
        ↓
React render + Motion layout animation + persistence
```

No visual component parses language. No parser mutates schedule state. No scheduler reads the DOM, microphone, localStorage, or React state.

## Minimum command families

Every family must work from typed input and from a final voice transcript.

### Global

- undo, redo, reset,
- “what changed?”,
- cancel the pending destructive action,
- apply/confirm when confirmation is required.

### Create

- “Add a 30 minute walk at 5.”
- “Schedule a 25 minute break between 3 and 5.”
- “Block one hour for reading tomorrow morning.”

### Move and shift

- “Move my workout to 6.”
- “Move deep work before lunch.”
- “Push everything after lunch back 30 minutes.”
- “Move this after the interview.” when an event is selected.
- “Move the roadmap to tomorrow morning.”

### Resize

- “Make email 20 minutes.”
- “Extend deep work by half an hour.”
- “Shorten the selected event by 15 minutes.”

### Protect and release

- “Protect lunch.”
- “Do not move the interview.”
- “Make the selected event flexible.”

### Recover and fit

- “I’m 35 minutes behind. Keep dinner at 7.”
- “I’m running about half an hour late; save the afternoon.”
- “Fit a 40 minute workout before dinner and don’t move lunch.”
- “Make room for a 20 minute break before the interview.”

### Defer and remove

- “Move the roadmap to tomorrow.”
- “Defer low priority work.”
- “Cancel the dentist appointment.” Destructive: require confirmation.

## Language behavior

Users must not memorize syntax.

The interpreter should handle:

- polite filler and disfluency: please, actually, can you, I need to, uh,
- punctuation and transcript casing,
- synonyms: move/push/shift/reschedule; add/schedule/block; protect/lock/keep fixed; cancel/delete/remove; shorten/reduce; extend/make longer,
- time forms: 6, 6 pm, six, six o’clock, half past six, quarter to four,
- relative anchors: before lunch, after dinner, between 3 and 5, tomorrow morning, next free slot,
- durations: 20 minutes, half an hour, one hour and fifteen minutes,
- selectors: selected event/this, exact or partial title, all flexible work, everything after lunch, low-priority work,
- compound clauses joined by and/then/but/while,
- explicit negative constraints such as “don’t move lunch.”

Do not guess when two events match or when a time is materially ambiguous. Return a one-line clarification with concrete options.

## Scheduling invariants

These are release blockers:

- Event IDs remain stable across moves.
- No event disappears unless the user explicitly deletes or defers it.
- No event is duplicated.
- Events have positive duration and remain inside supported day bounds.
- Events do not overlap unless the data model explicitly marks an allowed overlap.
- Fixed and protected events do not move without explicit intent.
- Compound requests either apply completely or not at all.
- Failed and clarified requests do not mutate state or history.
- One successful user request creates one history snapshot.
- Undo/redo restores the exact complete state, including deferred items and protection status.
- Persistence reloads the same state and has an explicit migration when the schema changes.

## UX behavior

The experience must feel immediate without pretending unsupported speech was understood.

- While listening, show the live transcript in the command field.
- After final recognition, keep the exact heard transcript visible until the result is clear.
- Use clear phases: listening, understanding, applying, completed, needs clarification, error.
- Safe unambiguous changes can apply directly.
- Destructive changes show a compact preview and require confirmation.
- Clarification names the unresolved event/time and offers no more than three direct choices.
- Do not use the generic “Try a simpler change” response for a supported command.
- Movement is the primary confirmation. Supporting copy states what changed and what remained protected.
- Preserve the warm near-white, graphite, restrained amber/blue/green visual language.
- No glass, neon, gradients, dashboards, chat bubbles, decorative AI imagery, or modal-heavy interaction.
- Reduced-motion behavior remains complete and understandable.

## Architecture standards

- React + strict TypeScript.
- Feature/domain organization, not generic component/hook dumping grounds.
- Aim for 50–100 lines per component and one reason to change.
- Prefer pure functions and discriminated unions.
- Context only when it removes real pass-through complexity.
- No global state library unless the existing app demonstrably requires one.
- No handwritten CSS; Tailwind utilities plus shared semantic tokens.
- Runtime top/height geometry may use the React `style` prop.
- Add a production dependency only when a small, audited library removes substantial parsing risk; document the reason.
- Do not add a large NLP framework or an in-browser language model.

## Testing contract

Existing showcase tests are not acceptance evidence.

Add and run:

1. A table-driven utterance corpus with at least 60 natural variants and expected semantic outcomes.
2. Pure schedule tests covering every operation and invariant.
3. Adversarial tests for ambiguity, missing events, impossible constraints, collisions, and no-op changes.
4. Controller/integration tests proving parse → resolve → draft → validate → commit/history.
5. Component tests for transcript states, clarification, confirmation, feedback, selection, undo, and persistence.
6. Playwright tests that type real natural commands into the actual command field and verify calendar geometry/labels/state.
7. A fake recognition adapter or injectable transcript seam proving the final voice transcript follows the identical path as typed input.
8. Console-error checks and reload persistence.

Never mock the parser or scheduler in end-to-end product tests.

## Required validation

Run from a clean install when practical:

```bash
npm install
npm run lint
npm run test:run
npm run build
npx playwright install chromium
npm run test:e2e
```

Also start the app and inspect the actual browser experience. A green terminal with a broken interaction is not a pass.

## Multi-agent workflow

For this mission, use read-heavy subagents in parallel and write sequentially:

1. `flow_mapper` traces the current runtime and defects.
2. `flow_language_auditor` designs and attacks the command contract.
3. `flow_principal` implements after both reports return.
4. `flow_qa` independently validates.
5. If QA fails, route the exact defects back to `flow_principal`; repeat until PASS.

Do not let multiple agents edit the same code simultaneously.

## Handoff standard

Finish with:

- concise root-cause summary,
- architecture implemented,
- supported command families and honest limits,
- files changed,
- test commands and actual results,
- one focused final commit only after all gates pass.

## Implemented architecture and extension guidance

The repaired runtime follows this concrete ownership map:

- `interpretation/normalize.ts`, `numbers.ts`, `temporal.ts`, and `clauses.ts` own transcript primitives.
- `interpretation/intent.ts`, `references.ts`, and `interpreter.ts` build typed `CalendarRequest` values. They never read or mutate React state.
- `scheduling/resolution.ts` resolves selectors and creates focused clarification choices.
- `scheduling/engine.ts` applies a whole request to a cloned draft; `invariants.ts` is the release-blocking validator; `slots.ts` owns free-slot geometry.
- `useFlowPlanner.ts` is the only atomic commit/history boundary. Failed, clarified, and pending-confirmation requests do not enter history.
- `voice/recognition.ts` is the browser adapter. Final transcripts call the same `run` function as typed input; interim transcripts never execute. `voice/fakeRecognition.ts` is the deterministic test seam.
- `storage.ts` persists schema version 3 and explicitly migrates valid version-1 and version-2 plans.

When adding language, extend the smallest parsing primitive and add table-driven corpus cases. When adding an operation, first extend the discriminated action union, implement its pure draft transform, add invariant/adversarial tests, then add controller and real-UI coverage. Never parse text in a component or special-case a seed ID in scheduling.

## Saved release-evidence gate

The complete browser release gate is `npm run qa:release`, executed from a normal local macOS Terminal. It runs lint, tests, build, and Playwright in order, then persists trustworthy browser evidence under `artifacts/release-qa/`. The release runner deletes prior evidence before starting so stale screenshots or results cannot be mistaken for a current pass.

In a managed Codex sandbox that cannot launch Chromium, `flow_qa` must not repeatedly launch a browser or treat that platform limitation as a product failure. It must inspect `artifacts/release-qa/results.json`, `playwright-results.json`, the HTML report, traces when relevant, all nine named screenshots, `docs/quality/VERIFICATION.md`, and the implementation/test code. If current external evidence is absent, its verdict is `AWAITING LOCAL RELEASE RUN`; it may return `PASS` only when the saved release verdict is PASS, every command succeeded, browser error arrays are empty, and all evidence files are present. It must never infer or fabricate a browser pass.

## Visual reward extension guidance

Reward is a post-persistence projection of real state. `FlowEnvironmentProvider.commit` emits one frozen `transaction-committed` event only after CAS persistence succeeds; `derive-reward-facts.ts` compares stable before/after identities and typed actions; `RewardDirector` owns intensity, suppression, cancellation, sound, and mascot state. Never emit success from a component, parse feedback copy, mutate `LifeDocument`, or add a parallel history path.

Reuse the three semantic families: Tide for travel/reallocation, Anchor for protection/commitment, Bloom for creation/progress/completion. Level 3 is reserved for actual recovery, meaningful elapsed focus completion, semantically complete Outcomes, and kept commitments. Undo cancels first and uses a neutral inverse; redo is capped at Level 2. Hydration, migration, refresh, remote adoption, preview, pending confirmation, clarification, no-op, failure, hidden tabs, and background enrichment stay Level 0.

Motion for React owns live DOM layout. The measured shared-flight layer owns its single aria-hidden clone. `MascotRenderer` owns semantic character state. Native Web Audio owns sound after explicit opt-in. Do not let two engines transform the same element, introduce looping ambient motion, or leave presentation residue. No valid `.riv` asset exists in this repository, so do not claim Rive or add its runtime without an independently validated production asset.

Any new reward requires typed fact derivation, intensity/recipe coverage, reduced and hidden behavior, interruption/history tests, and real browser settle assertions. Run `npm run qa:motion`; it must preserve all 144 inspected visual frames, the stress metrics, browser evidence, traces, and portfolio recording under `artifacts/visual-reward-qa/`. Frame existence alone is not visual approval; record the actual review in `docs/quality/design-qa.md`.
