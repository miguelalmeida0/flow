# Flow recovery mission

## Mandate

Turn the current scripted voice-calendar demo into a credible, delightful, zero-cost local-first product. Do not merely widen a regex or add more quick-command strings. The result must accept ordinary calendar language, execute deterministic schedule changes safely, recover from a day running late, and explain ambiguity without losing data.

The reported production symptom is:

> “Try a simpler change. I did not move anything. Example: ‘Move flexible work after 2.’”

That message appears for normal voice commands. Treat this as a release-blocking architecture defect.

## Orchestration

Use the configured project agents sequentially:

1. Spawn `flow_mapper` and `flow_language_auditor` in parallel. They are read-only. Wait for both reports.
2. Spawn `flow_principal` with both reports and this mission. It owns all implementation.
3. After implementation and the worker’s complete local validation, spawn `flow_qa` independently.
4. If `flow_qa` finds any failure, send the exact report back to `flow_principal`. Repeat implementation and QA until every release gate passes.
5. The parent agent must inspect the final diff and validation evidence before declaring completion.

Do not stop after planning, diagnosis, or a partial parser patch.

## Phase 1 — establish truth

Before editing:

- run the application,
- reproduce the unsupported-command behavior through typed input,
- inspect microphone behavior in the real browser when access is available,
- trace all relevant files and tests,
- record the current supported command grammar,
- identify seed-specific behavior and silent data-integrity risks,
- run the existing checks to establish the baseline.

Do not assume the supplied diagnosis is complete.

## Phase 2 — repair the domain contract

The current single-command model is too weak for statements such as:

> “I’m 35 minutes behind, keep dinner at 7, move anything low priority to tomorrow, and give me 20 minutes before the interview.”

Implement the smallest composable request contract that can represent:

- one or more actions,
- event selectors,
- date/time destinations,
- duration changes,
- positive constraints,
- negative constraints,
- confidence/clarification when needed.

Do not build a generic workflow engine. Keep it calendar-specific and readable.

## Phase 3 — build a real local interpreter

Separate concerns so each module has one job:

- normalize transcript,
- parse numbers and durations,
- parse clock and relative-time expressions,
- split compound clauses without losing “but”/“don’t” constraints,
- detect action verbs,
- resolve event selectors against current calendar context,
- produce success, clarification, or unsupported outcomes.

The interpreter may use one small date/time dependency after evaluating bundle and maintenance cost. It must not use a paid API, hosted model, local large language model, or network request.

The same final transcript string must follow the same pipeline as typed text.

## Phase 4 — generalize scheduling

Remove all seed-specific logic. Scheduling must operate on event properties and selectors rather than IDs such as `roadmap`, `interview`, `deep-work`, or `email`.

Implement general, pure transformations for the required command families in `docs/internal/automation/AGENTS.md`.

At minimum:

- add an event,
- move an event to an absolute time,
- move an event before/after another event,
- shift a selector by a relative duration,
- resize an event,
- protect/unprotect an event,
- fit an event inside a window,
- recover from a delay while preserving explicit constraints,
- defer events to tomorrow,
- delete after confirmation,
- undo and redo atomically.

When a requested plan is impossible, do not silently drop an event. Return a precise conflict with direct options such as:

- move low-priority work to tomorrow,
- shorten a flexible event,
- choose a different window,
- explicitly unlock a protected event.

## Phase 5 — make voice trustworthy

Refactor the browser recognition adapter so it exposes:

- supported/unsupported,
- idle/listening/stopping/error states,
- interim transcript,
- final transcript,
- normalized error reason,
- stop/cancel behavior,
- default language from `navigator.language` with a small explicit selector when useful,
- an injectable adapter seam for deterministic tests.

Handle at least:

- permission denied,
- no microphone/audio capture,
- no speech,
- recognition network failure,
- aborted/stopped,
- unsupported browser.

Do not clear the transcript so quickly that the user cannot see what was heard.

## Phase 6 — elite but restrained UX

Preserve the existing calm visual direction. Improve only what makes the interaction understandable and immediate.

Required states:

- listening: live transcript and clear stop control,
- understanding: brief non-blocking state,
- applying: affected blocks lift/highlight before settling,
- completed: exact summary of moves and protected constraints,
- clarification: one unresolved question with up to three direct options,
- confirmation: compact preview for destructive changes,
- conflict: show the blocked interval/events and safe next actions.

Do not add a sidebar full of settings, chat bubbles, a command log, generic cards, or decorative animation. The calendar is the dominant object.

A compound request should produce one coherent choreography: anchored events stay visibly still, flexible events move, deferred work exits toward tomorrow, and a recovery buffer opens where requested.

## Acceptance utterances

These must work from the typed command field. The fake recognition adapter must prove the same final transcripts work through the voice path.

### Basic movement

1. `Move my workout to 6.`
2. `Put the workout at six pm.`
3. `Reschedule deep work for 2:30.`
4. `Move email before lunch.`
5. `Put the selected event after the interview.`
6. `Shift everything after lunch 30 minutes later.`
7. `Move all flexible work after 2.`
8. `Push the afternoon back by half an hour.`

### Create and fit

9. `Add a 30 minute walk at 5.`
10. `Schedule a twenty minute break before the interview.`
11. `Block one hour for reading tomorrow morning.`
12. `Fit a 40 minute workout before dinner.`
13. `Make room for a 25 minute break between 3 and 5.`
14. `Find the next free 45 minute slot for study.`

