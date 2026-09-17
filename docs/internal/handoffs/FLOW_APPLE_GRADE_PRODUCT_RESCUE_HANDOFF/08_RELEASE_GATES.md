# 08 — Release Gates

## Automated gates

Run and pass:

```bash
npm install
npm run lint
npm run test:run
npm run build
npm run qa:release
```

Do not weaken existing tests.

## Minimum test inventory

### Unit and domain

- voice state transitions;
- recognizer restart/deduplication;
- transcript candidate ranking;
- global route recognition;
- intent priority;
- context expiration;
- pronoun follow-up resolution;
- explicit capture safety;
- cross-domain statement parsing;
- action transaction atomicity;
- unified-state migrations;
- projection selectors;
- global undo/redo;
- event scheduling invariants;
- outcome next-step rules;
- commitment due-state rules;
- Now recommendation selector.

### Semantic corpus

At least 250 table-driven utterances across:

- navigation variants;
- route aliases;
- event creation/editing;
- relative time;
- title/time/current/next references;
- contextual follow-ups;
- explicit capture;
- outcome creation and steps;
- commitment creation;
- questions;
- pause/resume;
- malformed/unsupported speech;
- destructive confirmations;
- ambiguity.

### Browser E2E

Test through the actual UI, not domain functions:

1. Start Live Session once using the fake recognition adapter.
2. Navigate Home → Today → Capture → Outcomes → Commitments → Home.
3. Verify the recognizer owner is not recreated during navigation.
4. Create a dinner event from Outcomes.
5. Recolor/mark important with a contextual follow-up.
6. Create an outcome from Home.
7. Add and schedule its next step.
8. Create an “I owe” commitment.
9. Create a “waiting on” commitment.
10. Ask “What needs me now?”
11. Move an event by start time from Commitments.
12. Undo and redo globally.
13. Verify no navigation phrase becomes a Capture.
14. Verify no unsupported phrase mutates state.
15. Verify persistence after refresh.
16. Verify mobile layout.
17. Verify reduced motion.
18. Verify zero console/page/request errors.

## Physical microphone gate

Automated injection is not enough.

On Chrome/macOS, activate Live Session once and speak naturally:

1. “Home.”
2. “Book dinner at Pizzeria Roma tomorrow at eight.”
3. “Make it red and important.”
4. “I need to renew my passport before Senegal.”
5. “The first step is check the requirements.”
6. “Schedule it Thursday after work.”
7. “I promised Maya the proposal by Friday.”
8. “I am waiting for Daniel's contract confirmation.”
9. “What needs me now?”
10. “Move the two PM meeting to four.”
11. “Undo.”
12. “Redo.”
13. “Home.”
14. “Pause listening.”

Required:

- no second microphone click;
- correct route changes;
- no duplicate execution;
- contextual follow-ups affect the correct entity;
- valid commands work regardless of current route;
- no navigation phrase becomes data;
- one undo entry per logical request;
- Live Session indicator remains truthful;
- no console errors.

## Visual gates

Capture screenshots for:

- Home with meaningful state;
- Today with Now embedded;
- Capture with unresolved and routed items;
- Outcome detail with scheduled next step;
- Commitments with all three lens types;
- global command during route navigation;
- contextual follow-up;
- automatic Tide recovery preview;
- mobile Home;
- mobile Today;
- reduced-motion mode.

## Motion gates

Capture source, 25%, 50%, 75%, and final frames for:

- event movement;
- Capture → Outcome;
- Outcome step → Today;
- completion reclaiming time;
- Tide recovery.

Reject if any frame contains:

- crossing/jagged paths;
- clipped text;
- paths through labels;
- persistent glow/line residue;
- ambiguous source/destination;
- layout shift unrelated to the operation;
- event text detached from its surface.

## Final verdict language

Report separately:

- Automated command pipeline: PASS/FAIL
- Synthetic voice path: PASS/FAIL
- Physical microphone acceptance: PASS/FAIL/NOT RUN
- Product release: PASS only when all required gates pass
