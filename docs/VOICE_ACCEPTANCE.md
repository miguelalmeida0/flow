# Flow physical-microphone acceptance

This is the release gate automation cannot prove:

```text
human speech → microphone → Chrome speech service → transcript alternatives
→ Flow semantic ranking → shared action/transaction pipeline → product state and motion
```

The fake-recognition Vitest and Playwright journeys prove the application half of this path. They do not prove acoustic capture or Chrome transcription quality.

## Current status

- Persistent fake recognition, exact 14-command journey: **PASS**
- One recognizer construction / one explicit activation: **PASS**
- Exactly eight domain history entries: **PASS**
- Native Chrome/macOS acquisition smoke: **PASS — previously reached Live listening and stopped cleanly**
- Exact physical spoken journey below: **NOT RUN**

Acquisition is not acoustic acceptance. Do not mark this matrix PASS from injected transcripts.

## Setup

1. Complete a current clean `npm run qa:release`.
2. Run `npm run dev` and open the printed local URL in current Chrome for macOS.
3. Reset Flow to its fresh document and close unrelated recording applications.
4. Allow microphone permission for the local origin.
5. Activate Flow Live exactly once.
6. Speak all fourteen phrases naturally, without manually navigating or clicking the microphone again.
7. Record the exact displayed transcript and state after every phrase.

Optional diagnostic mode records text alternatives and semantic results, never audio:

```js
localStorage.setItem("flow.voice.diagnostics", "true")
```

## Exact one-session acceptance journey

| # | Spoken phrase | Required result | Transcript | Verdict |
| --- | --- | --- | --- | --- |
| 1 | Home. | Home opens; no entity/history change. | NOT RUN | NOT RUN |
| 2 | Book dinner at Pizzeria Roma tomorrow at eight. | One 60-minute Dinner at Pizzeria Roma event is created tomorrow at 20:00. | NOT RUN | NOT RUN |
| 3 | Make it red and important. | The same Dinner ID becomes red and important in one history entry. | NOT RUN | NOT RUN |
| 4 | I need to renew my passport before Senegal. | One Outcome is created directly with target condition Before Senegal; no Capture duplicate. | NOT RUN | NOT RUN |
| 5 | The first step is check the requirements. | The recent Outcome's first planned template is renamed and remains its next step. | NOT RUN | NOT RUN |
| 6 | Schedule it Thursday after work. | That same step receives one stable linked Today event at the first safe slot from the workday-end preference. | NOT RUN | NOT RUN |
| 7 | I promised Maya the proposal by Friday. | One I-owe Commitment and one normalized Maya person exist with Friday due state. | NOT RUN | NOT RUN |
| 8 | I am waiting for Daniel's contract confirmation. | One Waiting-on Commitment exists for Daniel; no date is invented. | NOT RUN | NOT RUN |
| 9 | What needs me now? | Embedded Now shows deterministic eligible recommendations; no entity/history change. | NOT RUN | NOT RUN |
| 10 | Move the two PM meeting to four. | The unique 14:00 Roadmap event moves to 16:00 with stable ID, or a real conflict asks one focused clarification. | NOT RUN | NOT RUN |
| 11 | Undo. | Complete state returns exactly to before row 10. | NOT RUN | NOT RUN |
| 12 | Redo. | Complete state returns exactly to after row 10. | NOT RUN | NOT RUN |
| 13 | Home. | Home opens; no entity/history change. | NOT RUN | NOT RUN |
| 14 | Pause listening. | Live Session enters sleeping/off state without a second activation. | NOT RUN | NOT RUN |

## Pass rule

All fourteen rows must pass in one foreground Live Session from one explicit microphone activation. The clean final document must contain:

- exactly eight domain history entries;
- one stable red/important Dinner at Pizzeria Roma;
- one Passport Outcome, zero duplicate Capture items, three editable steps, and one scheduled-step link;
- distinct Maya I-owe and Daniel Waiting-on commitments;
- Roadmap at 16:00 after redo;
- no navigation or unsupported transcript persisted as data;
- no duplicate final boundary and no second microphone start.

Any material transcript ambiguity must clarify without mutation. Any unsupported transcript must explain the failure and leave data/history unchanged.

## Device record

- Chrome version: NOT RUN
- macOS version: NOT RUN
- Microphone: NOT RUN
- Browser language: NOT RUN
- Room conditions: NOT RUN
- Date: NOT RUN
- Exact 14-command acoustic verdict: **NOT RUN**

## Visual reward release — separate physical acceptance

Synthetic application voice path: **PASS in the automated release evidence when its manifest is green**. Physical acoustic journey below: **NOT RUN**. The earlier native acquisition smoke does not verify this journey or the current microphone, permission, speech-service, or room conditions.

Use the current production build in Chrome. Begin from a fresh, inspectable local document containing a unique 2 PM meeting, dinner anchor, and flexible work; preserve existing personal data by using a separate browser profile for the fixture. Check that Tomorrow has the intended focus availability. If the available window differs from 40 minutes, the actual deterministic proposal is the correct result; do not fabricate a 28-minute window. Activate Live once and keep the page foreground for the complete sequence. Sound may stay Off, and the journey must remain understandable in Reduced motion.

| # | Spoken phrase | Required result | Exact heard transcript | Physical verdict |
| --- | --- | --- | --- | --- |
| 1 | Tomorrow. | All Home lenses adopt Tomorrow; no domain history entry. | NOT RUN | NOT RUN |
| 2 | Open focus. | Focus opens; the same Live Session stays active. | NOT RUN | NOT RUN |
| 3 | Give me 40 minutes. | Actual availability determines the safe proposal or focus reservation; the limit and next anchor remain clear. | NOT RUN | NOT RUN |
| 4 | Do it. | The current proposal starts exactly once, or an already active session stays unchanged. | NOT RUN | NOT RUN |
| 5 | Go to today. | Today's time scope is restored without creating data or restarting recognition; the following edit works from the current route. “Open today” explicitly opens Calendar when needed. | NOT RUN | NOT RUN |
| 6 | Make the two PM meeting red and important. | The unique target becomes red and important atomically; no unrelated event is restyled. | NOT RUN | NOT RUN |
| 7 | I'm 35 minutes behind. Keep dinner. | Tide commits one viable recovery, preserves dinner/fixed anchors, shows the actual result, and settles fully. | NOT RUN | NOT RUN |
| 8 | What am I forgetting? | Deterministic shared-state recommendations appear without creating data. | NOT RUN | NOT RUN |
| 9 | Undo. | The entire last domain transaction restores exactly; active presentation cancels. | NOT RUN | NOT RUN |
| 10 | Redo. | The same complete state returns with at most Level-2 presentation. | NOT RUN | NOT RUN |
| 11 | Go home. | Home opens while the one Live Session remains active. | NOT RUN | NOT RUN |
| 12 | Pause listening. | Listening stops without a second microphone activation. | NOT RUN | NOT RUN |

Record Chrome/macOS versions, microphone, language, room conditions, date, exact transcript, and state for every row. Pass requires all twelve rows from one activation, no navigation/unsupported text persisted as data, no duplicate command execution, one history entry per logical transaction, and zero motion residue. A real ambiguous target must ask one focused clarification without mutation. Report synthetic and physical verdicts separately.
