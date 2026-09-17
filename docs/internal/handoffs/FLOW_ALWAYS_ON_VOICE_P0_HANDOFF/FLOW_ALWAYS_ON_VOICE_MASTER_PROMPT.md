# Flow Always-On Voice Shell — P0 implementation mission

You are the principal staff engineer responsible for repairing Flow's global voice interaction.

This is a P0 product defect, not a design exploration.

## Current broken behavior

Flow displays `Live listening`, but utterances such as `Open the calendar` and `Open the inbox` are persisted as Inbox captures. Navigation, domain editing, and capture are not routed safely. The app therefore fails its core “visual Alexa” product promise.

## Mission

Implement a single, persistent, context-aware Live Session that lets the user activate the microphone once, navigate among Flow spaces, mutate domain data, and return Home without pressing the microphone again or selecting a container first.

Read every file in this handoff before editing.

## Execution requirements

### 1. Trace before editing

Inspect the current repository and document:

- recognizer ownership;
- route mount/unmount behavior;
- transcript handling;
- intent routing order;
- capture fallback behavior;
- context storage;
- mutation pipeline;
- why navigation phrases became Inbox items.

Do not guess. State the verified root cause.

### 2. Move voice ownership to the shell

The voice session must survive navigation between Home, Calendar, Inbox, Plans, People, and Now.

Use one application-level provider/controller. Feature screens may consume voice state but may not instantiate their own recognizers.

### 3. Implement strict global routing precedence

In this order:

1. system controls;
2. navigation;
3. pending clarification responses;
4. active-space/domain actions;
5. cross-space life actions;
6. explicit capture;
7. unsupported.

Delete the implicit `unknown transcript → Inbox capture` behavior.

Unknown speech must never mutate state.

### 4. Implement zero-selection navigation

These and natural variants must work globally:

- Home
- Go home
- Back
- Calendar
- Open calendar
- Show my calendar
- Inbox
- Open inbox
- Plans
- Open plans
- People
- Open people
- Now
- What fits right now?

Navigation must begin immediately and use shared-element motion from Home when appropriate.

### 5. Implement continuous Live Session

The user explicitly starts once. While the tab is visible and session is active:

- keep listening;
- show interim transcription;
- execute final commands;
- restart recognition safely if Chrome ends it unexpectedly;
- never duplicate listeners or execute one phrase twice;
- preserve session across route changes;
- pause on Escape, explicit pause command, permission failure, or hidden document;
- do not store audio.

Use explicit English locale and existing semantic candidate ranking.

### 6. Implement conversational context

Support this sequence without selection:

```text
Calendar
Move the two PM meeting to four
Make it red
Make it important
Give me twenty minutes before it
```

Use an explicit `ConversationContext`, not ad hoc globals.

If context is stale or ambiguous, ask one concise clarification.

### 7. Make capture explicit

Only create an Inbox capture when the utterance has an explicit capture intent or the user deliberately enters Capture mode.

`Remember to buy coffee tomorrow` may capture.

`Open the calendar`, `Go home`, and unsupported speech must never capture.

Clean persisted/demo navigation phrases from Inbox in a safe migration if necessary. Do not delete legitimate user captures.

### 8. Preserve one action pipeline

Voice, typing, click, drag, resize, and Tide automation must all resolve to the same typed actions and atomic domain transaction pipeline.

Do not fork business logic for voice.

### 9. Repair the shell UX

- Fix header/content overlap.
- Keep one owner for app chrome.
- Replace the microphone-as-repeated-button mental model with a persistent Live Session state pill.
- Show a restrained interim/final transcript near the bottom edge.
- Let the changed object prove success.
- Remove large success/error sidebars for normal commands.
- Unsupported speech remains ephemeral and creates no data.

### 10. Motion quality

Use DOM + SVG + Motion only.

No Three.js, canvas-only renderer, shaders, or decorative infinite particles.

Home-card opening:

- focus target;
- lift 2px;
- dim siblings;
- expand target into route surface;
- preserve title spatial continuity;
- settle chrome after content.

All motion must be interruptible and support reduced motion.

### 11. Testing

Add unit/integration tests for:

- routing precedence;
- navigation variants;
- explicit capture;
- phrases that must never capture;
- follow-up context;
- stale context;
- continuous recognizer restart;
- duplicate event prevention;
- hidden-tab pause;
- one final transcript → one action.

Add browser tests using the fake recognition adapter through the real microphone UI. Run a multi-route continuous session without reactivating the mic.

### 12. Physical microphone gate

After automated gates pass, instruct the user to run the supplied 19-command manual journey in `ACCEPTANCE_AND_QA.md`.

Do not call this fixed until the user confirms the physical journey.

### 13. Validation

Run the repository's actual commands for:

- lint;
- unit/integration tests;
- strict TypeScript/build;
- browser E2E;
- release QA harness if present.

Inspect for console errors and duplicate actions.

### 14. Final report

Provide:

1. verified root cause;
2. architecture changes;
3. routing precedence;
4. continuous session behavior;
5. context behavior;
6. capture safety behavior;
7. UX/motion changes;
8. files changed;
9. test counts and command output;
10. synthetic voice status;
11. physical microphone status;
12. genuine limitations.

Do not stop at planning. Implement now.
