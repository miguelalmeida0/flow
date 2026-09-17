# Flow Living Environment — Principal Staff Engineer and Motion Systems Lead

You own the next Flow release end to end.

You are acting as:

- principal staff frontend engineer,
- product systems architect,
- interaction designer,
- motion systems engineer,
- accessibility and release-quality owner.

The product must feel calm, immediate, and inevitable—not like a dashboard, a chatbot, or a motion demo placed on top of unfinished software.

## First action

Before changing production code:

1. Read repository `AGENTS.md` and `docs/quality/VERIFICATION.md`.
2. Read every file in this handoff.
3. Inspect all screen and motion assets.
4. Run the current lint, tests, build, and available browser release gate.
5. Inspect the real current application.
6. Trace the existing:
   - Calendar/Tide domain model,
   - command interpretation,
   - voice adapter,
   - storage migration,
   - undo/redo history,
   - design token system,
   - Motion usage,
   - route/application shell.
7. Record the baseline test count and current limitations.

Do not rewrite proven scheduling code without evidence.

## Product mandate

Build one living environment with five user-facing projections:

- Home
- Calendar
- Inbox
- Plans
- People
- Now

`Now` is a cross-space decision surface, not a fifth independent data silo.

A user must be able to:

- navigate by saying “Calendar”, “Inbox”, “Plans”, “People”, “Home”, or “What fits right now?”;
- capture an unresolved thought from any screen;
- transform a capture into a plan without copying data;
- schedule a plan step into the existing Calendar/Tide engine;
- attach a promise to a person and deadline;
- see cross-space consequences immediately;
- undo and redo every safe operation exactly;
- remain in one voice session after enabling voice once.

The environment must work without voice and without motion.

## P0 release: fully functional vertical slice

Implement these real behaviors, not static visuals:

### Living Home

- Four primary containers: Calendar, Inbox, Plans, People.
- Each container shows a true projection of current local data.
- Cards expand into their destination through shared spatial continuity.
- Global command dock available without opening a container.
- Voice navigation works while Live Session is enabled.

### Calendar

- Preserve the current Breathing Day + Tide implementation.
- Integrate it into the shared shell without duplicating its state.
- Plan steps scheduled into time appear as real Calendar events linked to their origin.
- Automatic recovery and what-if behavior remain intact.

### Inbox

- Capture text or final voice transcripts.
- Captures remain unresolved until acted on.
- Support edit, archive, delete with confirmation, and convert-to-plan.
- “Turn that into a plan” resolves the most recently focused or uniquely referenced capture.
- Converting a capture must be one atomic, reversible cross-space transaction.

### Plans

- Plan list projection.
- Plan detail with ordered steps, status, due date, and scheduled state.
- Create, rename, add/reorder/complete steps, and schedule a step into Calendar.
- A plan step scheduled into Calendar remains one linked entity relationship—not copied text with no lineage.

### People

- Person name plus promises made, promises received, and waiting-on state.
- Create a commitment through natural language or typed input.
- Link a promise to a due date, plan, and optional Calendar reservation.
- Do not build a broad CRM.

### Now

- Deterministically recommend at most three items that fit the current free window.
- Use explicit duration, current time, due state, schedule constraints, and completion state.
- No opaque wellbeing score and no model-generated advice.
- Explain “Why these?” using concrete factors.

## P1 release polish

After P0 is functionally complete and all gates pass:

- persistent Live Session voice state;
- interim transcript preview without premature mutation;
- shared Home-to-space transitions;
- Inbox-to-Plan Tide choreography;
- Plan-step-to-Calendar transition;
- promise-thread animation;
- Now recommendation focus choreography;
- complete mobile and reduced-motion treatment;
- performance profiling and release evidence.

## Signature choreography

The favored reference is `assets/screens/06-inbox-to-plan-morph.png`.

The production implementation must use the exact six-beat logic defined in `05_INBOX_TO_PLAN_CHOREOGRAPHY.md`:

1. Focus source.
2. Release Tide.
3. Establish transfer path.
4. Materialize destination shell.
5. Resolve destination content.
6. Settle and record one undo point.

Do not render a fake 60% progress number unless progress is genuinely tied to known deterministic stages. Prefer named stages or an indeterminate nucleus.

## Motion implementation mandate

Use:

- semantic DOM,
- SVG paths,
- the repository's Motion library,
- FLIP/shared-layout measurement where necessary,
- portals only for temporary transition clones.

Do not use:

- Three.js,
- WebGL scenes,
- GLSL,
- physics packages,
- canvas as the primary UI,
- CSS keyframe files,
- perpetual particle loops,
- unbounded blur or glow,
- motion that delays interaction.

Animations must be interruptible, reversible, and causally tied to a domain action.

## Architecture mandate

All state changes follow one pipeline:

```text
voice / type / click / drag / automatic Tide
                     ↓
               typed LifeAction[]
                     ↓
            resolve + validate + preview
                     ↓
              atomic domain commit
                     ↓
          persistence + undo/redo history
                     ↓
      projections update + motion plan derived
```

Do not store motion state inside domain entities. Derive motion cues from the before/after transaction and transient UI intent.

Use one shared data model. Calendar, Inbox, Plans, People, and Now are selectors/projections over it.

## Design mandate

Follow `07_DESIGN_SYSTEM.md` and the provided token reference.

Required character:

- deep blue-black canvas;
- graphite surfaces;
- warm high-contrast type;
- restrained teal for active flow;
- amber only for protected/time-critical state;
- red only for explicit user label/importance/destructive state;
- meaningful empty space;
- thin lines, calm radii, almost no shadow;
- soft luminance only around an active transformation.

The application must not become a neon cyber dashboard or a grid of generic cards.

## Voice mandate

One explicit activation starts a Live Session. After that, the user should not press the microphone for every command.

- Live Session is visible and revocable.
- Voice stops/suspends when the tab is hidden.
- All final transcripts use the same command pipeline as typing.
- Browser limitations are communicated honestly.
- Typed input and keyboard navigation remain first class.
- Do not claim a system-wide wake word in a browser application.

## Quality and release mandate

Preserve every existing release gate. Extend them; never weaken them.

Required completion commands:

```bash
npm install
npm run lint
npm run test:run
npm run build
npm run qa:release
```

If local Chromium cannot run inside the managed environment, use the established durable local evidence workflow. Do not fake screenshots or mark browser QA as passed without execution.

Do not claim “voice ready” from injected transcripts alone. Report:

- synthetic voice pipeline,
- physical microphone acceptance,

separately.

## Final completion report

Do not stop at a plan.

At completion report:

1. baseline and final test counts;
2. routes/screens implemented;
3. real cross-space actions implemented;
4. unified data model changes and migration;
5. animation primitives and choreography;
6. performance results;
7. accessibility and reduced-motion behavior;
8. browser/E2E evidence;
9. synthetic voice result;
10. physical microphone result;
11. screenshots and traces produced;
12. exact changed files;
13. genuine remaining limitations only.

A screen that merely resembles the references is not completion. The interactions and data lineage must be real.
