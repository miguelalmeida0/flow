# Flow Tide implementation checkpoint

Paused safely at the user's request on 2026-09-03 (Europe/Berlin).

## Freeze state

- Repository: `~/Downloads/flow-voice-calendar`
- Git state: this workspace has no `.git` directory; no commit was created and no Git history is claimed.
- Active implementation agent `/root/tide_principal`: interrupted after its current tool/turn boundary.
- Independent QA agent `/root/tide_qa`: interrupted after its current tool/turn boundary.
- Mapper and language-auditor reports are complete and were already delivered to the principal.
- No browser was launched during the pause operation.
- No validation command was started during the pause operation.
- The only pause-time repository mutation is this checkpoint file.
- Process enumeration was unavailable in the managed sandbox (`ps: operation not permitted`), so this record does not claim OS-level process inspection.

## Last principal checkpoint

The principal's last report, before interruption:

- Compilation succeeded.
- `npm run lint`: PASS.
- `npm run build`: PASS — 538.53 kB JavaScript / 167.21 kB gzip.
- `npm run test:e2e -- --list`: PASS — 23 tests discovered across 3 files; Chromium was not launched.
- Targeted parser/domain/component gate: 83/83 PASS before the latest two regressions were added.
- Last full Vitest run: 244/245; the sole failing AnimatePresence timing assertion was reported fixed, but the full rerun had not yet returned before the pause.
- The principal reported these routed defects closed in source: semantic golden failures, no-op provenance/binding, done-only reopen, current-day Breathing Room filtering, protected preview geometry, odd split preservation, undo/redo and What Changed causality, and required Flow B split-part placement.
- Remaining work reported by the principal: final full gates, documentation/inventory refresh, and truthful no-browser evidence status.

These are last-known reports, not a final independent verdict. The tree was interrupted before a final green run and before independent QA.

## Independent QA state at pause

Independent QA had not returned PASS. It was waiting for a stable principal completion checkpoint before running its final source/static assessment.

The following late findings were routed to the principal but were not acknowledged as completed before interruption and therefore remain open/unverified:

1. Architecture conformance: `scheduling/engine.ts` is 835 lines, `useFlowPlanner.ts` 350, `interpretation/tideInterpreter.ts` 325, and `EventBlock.tsx` 274. The handoff explicitly rejects god hooks and giant parser/scheduler/component files. Extract cohesive, feature-owned pure modules/components without altering behavior.
2. Design-token conformance: move `EventBlock.tsx` raw changed-state shadow `shadow-[0_18px_44px_rgba(0,0,0,0.34)]` into a semantic centralized token.
3. Deterministic Tide proof: add a pure regression that runs an actually moving/deferring proposal repeatedly and with equivalent reordered input, asserting identical action order, output plan, score, and no input mutation.
4. Final documentation: regenerate `docs/quality/VERIFICATION.md` from the actual final green run. Its current counts and inventory are stale and incomplete.

QA had also routed these findings during the remediation loop. The principal reported the group closed, but final independent verification is still required:

- no-op actions must not mutate provenance or report false completion;
- compound anaphors must bind to the last resolved target even if the preceding clause was a no-op;
- deferred linked Breathing Rooms must not render or affect density/scoring on today;
- linked Breathing Rooms must preserve geometry and lifecycle across move, resize, split, merge, defer, delete, undo, redo, and reload;
- undo/redo and What Changed must reconstruct exact causal movement/highlights from transaction diffs;
- protected/anchored drag previews must keep the real card fixed until confirmation;
- odd-duration splits must preserve exact total duration;
- reopen positional references must choose completed events, not later planned events;
- split-part relative placement must support `Split deep work into two 45-minute sessions and keep one before lunch` atomically;
- generic category nouns in filtered batches must not become accidental title filters;
- all golden language issues listed below must be fixed semantically, not snapshot-accepted:
  - leading `and` in merge lists;
  - dates retained in create titles;
  - source time lost for `fourteen hundred` shifts;
  - split ordinal anaphor binding;
  - contextual `move dinner to eight` AM/PM handling;
  - reopen resolution over done items;
  - `a one hour` double-counting;
  - number-word title cleanup;
  - Breathing Room range duration;
  - resize title-selector cleanup;
  - color-filter selectors;
  - `everything after lunch` source filter;
  - exact-time references such as `the 2 PM event`;
