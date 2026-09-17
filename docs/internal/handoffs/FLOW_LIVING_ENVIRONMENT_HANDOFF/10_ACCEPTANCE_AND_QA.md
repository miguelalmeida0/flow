# 10 — Acceptance and QA

## Definition of done

The release is done only when:

- every target screen uses real state;
- cross-space lineage is real;
- the signature morph works through the user-facing command path;
- Calendar behavior remains green;
- all domain changes are atomic and reversible;
- motion is smooth, interruptible, and reduced-motion safe;
- voice session and typed fallback work;
- durable browser evidence exists.

## Required automated gate

Preserve and extend:

```bash
npm run qa:release
```

It must cover:

- lint;
- unit/integration/component tests;
- strict TypeScript build;
- Chromium E2E;
- browser console/page/request failures;
- screenshots;
- result JSON;
- traces on failure.

## Domain tests

### Unified identity

- one stable ID per entity;
- one explicit relationship per cross-space link;
- no duplicated Calendar event when scheduling a plan step twice;
- deleting/unlinking has defined semantics.

### Transactions

- multi-action operations atomic;
- failed validation mutates nothing;
- one intention creates one history entry;
- exact undo and redo;
- persisted round-trip preserves links and lineage.

### Existing Calendar invariants

Retain all existing tests for:

- no event loss;
- no duplicates;
- no invalid overlap;
- protected/fixed anchors;
- deterministic Tide proposals;
- voice/type parity.

## Required E2E journeys

### 1. Home navigation

- open each container by click;
- return Home;
- open Calendar and Inbox through command input;
- verify browser history/deep link behavior.

### 2. Global capture

From Calendar:

> “Renew passport before Senegal.”

Assert one Inbox capture exists and Calendar is unchanged.

### 3. Inbox → Plan signature journey

- focus the capture;
- enter “Turn that into a plan.” through the real UI;
- assert Plan created;
- Capture resolved/linked;
- one transaction;
- source/destination motion evidence;
- undo restores exact prior state;
- redo restores exact resulting state.

### 4. Plan step → Calendar

- schedule Documents step Friday at 10;
- assert one linked Calendar event;
- Calendar invariants preserved;
- Plan shows scheduled state;
- exact undo/redo.

### 5. Commitment

> “I promised Maya I’d send the proposal by Friday.”

Assert person, commitment, due state, and optional plan link; no duplicate person on repeated reference.

### 6. Now

- create a 25-minute free window;
- assert candidates fit the window;
- no more than three;
- “Nothing administrative” reranks;
- “Keep the time free” changes nothing.

### 7. Flow Live synthetic pipeline

- inject final transcript through the production voice adapter;
- navigate space;
- execute one cross-space command;
- assert same pipeline as typing.

### 8. Mobile

At 390×844:

- Home containers legible;
- bottom navigation usable;
- command dock not obscured;
- Inbox-to-Plan flow usable;
- Calendar retains no horizontal overflow.

### 9. Reduced motion

- no path travel/particles;
- source/destination relationship remains understandable;
- focus and keyboard destination correct.

## Motion-specific QA

### Visual correctness

Capture frames/states for:

1. idle Inbox;
2. source focused;
3. Tide released;
4. destination shell appearing;
5. final plan;
6. undo;
7. reduced motion.

### Runtime correctness

Assert or instrument:

- one transition clone maximum;
- no clone after completion/cancel;
- no duplicated recognition listeners;
- no frame loop while idle/hidden;
- no stale `aria-hidden` source/destination;
- no scroll jump during cross-space morph.

### Performance

Run the signature morph 20 times with undo.

Record:

- median duration;
- longest main-thread task;
- frame rate or dropped-frame approximation;
- heap/listener stability where available.

Release expectations:

- no sustained task above 50ms caused by motion code;
- target 60 FPS on normal laptop;
- input remains responsive during animation;
- no observable memory/listener growth.

## Voice QA

Report separately:

- Synthetic transcript pipeline: PASS/FAIL
- Physical Chrome/macOS microphone acceptance: PASS/FAIL/NOT RUN

Physical phrases:

1. “Inbox.”
2. “Renew passport before Senegal.”
3. “Turn that into a plan.”
4. “Schedule the documents step Friday at ten.”
5. “What fits right now?”
6. “Flow sleep.”

Do not call voice complete based only on injected transcripts.

## Accessibility

- all routes keyboard navigable;
- focus lands at the transformed destination;
- live-region announcements are concise;
- no color-only states;
- 44px targets;
- screen-reader labels for voice state;
- no motion required to understand data lineage;
- Escape cancels previews and stops voice session.

## Release evidence

Write under:

```text
artifacts/living-environment-release/
```

Required screenshots:

- `01-home.png`
- `02-calendar.png`
- `03-command-preview.png`
- `04-tide-recovery.png`
- `05-what-if.png`
- `06-inbox-source-focus.png`
- `07-inbox-to-plan-transfer.png`
- `08-plan-detail.png`
- `09-people.png`
- `10-now.png`
- `11-mobile.png`
- `12-reduced-motion.png`

Required JSON fields:

- test counts;
- E2E result;
- console/page/request errors;
- screenshot paths;
- motion stress result;
- synthetic voice result;
- physical microphone result;
- timestamp and commit/hash when available.

No fabricated evidence.