### Resize

15. `Make email 20 minutes.`
16. `Shorten the selected event by 15 minutes.`
17. `Extend deep work by half an hour.`
18. `Make the workout one hour long.`

### Constraints

19. `Protect lunch.`
20. `Do not move the interview.`
21. `Keep dinner at 7.`
22. `Make lunch flexible.`
23. `Fit a 40 minute workout before dinner and don't move lunch.`
24. `Move flexible work after 2 but keep the interview and dinner fixed.`

### Recovery

25. `I'm 35 minutes behind. Keep dinner at 7.`
26. `I'm running half an hour late; save my afternoon.`
27. `I lost 45 minutes. Move low priority work to tomorrow.`
28. `I'm late. Give me 20 minutes to breathe before the interview.`
29. `Recover the day without moving lunch or dinner.`
30. `Push what can move and protect my fixed appointments.`

### Tomorrow and destructive actions

31. `Move the roadmap to tomorrow morning.`
32. `Defer low priority work until tomorrow.`
33. `Move email to tomorrow.`
34. `Cancel the dentist appointment.` — must require confirmation.
35. `Delete the selected event.` — must require confirmation.
36. `Never mind.` — cancels a pending confirmation or clarification.

### History and help

37. `Undo that.`
38. `Redo.`
39. `What changed?`
40. `Start over.`

### Speech variants and filler

41. `Could you please move my workout to six?`
42. `Actually, put deep work before lunch.`
43. `I need you to shift my afternoon by thirty minutes.`
44. `Uh, can you fit a quick twenty minute walk before dinner?`
45. `Move the roadmap tomorrow, but please don't touch the interview.`
46. `Keep dinner where it is and make room for a break.`

### Clarification and conflict

47. `Move the meeting to 4.` when two meetings match — must clarify.
48. `Move this after lunch.` with no selected event — must clarify selection.
49. `Put workout at 25.` — reject invalid time without mutation.
50. `Fit a three hour workout before dinner.` when impossible — show conflict/options, no data loss.
51. `Move lunch over the interview.` — do not violate protection/fixed constraints silently.
52. `Shorten dentist.` when duration is missing — ask for duration.

Expand this into at least 60 table-driven parser cases by adding punctuation, casing, number-word, 12/24-hour, and title variants.

## Product-flow acceptance scenarios

### Scenario A — ordinary natural command

- Reset to seed data.
- Type `Could you move deep work to 2:30 and keep lunch fixed?`
- Deep work moves to 2:30 if valid.
- Lunch does not move.
- Feedback states both facts.
- One undo restores the complete prior plan.

### Scenario B — recover the day

- Start from a realistic mixed plan.
- Type `I'm 35 minutes behind, keep dinner at 7, move low priority work to tomorrow, and give me 20 minutes before the interview.`
- All clauses are represented and applied atomically.
- Fixed/protected events remain anchored.
- The low-priority event exists tomorrow, not deleted.
- The buffer is placed without collision.
- One undo restores everything.

### Scenario C — clarification

- Create two events containing `meeting`.
- Type `Move the meeting to 4.`
- No plan change occurs.
- UI asks which meeting and offers both event titles.
- Selecting one completes the original request without retyping it.

### Scenario D — destructive confirmation

- Type `Cancel the dentist appointment.`
- The event remains until confirmation.
- UI previews the removal.
- `Never mind` cancels.
- Repeating and confirming removes it.
- Undo restores it.

### Scenario E — voice parity

- Inject final transcript `Fit a 40 minute workout before dinner and don't move lunch.` through the recognition adapter seam.
- Verify the exact same parsed request and resulting plan as typed input.
- Verify interim transcript never executes.
- Verify final transcript executes once only.

### Scenario F — persistence

- Apply a compound command.
- Reload the page.
- Confirm the full plan, deferred events, protection states, and history policy behave as documented.
- Invalid stored data fails safely to a fresh plan.

## Nonfunctional release gates

- No console errors or unhandled promise rejections.
- No unexpected network requests from core planning.
- No event data loss under parser, scheduler, undo, or persistence failures.
- Keyboard operation for event selection, command submission, choices, confirmation, undo, and redo.
- Reduced-motion mode preserves meaning.
- Responsive at desktop and narrow mobile widths without horizontal-page overflow; the timeline itself may scroll intentionally.
- Existing premium visual system retained or improved.
- No component becomes a god file; extract by behavior, not by arbitrary line-count churn.
- Build output contains no large NLP/model asset.

## Required final verification

Run and report actual results for:

```bash
npm install
npm run lint
npm run test:run
npm run build
npx playwright install chromium
npm run test:e2e
```

Also provide:

- one browser screenshot or appshot of a successful compound recovery,
- one screenshot of a clarification state,
- one screenshot of destructive confirmation,
- a command-support matrix in the README,
- updated `docs/internal/automation/AGENTS.md` architecture and extension guidance,
- a concise `docs/quality/VERIFICATION.md` containing environment, commands, pass/fail status, and honest untested areas.

## Definition of done

This mission is complete only when a new user can speak or type ordinary calendar language without knowing the demo phrases, the calendar changes safely and visibly, ambiguous/destructive requests are handled deliberately, and the independent `flow_qa` agent returns PASS.