- unprotect must reverse anchor/mooring choreography with reduced-motion equivalence;
- active/done lifecycle state must constrain Tide, batches, and current-event resolution;
- confirmation must disclose and authorize the entire risky compound action set;
- repeated merge lineage and split/merge canonical anaphors must remain correct;
- reset must be a truthful no-op and preserve provenance/history when nothing changes;
- direct interaction pointer-cancel/lost-capture cleanup and >=44 px hit targets must remain covered.

## Current documentation/evidence status

- `docs/quality/VERIFICATION.md` currently states 211 Vitest tests, 130 new Tide outcomes / 286 total outcomes, and 20 Playwright tests. Those values are stale relative to the later principal checkpoint and must not be quoted as final.
- `docs/quality/design-qa.md` correctly remains `awaiting local release run` because no current browser-rendered Tide screenshot exists.
- Managed Chromium execution remains blocked by the macOS sandbox before page creation.
- Do not relaunch Chromium in the managed environment.
- `artifacts/tide-release/` does not yet contain trustworthy complete current Tide release evidence.
- `artifacts/release-qa/results.json` is stale pre-Tide evidence and must not be used for this release.
- Physical microphone acceptance is NOT RUN.
- Synthetic final-transcript testing is not a substitute for the physical microphone result.

## Important current files

Files added during this mission include at least:

- `src/features/day-planner/BreathingRoomBlock.tsx`
- `src/features/day-planner/CurrentTimeMarker.tsx`
- `src/features/day-planner/InlineFeedback.tsx`
- `src/features/day-planner/directManipulationPreview.ts`
- `src/features/day-planner/eventDefaults.ts`
- `src/features/day-planner/interpretation/tideInterpreter.ts`
- `src/features/day-planner/scheduling/engineTypes.ts`
- `src/features/day-planner/scheduling/linkedBreathingRooms.ts`
- `src/features/day-planner/tide/buildTideProposal.ts`
- `src/features/day-planner/tide/classifyDensity.ts`
- `src/features/day-planner/tide/scoreSchedule.ts`
- `src/features/day-planner/tide.test.ts`
- `src/features/day-planner/tideLanguage.test.ts`
- `src/features/day-planner/__snapshots__/tideLanguage.test.ts.snap`
- `e2e/tide-helpers.ts`
- `e2e/tide-release.spec.ts`
- `docs/quality/design-qa.md`

This list is intentionally labeled `at least`: the final exact added/modified/removed inventory must be regenerated after implementation stabilizes because the repository has no Git metadata.

## Exact resume sequence

1. Re-read repository `docs/internal/automation/AGENTS.md`, this checkpoint, `docs/quality/VERIFICATION.md`, and the handoff prompt/acceptance files before editing.
2. Resume `/root/tide_principal` first as the sole writer. Give it the four open/unverified late findings above and require it to finish the architecture extraction, token fix, determinism regression, and final documentation.
3. Have the principal run the complete non-browser local gates and report exact output:
   - `npm run lint`
   - `npm run test:run`
   - `npm run build`
   - `npm run test:e2e -- --list`
4. Only after the principal reports a stable green tree, resume `/root/tide_qa` for a fresh independent release assessment. QA must inspect all previously routed findings, architecture, language semantics, invariants, release scripts, and documentation.
5. If QA finds any source/static failure, route the exact report back to the principal and repeat until source/static QA is clean.
6. Do not claim final release PASS without current external browser evidence. From a normal local macOS Terminal, the required command remains `npm run qa:release`; it must produce the complete `artifacts/tide-release/` evidence set with empty error arrays and all required screenshots.
7. After external evidence exists, have independent QA inspect results, report, screenshots, traces where relevant, implementation, and `docs/quality/VERIFICATION.md`. Record physical microphone results separately.
8. Final completion requires independent `flow_qa` PASS. Do not infer or fabricate it.

## Product constraints that remain in force

- React + strict TypeScript + Tailwind semantic tokens; local deterministic scheduling only.
- No paid API, hosted LLM, backend, authentication, image generation, OAuth, or calendar-provider integration.
- Typed input and final voice transcripts share one interpretation/scheduling pipeline.
- No seed-ID or seed-time scheduling rules.
- Compound requests are atomic and one undoable transaction.
- Never silently lose, duplicate, overlap, or mutate events.
- Fixed/protected events do not move without explicit authorization.
- One focused clarification for material event/time ambiguity.
- Preserve and strengthen the original 181-test foundation and the release harness.
- The signature command remains a mandatory real-UI atomic flow:
  `Make the 2 PM meeting important and red, give me 20 minutes before it, and move anything flexible out of the way.`

