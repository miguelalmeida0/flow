# Current candidate — September 8 critical voice-control rebuild

**IMPLEMENTATION ACTIVE — NOT RELEASE-APPROVED.** This section supersedes all historical candidate statuses below. The authoritative mission is the September8 critical voice-control attachment; its complete checkpoint is `artifacts/voice-control-rebuild-20260908/RESUME.md`.

Latest root-inspected native boundary run: `journal-native-final5.log` **46 PASS,2files,10.88s** (39 mounted Journal cases plus7 pure acquisition cases). Earlier RED logs preserve premature audio writes before acquisition persistence, unsaved pause/resume feedback, stopped-native acquisition and lost final unmount chunk. These now have focused regression coverage. The same ten legacy recording utterances run typed and final-transcript native-callback variants against independently asserted acquired fixtures; these are not new corpus seeds or physical-microphone evidence. Full current-source gates remain outstanding.

All283 brief-source contracts and200 selected source-supplement recipes are independently reviewed and archived, not runtime-admitted. Aggregate unchanged metadata checks on2500legacy +458 eligible pending +281 eligible brief =3239 potential rows have no reported duplicate/grammar/cap violations; two brief quota-only holds retain their regression contracts. This does not establish the required4000 admitted corpus or final ordering.

Newest root-inspected Journal milestone: `journal1720-iteration1.log` **1733 PASS /518 filtered,2files,27.31s** covers1720 strict legacy boundary/full-state contracts plus13 mounted lifecycle tests. Recording acquisition now uses an actual native-start/CAS-bound continuation instead of precommitting recording and empty media metadata. Remaining native callback/persistence controls and all full release gates below still apply; this is not physical-microphone evidence.

Latest root-inspected focused evidence: `legacy1420-iteration2.log` **1430 PASS /514 filtered,2files,11.20s** covers1420 strict legacy cases and partial-calendar-creation controls. `combined1009-iteration1.log` **1035 PASS /69 filtered,3files,9.52s** covers all475 pending proposals plus534 independently declared legacy cases and selected regressions. `legacy1120-iteration1.log` **1129 PASS /514 filtered,2files,8.31s** covers1120 strict legacy cases plus9 Capture frame controls. `capture-atmosphere-compatibility.log` **399 PASS /3files,4.83s**. These overlapping runs are not summed into a release count. Filters identify deliberately scoped runs, not skipped release requirements.

Independently reviewed literal contracts now cover the remaining legacy cohorts, including all400 Commitments,436 Captures and300 Journal cases. Static source-coordinate/span/ID checks are not runtime tests. Of475 passing proposals, current metadata review identifies458 potentially eligible unique additions after13 duplicates and4 canonical-cap holds; none is yet claimed as admitted quota. Equivalent capability-family aliases are consolidated rather than used to inflate diversity. Final corpus size, ordering and all required inventories remain unverified.

Latest complete source suite remains historical iteration5 **1654PASS/10FAIL,63files,298.18s**; subsequent focused repairs do not replace a final full lint/type/unit/integration/build run. Corpus admission, full current browser/error/layout evidence, independent flow_qa and physical-microphone journey remain outstanding. Newly reviewed source contracts and simulated transcripts are not physical acceptance. No new independent release PASS is claimed.

## Prior candidate evidence — historical, not September 8 acceptance

# Flow real-user acceptance repair — final functional checkpoint

## Latest isolated comparison — complete

The user authorized the new stop-only VIGIA window, which completed without removals or Flow code changes. Current-source wake benchmark **PASS10/10**: rawms48.8,35.4,65.7,51.3,53.7,34,51.2,22,31.6,31; median42.1ms, nearest-rank p9565.7ms, min22/max65.7. All samples are actual wake-handler→ElementTiming acknowledgement paint, not physical ASR or whole-transition timing. Compared with prior227.1ms single observation, median is185ms lower; no causal single-variable claim. All287+4 source/build hashes remain identical.

Full locked-Home suite8/8PASS. Canonical motion **25PASS/2FAIL**, exit1: first20-cycle resource audit passes max16.8ms/drop0; signature matrix fails `Tomorrow` vs stale prior transcript after5000ms; desktopTide capture misses early native checkpoints.139/144 canonical frames, not full visual approval. No automatic retry, code optimization or threshold adjustment followed. The original18/9 motion result below is historical, not the latest run. Physical microphone/audible acceptance remains NOT RUN; overall release remains BLOCKED.

Full new evidence and statistics: `artifacts/real-user-acceptance/isolated-performance-20260907/REPORT.md`. Runtime stop/status/settling ledger is alongside it. VIGIA remains stopped; Continuum stays stopped, ClickHouse not running; Chronos/Common Ground untouched. Flow preview restarted into terminal95902 on4174. The benchmark container exited1 due to the two retained motion failures. Completed independent `INDEPENDENT-QA.md` in that directory verifies wakePASS10/10, all291hashes matched, canonicalFAIL and overallBLOCKED. No newer source edits are in progress.

## Earlier functional candidate status — new isolated results above take precedence

**Overall release: BLOCKED. Independent `flow_qa`: functional/evidence assessment PASS.** Implementation and local validation are finished; the independent written assessment found no additional verified production defect. No source/test edits or test runs are active. Failed canonical motion and missing isolated-wake/physical acceptance are not waived. Final verdict: `artifacts/real-user-acceptance/INDEPENDENT-QA.md`.

- `npm run check`: exit 0; lint, **1,260/1,260 tests / 56 files / 218.11s**, strict TypeScript and production build (683 modules, 1.74s).
- Deterministic corpus: **33,500/33,500**, zero recorded atomicity violations. This is not physical speech or wake timing.
- Complete `npm run test:e2e`: exit 0; cold **1/1** plus functional/evidence **106/106**, merged **107/107**, no skipped/unexpected/flaky tests. The merged log is not another test execution.
- Development gate: **13/13 PASS**. Dedicated acceptance within the full run: **12/12 PASS**, zero console/page/unexpected-request errors; two raw explained native preload aborts remain recorded.
- Native synthetic-device media: **167,551 bytes / 10.859977 decoded seconds**, real post-reload playback/seek (`paused: false`, `readyState: 4`, `error: null`). Physical microphone and human audible playback: **NOT RUN**.
- Geometry: 24 unique wake sizes, 14 workspace samples/seven sizes and 14 Home/Calendar samples/seven sizes; zero measured intersections. Independent QA directly inspected all twelve final acceptance PNGs and four Now PNGs; transient images are not settled-motion approval.
- Canonical `qa:motion`: last complete run **18 passed / 9 failed / exit 1** under recorded contention. Maximum frame 216.7ms > 200ms; normal dropped-frame rate 10.313% > 8%; unchanged 900,000ms stress timeout; seven native checkpoint/pairing failures. Contention is not proven to be the sole cause.
- Final equivalent-isolation ten-trial wake benchmark: **NOT RUN**. The original ONE stop-only window was consumed; renewed VIGIA stop-only authority remains pending. Do not restart Continuum or stop unrelated workloads without authorization.

Current evidence: `artifacts/real-user-acceptance/now-final-source-check.log`, `now-final-host-corpus/`, `now-final-e2e2-20260907/`, `now-final-dev-20260907/`, `REPORT.md`, `VISUAL-REVIEW.md`, and completed independent report `INDEPENDENT-QA.md`, all within that artifact directory. The exact remaining failed/blocked gates were routed back to `flow_principal`; no code mutation or unchanged-contamination stress rerun followed.

Exact inventory: `artifacts/real-user-acceptance/source-inventory-now-redo-candidate.json`: **54 modified / 20 added / zero removed**, against recorded historical bytes, not Git history or authorship. Final root read-only hash check: **287 source/test/config + four built assets matched; zero mismatches or unexpected src/e2e files**. JS `index-CCCjq-7X.js` is served on port4174. The last edit after the full source gate was E2E-only Redo synchronization, retaining Level2/neutral and strengthening direction + exact document equality; targeted12/12 and final107/107 passed. No production byte changed afterward.

## Historical checkpoint log — superseded

The entries below retain their original timing and claims for provenance. Words such as “current,” “pending,” and “running” below describe those older checkpoints, not the authoritative candidate above.

# Flow real-user acceptance repair — previous checkpoint

**Current release verdict: BLOCKED. Independent reassessment has not yet run for this candidate.**

The emergency real-user repair is in progress. Its current report is
`artifacts/real-user-acceptance/REPORT.md`; previous candidate verdicts below are historical.

**Latest repaired-source validation: PASS.** `npm run check` exited 0: lint, **1,260/1,260 tests in 56 files (218.11 seconds)**, strict TypeScript and build (683 modules, 1.74 seconds). Evidence: `artifacts/real-user-acceptance/now-final-source-check.log`; current JS `index-CCCjq-7X.js`, CSS `index-DuS0QPdl.css`. The Now defect reproduced four failed integration tests before repair; expanded focused verification passed 27/27. Targeted Chromium passed **5/5 in 14.4 seconds**: two actual-UI date/cache journeys plus three evidence-helper regressions. Root inspected all four new Now screenshots. The complete browser entrypoint is running once under `now-final-e2e-20260907/`; no result is assumed. Immutable `source-inventory-now-candidate.json` records 54 modified, 20 added and zero removed source/test files against the saved baseline, plus 287 current hashes and the built assets. Overall release remains BLOCKED by the unfinished full/independent gates, failed non-isolated motion evidence and missing physical acceptance.

**Current follow-up, not release approval:** pixel/code review confirmed that Now mixes the actual clock with the displayed past/future calendar, and cached recommendations can remain stale. A bounded actual-date read projection and fresh-candidate repair is pending. The latest complete browser entrypoint passed cold motion 1/1 and functional 102/103; its only functional failure was a premature legacy recording-stop snapshot, subsequently corrected without changing its result contract (targeted 3/3 PASS). Dedicated acceptance is 12/12, development is 13/13. The current non-isolated canonical motion run has failed its first frame-budget test and its second test's unchanged 900,000ms timeout; it is retaining the remaining visual captures. VIGIA was materially busy at run start. Contention is an observed confounder, not a proven sole cause, and no limit is waived. Renewed workload-stop permission, final independent review and physical acceptance remain pending.

**Latest complete production-source gate: PASS — 1,247/1,247 tests in 54 files (252.05 seconds), lint, strict TypeScript and build (683 modules, 3.33 seconds), exit 0.** Evidence: `artifacts/real-user-acceptance/frozen-validation-20260907/source-check-host.log`. Built JS `index-CcyXKcAV.js`, CSS `index-DuS0QPdl.css`. Production/unit-test inputs are frozen; later E2E-only observer/regression edits receive separate full lint and browser validation. The earlier container timeout remains below, unchanged. Full Chromium, development, canonical motion, isolated wake and physical gates are not yet approved.

**Latest frozen-source gate: PASS.** `npm run check` exited 0: lint, **1,244/1,244 tests in 54 files (185.37 seconds)**, strict TypeScript, and production build (**683 modules, 3.81 seconds**). Log: `artifacts/real-user-acceptance/final-validation-20260907/source-check.log`. The fresh generated corpus passed **33,500/33,500** cases with zero atomicity violations; mean interpreter/transaction evaluation 1.009 ms, maximum 17.013 ms (not physical speech or wake latency). Built JS is `index-ZpN3FVRz.js`. Canonical motion and full post-repair Chromium/dev gates are in progress; this source pass is not release approval.

The subsequent canonical motion gate finished **24 passed / 3 failed, 10.6 minutes**, despite both stress tests and all 120 signature cycles passing. Reward pill geometry entered three reserved heading regions. A later placement-only correction changed two responsive class tokens in `RewardLayer`; all three affected native captures passed (3/3, 15.3 seconds), with the corrected 20% frames directly reviewed. Therefore the 1,244-test source pass above precedes that bounded correction. No result is retroactively reassigned to changed bytes.

The complete existing `npm run test:e2e` entrypoint then passed its cold motion process **1/1 in 26.4 seconds**, but the functional process failed **99 passed / 2 failed in 10.9 minutes** (`artifacts/real-user-acceptance/full-e2e-final-20260907/browser.log`). Acceptance journey 06 reports a native blob abort that needs lifecycle correlation despite successful real playback/seek; journey 07 persisted two of three expected intentional prose segments. Both failures are under investigation, not waived. Final source/motion/browser validation, all 13 development StrictMode cases, independent QA, isolated wake and physical acceptance remain open.

- Fresh full source check: **1,237/1,237 tests in 54 files passed** in 189.61 seconds, followed by strict TypeScript and production build (681 modules, 2.07 seconds). Command exit 0. Log: `artifacts/real-user-acceptance/full-validation-20260907/source-check.log`.
- The fresh production pipeline corpus reports **33,500/33,500 cases passed**, 31,313 expected executions completed, and zero atomicity violations. These are deterministic generated direct/dialogue cases, not physical speech. Full reports are retained under the fresh run's `artifacts/voice-intelligence/` directory.
- The first dedicated twelve-journey Chromium run was interrupted at journey 09 when Docker stopped. Incorrect new test assumptions about all-date event counts were subsequently corrected without deleting events or weakening scheduling invariants. **No full regression PASS is claimed.**
- After correcting the active-day projection assertions, the dedicated acceptance suite passed **12/12 in 52.8 seconds**, exit 0 (`browser-seeded-day.log`). It verifies populated-day creation and flexible reflow, exact Undo/Redo, native media persistence/playback, Journal control separation and workspace geometry. The subsequent full regression result below supersedes any implication of release approval from those twelve journeys.
- The subsequent frozen **100-test production Chromium run failed: 77 passed / 13 failed / 10 serial followers did not run, 8.5 minutes, exit 1** (`full-validation-20260907/chromium.log`). Failures include obsolete pre-wake/five-lens selectors and temporal Back assumptions, a reproduced collapsed-dock interim-transcript defect, motion timing/settle checks, native capture connectivity, and newly reported blob request aborts requiring lifecycle classification. Each remains a failure until resolved and rerun; no blanket filtering or weakened assertion is approval. Fresh 03 Home listening pixels are settled and readable, but 12 reload's stable gate failed.
- Two production defects reproduced **2 failed → 2 passed**: interim speech after actual dock collapse, and consecutive completed commands leaving Home at executing. Lint/build passed after the bounded fixes. The affected 45-test browser rerun is in progress under `artifacts/real-user-acceptance/regression-repair-20260907/`. `regression-repair-map.md` documents each legacy assertion replacement; no tests were removed and no skips/retries were added.
- Saved native media evidence: a **173,683-byte Opus/WebM recording**, decoded duration **11.219977 seconds**, survived reload and real playback/bookmark seeking. The captured player had `paused: false`, `readyState: 4`, no media error, and current time 5.385976 seconds. This uses Chromium's synthetic microphone, not a physical microphone.
- The 1280×720 wake screenshot visibly separates text and mascot. The first run's `04-home-calendar-targeted.png` caught the subsequent route; the resumed and dedicated passing runs contain a genuine pre-dispatch native compositor frame with capture provenance. Root directly inspected all twelve `browser-seeded-day/` PNGs; 03/12 are transitional, not settled Home approval, and require supplements. Geometry passes at 24 unique viewport sizes. See `artifacts/real-user-acceptance/VISUAL-REVIEW.md`.
- On resumption Docker's socket and Flow's preview listener were absent. Flow's preview was restarted on port **4174**, then the user explicitly approved Docker Desktop startup. Its `on-failure` policy automatically restarted Continuum; root immediately stopped the exact orphaned container to restore its required stopped state. No resources were deleted. Native VIGIA processes remain active pending separate performance-isolation permission.
- Physical microphone and audible human acceptance: **NOT RUN**. The worksheet is `artifacts/real-user-acceptance/PHYSICAL-MICROPHONE.md`.
- Current-source isolated wake benchmark: **PENDING**. The earlier isolated ten-trial median 50.5 ms / p95 73.5 ms belongs to the unchanged prior candidate, not this repair.

No release or portfolio-ready claim is warranted until the remaining gates are actually verified. Historical failures and partial evidence are preserved.

### Latest final-pass follow-up

The repeated-final failure was traced to nested Journal passage IDs omitted from the existing allocator's occupied-ID set. Pure/controller regressions failed before correction; after including passages/bookmarks/drawings, **25/25 affected tests passed**, including exact rapid-final Undo/Redo. The unchanged browser 06/07 journeys then passed **2/2 in 45.8 seconds** (`media-identity-targeted-20260907/browser.log`). Native audio cancellation evidence now retains browser event time separately from runner delivery; ambiguous request correlation must remain unexpected.

The subsequent complete `npm run check` **failed: 1,246 passed / 1 timed out in 54 files, 391.48 seconds** (`artifacts/real-user-acceptance/frozen-validation-20260907/source-check.log`). The existing Home attention/outcome/preparation integration exceeded its unchanged 5,000 ms test deadline. No assertion failure was reported, but this is not a pass and the build was not reached. VIGIA PostGIS was concurrently observed at about 233% CPU; its contribution is not proven by that observation alone. The unchanged test is being examined. No timeout increase or blanket environment waiver is authorized.

## Historical locked voice Home assessment — superseded by the checkpoint above

Date: 2026-09-07. **Independent `flow_qa` verdict: FAIL — implementation findings resolved; performance and physical acceptance remain open.** No older PASS below applies to this candidate.

## Independent QA correction — current source

Final independent reassessment found no additional reproducible application defect in its bounded review. See `artifacts/locked-home-independent-final-qa.md`. Required wake/target timing and complete-motion evidence still fail; physical microphone and audible playback remain NOT RUN. The raw browser log field `historyExact: true` checks only `past.length` after reload, not full past/future snapshots. It is retained unchanged for provenance and must be read as **preserved history count**, not exact history-array persistence.

Independent `flow_qa` found two additional production projection defects. Both were reproduced before repair (`artifacts/locked-home-independent-findings-red.log`: **2 failed / 11 passed**):

1. Home showed expired morning events at 2:22 PM. `calendarPreview.ts` now selects the current/upcoming schedule for today, the beginning of a future day, and recent chronological history for a past day. An ended day is not filled with stale appointments. Explicit targets and clarification candidates remain prioritized; IDs and event object identity stay unchanged. Done/cancelled and wrong-date regressions are covered.
2. The Journal plus Sunday evening compound acknowledged Home. `voiceWorld.ts` now projects the primary destination from its existing typed compound steps. Secondary Atmosphere does not replace Journal, and an unrelated prior entity cannot become the compound's target. No parser, scheduler or transaction engine was changed.

Current focused source gate: **41/41 tests in four files**, touched-file ESLint, strict TypeScript and production build PASS (**677 modules, 4.17 s**). Logs: `artifacts/locked-home-independent-findings-final-tests.log` and `artifacts/locked-home-independent-findings-build.log`.

The repaired voice compound browser journey **passed** at `artifacts/locked-home-independent-repair/`: the observed acknowledgement was `{text: "Journal found", domain: "journal", route: "/", past: 0}` before execution. The compound then committed once; exact Undo/Redo and Journal dictation passed. Its initial typed test passed the edit and Undo, then timed out because an `isVisible` probe raced the intentionally receding unfocused dock before `fill("Redo")`; Redo was never submitted. That **1/2** run and failed helper trace are preserved. Only the test helper changed to the real Control+K focus shortcut before fill/Enter. The corrected typed journey **passed 1/1** at `artifacts/locked-home-independent-typed-proof/`: exact document reload and preserved history count, edit/Undo/Redo and no horizontal overflow at 390 px; console/page/request errors were empty. This is scoped functional evidence, not a full performance gate or responsive visual approval.

Direct review of that 390×844 screenshot found a separate visual defect: the desktop mascot perch covered the Home headline and exact-transcript copy. The bad screenshot is preserved. The bounded correction keeps one Motion owner, places the character in a reserved centered compact perch and leaves desktop placement unchanged. Focused ESLint, **10/10 tests in two files (22.16 s)**, strict TypeScript and production build passed (**678 modules, 3.37 s**); logs are `artifacts/locked-home-responsive-tests.log` and `artifacts/locked-home-responsive-build.log`. The final responsive browser supplement **passed 1/1 in 34.7 s** under `artifacts/locked-home-responsive-proof/`, with every pairwise mascot/heading/transcript/dock rectangle intersection empty at **1440×1000 and 390×844**. It repeated keyboard edit/Undo/Redo and exact document reload and preserved history count; all browser error arrays were empty. Both PNGs were directly reviewed: the narrow overlap is repaired; the desktop PNG caught the phase-heading fade and is labeled transitional, not a settled readability proof. The earlier voice/typed proof builds predate this placement-only correction; current source/build hashes identify the responsive supplement, not a retroactive full-suite PASS.

## Repairs and causal evidence

- Wake acknowledgement, preparation timers, Element Timing observers and animation frames now belong to one cancellable action. Following speech and unmount cannot resurrect an old wake ceremony.
- Recognition callbacks can renew an expired foreground lease only if their exact claim remains the persisted winner. Foreign ownership, hidden state, stop and unmount cannot renew it. The expired-final failure was reproduced before repair; quiet-cycle restart is also covered.
- Spoken clarification choices such as “The first one” resolve against the pending candidate set; candidates appear in the Home preview without premature history.
- Motion observes actual card transforms and visible pulse geometry. The held endpoint cannot disappear before acknowledgement. A second demonstrated race was repaired: Motion's last update can precede its DOM write, leaving Undo waiting forever. The observer now checks the next real frame and is cancelled on interruption/replacement/unmount; it does not bypass visibility or fabricate a paint time.
- Home typography derives contrasting ink from the actual animated surface. The active background initializes correctly on first active mount and return, avoiding an ivory-on-ivory transition and dark flash.

The failed Calendar trace proves speech acquisition was working: `Undo` is the input value at trace time 191159.392 ms; its own Calendar acknowledgement appears at 191297.857 ms; recognition generation advances 4→5. The old committed-transcript attribute remains unchanged because execution waits behind the pulse handshake. The endpoint is visibly present at 196494.420 ms. Regression log `artifacts/locked-home-late-pulse-reproduction.log` records **1 failed / 4 passed** before the next-frame correction; `artifacts/locked-home-late-pulse-fixed.log` records its green verification.

## Actual validation output

| Command / evidence | Actual result |
| --- | --- |
| `npm run check` → `artifacts/locked-home-final-source-check.log` | **Exit 2**. Lint passed; **48/48 test files, 1139/1139 tests passed** in 322.97 s. TypeScript then rejected a test-only unchecked-index annotation. Do not describe this command as exit 0. |
| Corrected annotation + initial-active surface supplement | Touched-file ESLint, **13/13 tests in 3 files**, strict TypeScript and production build passed. Logs: `locked-home-final-presentation-supplement.log`, `locked-home-final-build.log`. |
| Final late-pulse observer supplement | Touched-file ESLint, **17/17 tests in 3 files**, strict TypeScript and production build passed; 676 modules built in 3.91 s. Logs: `locked-home-late-pulse-fixed.log`, `locked-home-late-pulse-build.log`. |
| Matched Docker Playwright 1.62.1 production preview, 7 scenarios, 1 worker, no retries | **4/7 passed, 3/7 failed**, 273.88987 s. Report: `artifacts/locked-voice-home/playwright-results.json`; log: `artifacts/locked-home-frozen-browser.log`. |
| Browser error arrays | **0 console, 0 page, 0 first-party request errors in all 7 scenarios.** |
| Final two-scenario Calendar/entrance supplement | **Calendar move→Undo PASS; wake FAIL** (<100 ms paint and complete frame sampling). Both error arrays empty. Separate report under `artifacts/locked-home-observer-supplement/`. It cannot replace the failed full gate. |
| Independent projection repairs | **41/41 tests in 4 files**, touched-file ESLint, strict TypeScript and build PASS. Voice compound browser PASS; the separate initial keyboard helper failed before submitting Redo, preserved in the **1/2** report. |
| Corrected actual keyboard/reload proof | **1/1 PASS**; exact document/history and no horizontal overflow. Direct review still found narrow mascot/text overlap, subsequently fixed. |
| Final responsive correction | **10/10 tests in 2 files**, ESLint, strict TypeScript, build PASS. Browser **1/1 PASS, 34.7 s**; explicit no-intersection checks at both sizes; keyboard edits, exact document Undo/Redo/reload and preserved history count; browser errors **0**. |

The complete corpus was not rerun after the test annotation and bounded presentation/projection corrections. Additional focused regressions have been added; do not claim a fresh full-suite pass beyond the recorded 1139-test run. Affected tests, strict TypeScript and each final build were rerun.

## Browser and motion findings

The seven-scenario run passed Journal compound + exact undo/redo + voice dictation, Atmosphere/contextual reference follow-ups, ambiguity/highlight/spoken choice, and reduced motion. It failed wake performance/frame completeness, target timing, and Calendar Undo's now-repaired presentation race.

- Wake acknowledgement: **542.7 ms** against <100 ms. Five of six independent choreography intervals were sampled; only two distinct body transforms were observed; four wake animations still ran at the last sampling threshold. Wake-to-Home was **3182.1 ms** against ≤3000 ms. `preparingPainted` was absent. These are failures, not a motion PASS.
- Calendar target publication→paint: **291.3 ms** against ≤140 ms, using the explicitly labeled frame-fence fallback. Publication→execution: **482.8 ms** against ≤320 ms. Observed order remained eyes→body→world→pulse→execution: 7298.3 / 7540.2 / 7706.3 / 7740.9 / 7745.9 ms. This proves order, not budget compliance.
- The native sampler observed a non-zero pulse interval and a genuine intermediate stable-identity Calendar rectangle `(112.410, 543.801, 480.103 × 55.810)`. Several frame gaps were large, up to **670.3 ms**. Screenshot files named “intermediate” captured after settling and are not represented as motion-frame proof.
- Full transcript latency and publication→paint latency are recorded separately in `artifacts/locked-voice-home/verification.json`; neither is relabeled as the other.
- Parent's read-only 16:10 host snapshot showed load **42.22/38.85/37.89** and substantial CPU consumption by several unrelated containers. Contention is an observed confounder, not proven to be the sole cause. No unrelated workloads were stopped.

Original thresholds remain release-failing assertions. Soft expectations let the run preserve additional evidence but do not convert failures into passes. The full seven-scenario report predates the final pulse-observer correction; the source hashes in the manifest identify the current supplemented source, not a retroactive full-run pass.

## Evidence and genuine boundaries

The original run has **7/12** required named 1440×1000 PNGs. The final supplement contains the remaining **5/12**, not substituted into the original report. All twelve were opened directly at original resolution; nine additional unmodified native wake JPEGs were inspected for contrast and phase continuity. The supplement measured **227.1 ms** wake first paint, **2737.6 ms** total wake-to-Home, genuine preparation paint and **5/6** independent sampled intervals. Calendar movement and exact Undo passed on the final source. See `docs/quality/design-qa.md` for the direct visual assessment and `artifacts/locked-voice-home/verification.json` for exact hashes, inventories, reports and missing files.

Physical microphone: **NOT RUN**. Audible atmosphere playback: **NOT RUN**. Synthetic final-recognition tests do not prove acoustic acquisition or speaker output. First microphone permission requires a browser-trusted gesture; granted permission can support the foreground wake-aware session. Browser speech support and service availability remain platform-dependent. The build retains the >500 kB chunk advisory.

No release approval, portfolio-readiness claim or final commit is warranted while the strict motion gate and physical acceptance remain incomplete. The repository has no Git metadata; no commit was created.

## Exact resumed-repair file inventory

These are the files changed during the resumed principal repair, not an invented Git diff of the entire historical product. The broader locked-Home implementation inventory remains in the explicitly historical section below. The manifest hashes the current source/test/configuration files and the four built outputs.

- Wake/presentation: `src/features/voice-home/wakeAcknowledgementEvent.ts`, `WakeAcknowledgement.tsx`, `WakeAcknowledgement.test.tsx`, `useVoiceWorld.ts`, `useVoiceWorld.test.ts`, `HomeDomainCard.tsx`, `VoiceEnergy.tsx`, `HomePreviews.tsx`, `homeSurfaceInk.ts`, `homeSurfaceInk.test.ts`.
- Home/shell: `src/features/home/HomeSpace.tsx`, `src/features/home/useCompactHome.ts`, `src/features/home/useCompactHome.test.ts`, `src/app/FlowEnvironmentApp.tsx`, `src/app/FlowLockedVoiceHome.test.tsx`.
- Ownership: `src/features/voice/liveOwnership.ts`, `liveOwnership.test.ts`, `useFlowLiveSession.ts`, `useFlowLiveSession.test.tsx`.
- Clarification: `src/shared/command/globalInterpreter.ts`, `src/shared/command/voiceEmergencyRegression.test.ts`.
- Independent QA projections: `src/features/voice-home/calendarPreview.ts`, `calendarPreview.test.ts`, `voiceWorld.ts`, `voiceWorld.test.ts`; the already-listed Home preview, app integration test and browser spec were extended.
- Browser/evidence: `e2e/locked-voice-home.spec.ts`, `scripts/summarize-locked-home-evidence.mjs`, `docs/quality/VERIFICATION.md`, `docs/quality/design-qa.md`; generated current and supplemental reports/logs/traces/screenshots described above. Prior failures were preserved.

## Superseded candidate report — historical only

The measurements and approval language below belong to an older candidate. They are preserved for provenance and are **not evidence for the current source**.

# Historical Flow locked voice Home — principal verification

Date: 2026-09-07
Principal implementation verdict: **VALIDATION IN PROGRESS — the measurements below describe the superseded candidate until fresh final gates replace them**
Independent `flow_qa` verdict: **PENDING RE-ASSESSMENT — this document does not self-approve the release**
Historical visual design QA: **SUPERSEDED — not current-source evidence**
Physical microphone: **NOT RUN — deterministic final-recognition parity is green but does not substitute for real acoustic acquisition**
Audible autoplay: **NOT RUN — persisted atmosphere state and controls are green; no audible-device claim is made**

## Locked direction delivered

Home is a voice-led state machine backed by one application-shell recognition owner. With previously granted browser permission, it begins wake-armed in the foreground without another click. Non-wake speech before activation is visible but cannot navigate, mutate data, or enter history. Bare `Flow` and `Hey Flow` produce a measured rendered acknowledgement, complete the authored wake ceremony while preparation overlaps, and arrive at the live Home autonomously. `Flow, <command>` preserves the exact transcript and sends the command through the same global interpreter and transaction boundary as typed input. The first microphone permission still requires a browser-trusted gesture, as browsers require.

Active Home projects the real `LifeDocument`: Calendar, Journal, Atmosphere, and Memories. Empty Journal and Memories remain honestly empty. Calendar and Atmosphere read the persisted schedule and Studio state. The mascot, waveform, transcript, phase, semantic domain, target, action, confidence, clarification, and error state all derive from one canonical interpretation result.

## Architecture implemented

```text
one shell recognition adapter / typed command dock
  → exact transcript + bounded wake envelope
  → canonical global interpreter
  → resolved semantic intent and target
  → persistent shell render acknowledgement
  → observed eyes → body → world → pulse handshake
  → existing LifeAction / CalendarRequest execution
  → invariant validation + revision-checked persistence
  → one atomic history record
  → reward/motion/world projection
```

- `voice-home/wakeEnvelope.ts` owns only wake-prefix handling. It never interprets domain language or mutates data.
- `voice-home/voiceWorld.ts` projects canonical resolutions into presentation semantics and resolves calendar object targets through the real resolver.
- `voiceMotionHandshake.ts` owns action-scoped, non-persistent render observations. The shell publishes a coherent target acknowledgement immediately and records genuine Element Timing paint when supported; the frame fence is capability fallback only.
- `useVoiceWorld.ts` gates execution on the observed visual handshake. Normal motion requires non-zero eyes, then body, then world, then pulse progression and a post-motion presentation frame. A diagnostic timeout reports a stalled handshake; it does not silently bypass the visual contract.
- The target acknowledgement and pulse live at the application shell, so route unmount cannot erase the response. Reduced motion keeps the semantic acknowledgement and one pulse frame without transform choreography.
- `FlowEnvironmentProvider` remains the sole execution/commit/history owner. Presentation state never enters persistence or undo history.
- `GlobalCommandDock` remains the sole shell voice owner. Typed submissions and final recognition transcripts call the same `runCommand`; interim recognition never executes.

## Functional coverage

- Permission-once foreground auto-resume when browser permission has already been granted.
- Wake-armed safety: non-wake speech does not route, navigate, persist, or enter history.
- Bare and prefixed wake forms, while system phrases such as `Flow sleep` retain precedence.
- Complete wake reward plus overlapping autonomous preparation and arrival.
- Four real-data previews with stable event identity across Home ↔ Today continuity.
- Canonical target projection for navigation, calendar events, Journal, Atmosphere, Memories, Focus, Capture, and existing domains.
- Exact transcript visibility, focused clarification/error projection, and meaningful microphone errors.
- Compound `Open my journal and leave Sunday evening playing` as one atomic transaction and one exact undo/redo entry.
- Existing Calendar, Capture, Outcomes, Commitments, Focus, weather, insights, Studio, global history, persistence, reward, and speech-recognition capabilities remain on the same shared pipeline.

## Validation performed

| Gate | Actual result |
| --- | --- |
| Focused handshake regression | **PASS — 4/4 files, 79/79 tests; 37.55 s total, 27.38 s test time** |
| Focused touched-file ESLint | **PASS — exit 0 in 4.89 s** |
| Strict TypeScript | **PASS — `npx tsc -b --pretty false`, exit 0 in 9.51 s** |
| Exact `npm run check` | **PASS — exit 0; lint, 43/43 test files, 1118/1118 tests, strict TypeScript, production build** |
| Unit/integration duration | **PASS — 225.86 s total, 173.22 s test time** |
| Production build within `check` | **PASS — Vite 7.3.6, 673 modules in 2.06 s; JS 929.81 kB / 271.24 kB gzip; CSS 67.14 kB / 12.68 kB gzip** |
| Matching Docker Playwright 1.62.1 | **PASS — 6/6 locked-Home Chromium scenarios in 59.0 s** |
| Wake response | **PASS — real Element Timing measured 41.9 ms from final transcript to first coherent rendered wake response; budget <100 ms** |
| Target response | **PASS — real Element Timing measured 76.4 ms; paint-before-execute true** |
| Observed staging | **PASS — production observations: eye 19.8 ms, body 74.7 ms, world 113.4 ms, pulse 256.1 ms, execute 320.0 ms after acknowledgement** |
| Calendar continuity | **PASS — stable event geometry progressed through multiple non-zero intermediate rectangles in both directions** |
| Fresh visual evidence | **PASS — 12/12 files, every image 1440 × 1000, visually inspected at original resolution and hash-recorded** |
| Browser errors | **PASS — 0 console, 0 page, 0 first-party request errors** |
| Physical microphone / audible autoplay | **NOT RUN / NOT RUN** |

The exact browser command was run once on the final source in the matched Playwright image:

```bash
docker run --rm --name flow-locked-home-final-proof --shm-size=1g --cpu-shares=4096 --cpus=6 -v $PWD:/work -v flow-locked-home-node-modules:/work/node_modules -w /work -e CI=1 -e FLOW_RELEASE_QA=1 mcr.microsoft.com/playwright:v1.62.1-noble npx playwright test e2e/locked-voice-home.spec.ts --project=chromium --workers=1
```

The run passed 6/6 in 59.0 seconds. It was not retried. All scenario cleanup assertions observed empty console, page-error, and first-party request-error arrays.

## Measured motion proof

- Wake transcript delivery was `1710.10 ms`; first rAF `1733.90 ms`; Element Timing paint `1752.00 ms`; measured acknowledgement `41.90 ms`. Wake reward lasted `1328.20 ms`, preparation `1103.10 ms`, and total wake-to-Home `2431.30 ms`. Samples covered the full ceremony and verified it remained present while preparation began, with no running wake animation at settle.
- Target acknowledgement was published at `5811.60 ms` and Element Timing painted at `5888.00 ms`, a `76.40 ms` response. Production observed eye/body/world/pulse readiness at `5831.40 / 5886.30 / 5925.00 / 6067.70 ms`; execution began at `6131.60 ms`. Relative order was `19.8 < 74.7 < 113.4 < 256.1 ≤ 320.0 ms`.
- The independent computed-style sampler saw non-zero eyes at `20.7 ms`, body at `75.1 ms`, and Calendar-card world motion at `301.1 ms`. The semantic pulse travelled from `(720, 847.25)` to `(210, 582.172)` across two intermediate frames, reached approximately `1.0` progress, and covered `431.31 px`.
- The same Calendar event progressed from `(73, 554.672, 274 × 52)` through `(79.796, 597.132, 335.912 × 54.394)`, `(147.150, 483.364, 639.970 × 57.731)`, `(178.365, 430.640, 780.880 × 59.277)`, and `(187.810, 414.687, 823.517 × 59.745)` to `(192.953, 406, 846.734 × 60)`. Identity and text remained stable.

## Invariants verified

- Wake/preparing/presentation and handshake state is ephemeral and absent from `LifeDocument`, storage, and history.
- Unknown and pre-wake speech cannot fall through to Capture or create data.
- Navigation and presentation do not create undo entries.
- A compound logical request commits completely or not at all and creates one history entry.
- Undo/redo restores the exact Studio workspace and atmosphere state.
- Typed commands and final voice transcripts enter the identical interpreter/controller path.
- Stable IDs, no-loss, no-duplication, collision, protected/fixed-event, persistence, cross-tab CAS, reward, and global undo/redo tests remain green.
- Paint occurs before execution; normal-motion execution cannot bypass the observed staged progression.
- Reduced motion preserves semantic meaning without requiring decorative travel.
- Home preview and destination `EventBlock` reuse stable event identity in forward and inverse continuity.

## Visual evidence assessment

All 12 current PNGs under `artifacts/locked-voice-home/` were opened directly at their original 1440 × 1000 resolution. The set is one fresh run from 12:59:15–13:00:04 +0200, not mixed-age evidence. Wake-armed, reward, preparing, and active states preserve the intended editorial hierarchy and one continuous mascot identity. The reward image records the authored warm wash while the character begins entering; the preparing image shows the full character and emerging real-data cards. Journal/Atmosphere, Today, return-to-Home, Calendar undo, contextual Atmosphere follow-up, and reduced-motion destinations are legible, coherent, and free of duplicate controls, dark-shell residue, clipping, or settled transition debris. The two intermediate Calendar captures are supported by the browser's non-zero pulse and identity-geometry samples; a still image alone is not represented as proof of elapsed motion.

The superseded failed evidence remains intact at `artifacts/locked-voice-home-pre-persistent-handshake/` and is not counted in this candidate.

## Honest remaining limitations

- A browser-trusted user gesture is unavoidable for the first microphone permission grant. The no-repeat-click behavior begins after permission has been granted once.
- Web Speech recognition is browser/platform dependent and foreground-only. Flow has deterministic retry/error behavior, not an offline speech-to-text engine.
- Physical microphone acquisition and the real acoustic wake/compound journey remain a separate acceptance gate.
- Audible atmosphere autoplay was not listened to on physical output hardware; deterministic state and control behavior is covered, acoustic quality is not.
- Element Timing was available in the matched Chromium gate; production retains an observed frame-fence fallback for browsers that do not expose it.
- The production bundle still triggers Vite's standard >500 kB chunk advisory. Rollup also reports two harmless pure-comment notices in the Zod dependency. Neither warning changed gate status.
- Final independent `flow_qa` approval is still pending; this principal report does not manufacture it.

## Exact locked-Home implementation and evidence files

- `src/shared/motion/voiceMotionHandshake.ts`
- `src/shared/motion/voiceMotionHandshake.test.ts`
- `src/shared/motion/voiceTargetStages.ts`
- `src/features/voice-home/wakeEnvelope.ts`
- `src/features/voice-home/wakeEnvelope.test.ts`
- `src/features/voice-home/voiceWorld.ts`
- `src/features/voice-home/voiceWorld.test.ts`
- `src/features/voice-home/useVoiceWorld.ts`
- `src/features/voice-home/VoiceEnergy.tsx`
- `src/features/voice-home/HomeDomainCard.tsx`
- `src/features/voice-home/HomePreviews.tsx`
- `src/features/home/HomeSpace.tsx`
- `src/core/mascot/mascot-model.ts`
- `src/core/mascot/StaticMotionMascotRenderer.tsx`
- `src/features/day-planner/EventBlock.tsx`
- `src/app/FlowEnvironmentProvider.tsx`
- `src/app/FlowEnvironmentApp.tsx`
- `src/shared/command/GlobalCommandDock.tsx`
- `src/app/FlowLockedVoiceHome.test.tsx`
- `src/app/FlowEnvironmentApp.test.tsx` (runner observation budgets only; product assertions unchanged)
- `src/shared/command/appleSemanticCorpus.test.ts` (per-partition runner budget only; all 2,960 assertions unchanged)
- `src/app/FlowAppleAcceptance.test.tsx`
- `e2e/locked-voice-home.spec.ts`
- `artifacts/locked-voice-home/*.png` (12 fresh normalized captures)
- `artifacts/locked-voice-home/verification.json`
- `artifacts/locked-voice-home-pre-persistent-handshake/` (preserved superseded failure)
- `docs/quality/design-qa.md`
- `docs/quality/VERIFICATION.md`

## Independent QA handoff

The final source has one green exact `npm run check` and one green matched-container six-scenario Chromium gate, with genuine Element Timing, observed non-zero staged geometry, paint-before-execute, stable Calendar continuity, normalized screenshot evidence, and empty browser-error arrays. `artifacts/locked-voice-home/verification.json` records the exact measurements and hashes. Physical microphone and audible-device results remain explicitly unclaimed. The candidate is ready for independent `flow_qa` re-assessment.

---

# Historical Flow visual reward and motion intelligence — release verification

Date: 2026-09-06
Principal implementation verdict: **READY FOR INDEPENDENT RE-ASSESSMENT — iteration-3 product and harness failures repaired; fresh complete release gate pending**
Independent `flow_qa` verdict: **FAIL — the preceding candidate failed 11 of 80 production Chromium checks; all reported causes are repaired and re-assessment is pending**

## Release delivered

Flow keeps its deterministic, local-first calendar and LifeState transaction engine, and now gives every successful action an honest visual response. A committed typed action produces a typed reward event only after local persistence succeeds; `RewardDirector` derives its intensity, applies suppression and accessibility policy, then coordinates feature motion, optional WebAudio, and the local DOM/SVG mascot. Reward presentation cannot mutate the document, add history, or manufacture success.

The complete product remains usable without a paid API, hosted language model, backend, authentication, OAuth, calendar-provider connection, generated imagery, Three.js, WebGL, shaders, or a second business-logic path. Typed commands and final browser-recognition transcripts still enter the same global interpreter, typed action model, invariant validator, atomic transaction boundary, persistence layer, and exact undo/redo history.

## Baseline and product transformation

The frozen entry baseline is recorded in `docs/VISUAL_REWARD_BASELINE.md`: 728/728 unit/integration tests and the unchanged 59/59 Chromium suite passed in the matching Playwright container, while direct managed-host Chromium failed at process launch with EPERM/SIGABRT. At entry, Flow had route/event Motion, three measured shared-flight kinds, a Tide path, and a local mascot form, but no typed reward contract, director, suppression/fatigue policy, sound-consent runtime, reward preferences, inspector, 144-frame matrix, or reward performance gate.

The completed release makes product consequences—not decoration—the source of motion. Movement uses Tide, protection uses Anchor, creation/completion uses Bloom, and history uses a neutral response. Success meaning remains in the rendered domain state after every animation settles. The same rules apply on Home and every utility world.

## Root causes repaired

- The previous UI had no typed post-commit reward contract. Facts are now derived from stable-ID before/after state plus the executed typed actions, including Tide-generated movement that is not represented by authored summary text.
- Reward emission occurs synchronously after successful persistence. Hydration, migration, remote adoption, weather refresh, previews, clarification, cancellation, no-op, failed persistence, and hidden-tab work cannot replay a ceremony.
- One compound transaction produces one reward event and at most one sound. Runtime transaction IDs, per-entity coalescing, Level-3 cooldowns, and cancellation prevent duplicate or queued celebration.
- Undo cancels active presentation before exact state restoration and reports a neutral inverse; redo is capped at Level 2 and never replays the original ceremony.
- WebAudio is a lazy, StrictMode-safe singleton, remains **Off by default**, requires an explicit user gesture, and cancels nodes on new work, history, visibility changes, preference changes, and unmount.
- Mascot behavior now has explicit semantic states (`resting`, `attentive`, `listening`, `understood`, `thinking`, `resolved`, `focused`, `small-win`, `big-win`, `uncertain`), no permanent listening loop, and an honest static-motion DOM/SVG fallback because no `.riv` asset exists.
- Preferences now expose Motion System/Full/Reduced, Sound Off/On, and Mascot Helpful/Minimal. The stable command-dock owner prevents the preferences popover from disappearing when the dock expands; explicit submit, voice toggle, or outside interaction dismisses it.
- Motion ownership is explicit. Shared transitions use measured transform-FLIP, feature elements have one transform owner, and all paths, washes, clones, outlines, labels, and mascot poses are interruptible and settle completely.
- Level-3 Focus requires meaningful elapsed completion. Outcome completion and commitment-kept ceremonies require durable semantic completion facts. Dismissed insights are treated as acted-on only when a real typed action records that outcome.
- Completed Focus, Outcomes, Commitments, and reclaimed Calendar work retain readable semantic results after motion ends. The reclaimed event marker was strengthened for mobile contrast and legibility.
- Persistent history is compacted and schema-hydrated without changing exact `lastTransaction`, undo/redo, cross-tab revision/CAS, or reward semantics.
- Voice final deduplication is keyed to recognition-boundary IDs: duplicate finals within one boundary execute once, while identical text from distinct recognition cycles remains a legitimate repeated command.
- Calendar event, timeline, and Breathing Room owners now obey Flow's in-app Reduced preference as well as the OS setting. Important-event markers explicitly finish at opacity one instead of remaining invisible after their initial state.
- Native motion evidence no longer mixes Playwright's simulated rAF/performance clock with WAAPI. A Date-only fixture preserves native animation time; 96 intermediate PNGs carry actual compositor frame-swap timestamps within fixed bounds, while 0/100 frames record genuine pre-trigger/settled intervals. Command visibility is required even in the compact mobile state. Transient reward activation is observed before the trigger with a fresh event ID, and Home's actual 480 ms native scene—not its separate acknowledgment—anchors temporal travel.
- Shared-flight paper can resize without stretching its co-moving text. Production geometry regression and all four viewport frame sequences verify readable, unscaled text with one aria-hidden clone and no settled residue.
- Home-lens route continuity now scales only a dedicated aria-hidden paper surface. Today and utility-world headings remain outside that transform; native Home → Today frames verify readable text and no overlap with Now throughout entry.
- “What am I forgetting?” uses the existing read-only shared-state recommendation selector on every route. Its response names real candidates and reasons; neither the query nor unrelated unsupported input writes data/history. Portfolio beats now assert supported outcomes rather than merely waiting after submission.
- Development CSS discovery is scoped to `src`, rather than scanning preserved HTML/report artifacts. A native Vite CPU profile attributed a cold 32.8-second HTTP response stall to Tailwind's scanner; the unchanged first-acquisition test then passed after this source-scope repair. No startup timeout or browser budget was extended.

## Runtime architecture

```text
typed submit / final recognition transcript
  → one global transcript and intent pipeline
  → typed LifeAction[] / CalendarRequest
  → pure draft transformation + invariants
  → revision-checked local persistence
  → one atomic history record
  → frozen typed RewardEvent
  → RewardDirector
  → intensity + suppression + accessibility policy
  → feature motion / consented audio / mascot state
```

`FlowEnvironmentProvider` remains the sole local commit/history boundary. The reward layer consumes immutable facts after that boundary; it does not write `LifeDocument`, persistence, or history.

## Reward semantics implemented

- **Level 0 — no reward:** failures, ambiguity, confirmation pending/cancelled, previews, no-ops, persistence conflicts, refresh/hydration/migration, remote sync, ambient data, hidden tabs, and unsupported input.
- **Level 1 — acknowledgment:** accepted navigation or selection, voice acknowledgment, and small style changes.
- **Level 2 — resolved work:** create, move, resize, defer, protection, Breathing Room, Focus start, capture routing, step advance, commitment reservation, and acted-on insight.
- **Level 3 — earned milestone:** actual Tide recovery, meaningful elapsed Focus completion, semantically complete Outcome, and a real kept Commitment. Only one Level-3 ceremony may be active, and cooldowns prevent repetition.
- **History:** undo is a neutral inverse and redo is capped at Level 2.

The six release signatures are Tide recovery, Focus completion, Outcome completion, Commitment kept, temporal scene travel, and Capture-to-Outcome transformation. Each has a durable semantic end state that remains understandable with reduced motion or no animation.

## Motion, mascot, and audio ownership

- **Motion for React 12.43.0 (installed)** owns declarative layout, presence, and semantic element transitions. Central recipes and tokens define duration, easing, spring, intensity, and reduced variants. The declared `^12.23.12` dependency range is not the installed version.
- **Measured transform-FLIP** in `SharedFlightLayer` owns the one cross-world source clone and its curved path. It animates transforms from measured geometry rather than competing left/top/width/height writes.
- **GSAP is not installed or used.** The measured Motion implementation met the performance and geometry gates, so adding a second animation owner would increase risk without solving a measured defect.
- **Rive is not claimed.** No valid `.riv` file was supplied. `MascotRenderer` therefore selects the honest `StaticMotionMascotRenderer` DOM/SVG implementation with the same semantic state contract and accessibility policy.
- **Mascot safe zones and sparse presence are enforced.** Only actual listening/understanding or an active earned Level-3 moment may appear on Home, and only when measured bounds clear all lens content, controls, temporal navigation and the command dock. Wrapped/short Home layouts suppress it even at desktop widths. Rest, routine navigation/editing, focused work, utility worlds, narrow viewports and shared flights show no character. An earned milestone never overrides control safety.
- **WebAudio** is synthesized locally from the lazy singleton in `sound-director.ts`. It uses no asset download or network service, defaults Off, begins only after an explicit Sound On gesture, spaces cues, plays no more than one per transaction, and always remains supplementary to visual/text meaning.

## Signature interaction results

- **Tide recovery:** “I’m 35 minutes behind. Keep dinner.” commits a real recovered schedule atomically. Fixed/protected anchors stay still, flexible events move or defer explicitly, the recovered-minute result remains visible, and no event disappears.
- **Focus completion:** a real elapsed session can earn Level 3 only after the completion threshold; an immediate stop remains at most Level 2. Completion leaves a durable “Focus complete” and protected-minute result rather than only changing a number.
- **Outcome completion:** a semantically completed Outcome receives one bounded Bloom, durable completed copy, and no contradictory editing controls.
- **Commitment kept:** a genuinely completed promise receives one Anchor ceremony and leaves a durable relationship fact after it exits the open list.
- **Time travel:** all five Home lenses move as one temporal scene, without a reward/history entry for initial hydration or browser back.
- **Capture to Outcome:** the real captured card has one measured flight to the real destination, one clean path, at most one clone, and zero residue at settle.
- **Undo/redo:** undo interrupts active motion, sound, and mascot state before exact restoration; its inverse is neutral. Redo restores the exact change but caps presentation at Level 2.

## Reduced motion and accessibility

System/Full/Reduced is available inside the product and combines with the OS preference conservatively. Reduced mode removes decorative travel and ceremonies while preserving immediate hierarchy, source/destination meaning, durable semantic results, and exact state. Visibility loss suppresses and cancels sensory output.

Every reward has text/domain meaning independent of color, sound, or animation. Controls have semantic roles and keyboard focus, motion does not delay the underlying commit, the mascot is `aria-hidden`, sound is opt-in, and animations avoid uncontrolled permanent loops. The 144-frame browser matrix covers desktop, laptop, tablet, and mobile containment; release tests also cover hidden documents, reduced motion, sound off, mascot minimal, rapid interruption, and StrictMode.

Actual development StrictMode is now a separate required 12-case signature matrix, not inferred from the production wrapper. A read-only standard DevTools observer verifies the development renderer, `StrictEffectsMode`, and native strict probes. Every signature is interrupted while its fresh reward is active through actual UI controls, in Full and Reduced modes; exact history (or non-mutating temporal projection), route/resize/visibility interruption and zero settled residue are asserted. The unchanged one-click microphone acquisition case remains separate.

## Supported product capabilities

- **Calendar:** create, move, shift, resize, rename, recolor, label, importance, mobility, protect/unprotect, Breathing Room, fit, recover, defer, split/merge, complete early, confirmed delete, batch edit, what-if preview, day boundaries, automatic Tide reflow, drag/resize parity, and exact undo/redo.
- **Living environment:** Home, Today, Focus, Weather & Outfit, People/Commitments, Good to know, Capture, Outcomes, and Outcome detail share one `LifeDocument` and route-independent command system.
- **Cross-space:** explicit Capture, Capture-to-Outcome, editable/schedulable steps, three commitment directions, plan/person/calendar lineage, deterministic recommendations, and exact global history.
- **References:** time, title, partial title, current/next event, selected entity, `this`/`that`/`it`, recent entity, person, ordinal choice, and conversational context. Material ambiguity produces one focused clarification with at most three choices.
- **Voice:** one foreground recognition owner, exact interim/final transcript display, retry and ownership recovery, recognition-boundary deduplication, deterministic fake recognition, and full parity with typed execution.
- **Reward controls:** System/Full/Reduced motion, explicitly consented sound, Helpful/Minimal mascot, development-only inspector (`Shift+R`), and deterministic production-action demo mode (`?rewardDemo=reset`).

## Invariants verified

- Stable IDs; no silent loss, duplication, overlap, or partial compound commit.
- Fixed and protected events do not move without explicit targeted authorization.
- One logical successful request creates at most one user history entry and one reward event.
- Failed, clarified, previewed, cancelled, no-op, navigational, ambient, or remotely adopted changes create no success reward.
- Exact undo/redo restores the complete multi-day document, deferred work, links, protection, focus state, transaction metadata, and cross-space data.
- Reward, sound, mascot, and transition state never mutate the LifeDocument or history.
- New work, undo, preference changes, visibility loss, and unmount cancel active motion/audio safely; no queued reward replays later.
- Reduced motion retains hierarchy and durable semantic results; hidden tabs suppress sensory output.
- Navigation phrases and unknown speech never create user data.

## Previous automated candidate — superseded by independent findings

The preceding complete `npm run qa:release` finished with exit 0 and `FLOW PRODUCT RESCUE RELEASE QA: PASS`, but independent QA subsequently found route-entry distortion and missing actual development signature coverage. These numbers are historical, not a release verdict for the repaired source. The entire prior evidence bundle is preserved under `artifacts/reward-resume-diagnostics/independent-gate-failure/`. Earlier failures—including the 87 ms legacy failure and intermediate-evidence defects—were not waived or relabeled. A fresh complete gate and independent re-assessment remain required.

| Gate | Fresh result |
| --- | --- |
| `npm install` entry baseline (not rerun) | PASS — 286 packages audited, 0 vulnerabilities |
| `npm run lint` | PASS — 0 errors |
| `npm run test:run` | PASS — 30 files, **793/793** tests, 50.30 seconds |
| Semantic corpus | PASS — **11,788** production-router utterances |
| `npm run build` | PASS — strict TypeScript + Vite, 645 modules; JS 754.49 kB / 226.03 kB gzip; CSS 67.41 kB / 12.39 kB gzip |
| `npm run qa:design-migration` | PASS — 127 reachable production modules |
| `npm run qa:motion` | PASS — 4/4 cases in 6.6 minutes, **120/120** signature interruptions, **144/144** canonical frames, native provenance, performance audit, two traces, and portfolio recording |
| Unchanged cold legacy motion guard | PASS — 1/1 in 36.6 seconds, 20 transitions, zero long tasks/drops/clones/loops |
| Production functional project | PASS — **70/70** Chromium tests, 3.7 minutes |
| `FLOW_RELEASE_QA=1 npm run test:e2e` aggregate | PASS — **71/71** production-preview Chromium tests, 4.4 minutes |
| `npm run test:e2e:dev` | PASS — **1/1** development StrictMode test, 17.8 seconds |
| Full `npm run qa:release` | **PASS — 72 Chromium tests total; `FLOW PRODUCT RESCUE RELEASE QA: PASS`** |
| Browser errors | PASS — 0 console errors, 0 page errors, 0 failed application requests |
| Physical acoustic microphone journey | **NOT RUN** |

The authoritative release manifest timestamp is `2026-09-05T13:06:48.762Z`; `releaseVerdict` is `PASS`; every command exit code is zero. The motion manifest is `2026-09-05T13:02:05.654Z`. The production bundle is `index-DzuCKRWb.js` with `index-BB3F44lI.css`. The merged 71-test report replays the two completed report slices; it does not run or count them a second time.

## Motion, performance, and visual evidence

The canonical matrix contains six sequences × four viewports (1440, 1280, 834, 390 px) × six samples (0/20/40/60/80/100%) = **144 frames**. Every canonical frame passed command visibility, containment, overflow, heading/control collision, clone/target and settled-residue checks. The 96 actual native compositor intermediates are within 30.423 ms of their nominal deadlines (fixed 60 ms bound), with maximum native geometry-audit skew 24.276 ms. Independent visual inspection is recorded separately in `docs/quality/design-qa.md` through 24 noncanonical six-frame sheets and a SHA-256 source-frame manifest; existence alone is not visual approval.

Final measured 20-cycle stress results:

- normal: 247 frame samples, 33.4 ms maximum sampled frame gap at `cycle-1:history`, one estimated miss (0.403%), and 0 observed long tasks;
- deliberate 4× CPU throttling: 333 samples, 66.7 ms maximum sampled gap at `cycle-15:history`, no estimated misses, and two observed long tasks (59/51 ms), below the unchanged 600 ms throttled budget;
- CLS 0.02837721, node delta +15, listener delta −4, document delta 0;
- zero running animations, reward targets, transition residue, active clones, frame loops, or audio nodes at settle;
- performance measurement intentionally disables Playwright trace snapshots in that worker, while the frame and portfolio journeys retain two trace archives; diagnostic CPU profiling and LoAF attribution are OFF in this acceptance run.

Visual review confirmed the source's warm ivory field, navy editorial hierarchy, restrained blue/green/orange semantics, generous negative space, and persistent command surface. The six sequences stay coherent at desktop, laptop, tablet, and mobile; protected anchors remain stable; paths and shared clones disappear at settle; Level-3 outcomes remain readable without animation; and the mascot never covers the primary command control. The locked reference SHA-256 remains `9e439ed9ee367c606df2653a2c0b6d17d4cf4cf9ddd398312507b522f6c751c3`.

## Evidence inventory

- `artifacts/release-qa/results.json`
- `artifacts/release-qa/playwright-results.json`
- `artifacts/release-qa/playwright-dev-results.json`
- `artifacts/release-qa/playwright-report/index.html`
- `artifacts/release-qa/playwright-dev-report/index.html`
- `artifacts/visual-reward-qa/results.json`
- `artifacts/visual-reward-qa/frame-manifest.json`
- `artifacts/visual-reward-qa/frame-timing.json`
- `artifacts/visual-reward-qa/compositor-provenance.json`
- `artifacts/visual-reward-qa/frame-index.html`
- `artifacts/visual-reward-qa/motion-metrics.json`
- `artifacts/visual-reward-qa/browser-evidence.json`
- `artifacts/visual-reward-qa/playwright-results/` (trace archives)
- `artifacts/visual-reward-qa/portfolio-demo.webm` (3,549,013 bytes)
- `artifacts/visual-reward-review/` (24 noncanonical six-frame review sheets and SHA-256 inventory)
- `artifacts/visual-reward-qa/reference/FLOW_FINAL_LOCKED_REFERENCE.png`

## Physical microphone status

**NOT RUN.** Synthetic final transcripts prove adapter routing, one-owner session behavior, exact transcript display, acquisition recovery, boundary deduplication, and typed/voice transaction parity. They cannot prove acoustic transcription, Chrome speech-service availability, room conditions, device selection, or permission state on a human machine. The physical journey in `docs/VOICE_ACCEPTANCE.md` remains separate and must not be inferred from synthetic evidence.

Synthetic voice result: **PASS**. Physical microphone result: **NOT RUN**.

## Genuine remaining limitations

- Interpretation is deterministic English (`en-US`/`en-GB`) and intentionally bounded; unsupported open-ended language returns precise no-mutation feedback.
- Live recognition remains dependent on the browser, speech service, permissions, and microphone hardware; physical acceptance is not claimed.
- No Rive asset was supplied, so the production mascot uses the documented local DOM/SVG static-motion renderer rather than claiming Rive fidelity.
- Persistence is local-first only: no accounts, cloud/provider sync, recurrence engine, shared calendars, messaging, or collaborative timezones.
- Live weather uses free Open-Meteo data with explicit cached/partial/unavailable states and a coarse Berlin default; personal geolocation and wardrobe inventory are not included.
- The production JS bundle remains above Vite's 500 kB advisory; route-level code splitting is a legitimate non-blocking follow-up.
- The final throttled stress artifact contains 59/51 ms long tasks under deliberate 4× CPU throttling. Shared-host scheduling variation and prior failed runs are preserved honestly; passing the locked budgets is not a claim of zero jank in every environment.

## Exact changed-file summary

No usable repository revision is exposed in this workspace, so the release manifest records `repositoryRevision: unavailable`; no commit is fabricated. The files owned by this visual-reward mission are:

```text
AGENTS.md
README.md
docs/quality/VERIFICATION.md
docs/quality/design-qa.md
docs/MASCOT_RUNTIME.md
docs/MOTION_ACCESSIBILITY.md
docs/MOTION_OWNERSHIP.md
docs/MOTION_QA.md
docs/SONIC_IDENTITY.md
docs/VISUAL_REWARD_BASELINE.md
docs/VISUAL_REWARD_RELEASE_REPORT.md
docs/VISUAL_REWARD_RESUME_DIAGNOSIS.md
docs/VISUAL_REWARD_SYSTEM.md
docs/VOICE_ACCEPTANCE.md
e2e/elite-release.spec.ts
e2e/development-reward-probe.ts
e2e/flow.spec.ts
e2e/native-clock.ts
e2e/native-frame-capture.ts
e2e/motion-stress.spec.ts
e2e/recommendation-query.spec.ts
e2e/reward-dev-strictmode.spec.ts
e2e/reward-signatures.ts
e2e/route-entry-motion.spec.ts
e2e/visual-reward-motion.spec.ts
e2e/visual-reward-performance.spec.ts
e2e/visual-reward.spec.ts
package.json
playwright.config.ts
playwright.motion.config.ts
scripts/qa-design-migration.mjs
scripts/qa-motion.mjs
scripts/qa-release.mjs
src/app/EnvironmentHeader.tsx
src/app/FlowAppleAcceptance.test.tsx
src/app/FlowEnvironmentApp.test.tsx
src/app/FlowEnvironmentApp.tsx
src/app/FlowEnvironmentProvider.tsx
src/app/FlowRewardIntegration.test.tsx
src/app/lifeCommandController.ts
src/app/useLifeTransition.ts
src/core/mascot/MascotRenderer.tsx
src/core/mascot/StaticMotionMascotRenderer.tsx
src/core/mascot/mascot-model.ts
src/core/mascot/mascot-model.test.ts
src/core/mascot/useMascotSafeZone.ts
src/core/rewards/derive-reward-facts.ts
src/core/rewards/reward-demo.ts
src/core/rewards/reward-director.ts
src/core/rewards/reward-level.ts
src/core/rewards/reward-preferences.ts
src/core/rewards/reward-recipes.ts
src/core/rewards/reward-suppression.ts
src/core/rewards/reward-system.test.ts
src/core/rewards/reward-types.ts
src/core/sound/sound-director.test.ts
src/core/sound/sound-director.ts
src/core/sound/sound-recipes.ts
src/domain/life-actions.ts
src/domain/life-model.ts
src/domain/life-storage.test.ts
src/domain/life-storage.ts
src/domain/life-transaction.ts
src/features/day-planner/BreathingRoomBlock.tsx
src/features/day-planner/CalendarSpace.tsx
src/features/day-planner/DayTimeline.tsx
src/features/day-planner/EventBlock.tsx
src/features/day-planner/EventBlockInterior.tsx
src/features/day-planner/FlowPlannerScreen.test.tsx
src/features/day-planner/time.ts
src/features/day-planner/time.test.ts
src/features/day-planner/voice/fakeRecognition.ts
src/features/day-planner/voice/recognition.ts
src/features/elite/components/FlowMascot.tsx
src/features/elite/components/FocusLens.tsx
src/features/elite/components/HomeLens.tsx
src/features/elite/components/InstinctLens.tsx
src/features/elite/components/PeopleLens.tsx
src/features/elite/components/TodayLens.tsx
src/features/elite/components/WeatherLens.tsx
src/features/elite/temporal.ts
src/features/elite/temporal.test.ts
src/features/focus/FocusSpace.tsx
src/features/home/HomeSpace.tsx
src/features/home/home-motion.ts
src/features/inbox/InboxSpace.tsx
src/features/insights/GoodToKnowSpace.tsx
src/features/people/PeopleSpace.tsx
src/features/plans/PlansSpace.tsx
src/features/voice/useFlowLiveSession.ts
src/features/weather/WeatherOutfitSpace.tsx
src/shared/command/GlobalCommandDock.tsx
src/shared/command/globalInterpreter.test.ts
src/shared/command/globalInterpreter.ts
src/shared/design-system/WorldPageShell.tsx
src/shared/motion/MotionBoundary.tsx
src/shared/motion/SharedFlightLayer.tsx
src/shared/motion/WorldContinuitySurface.tsx
src/shared/motion/motion-presets.ts
src/shared/motion/useReducedMotionPreference.ts
src/shared/rewards/RewardInspector.tsx
src/shared/rewards/RewardLayer.tsx
src/shared/rewards/RewardPreferencesButton.tsx
src/tailwind.css
src/vite-env.d.ts
```

Generated evidence is under `artifacts/release-qa/` and `artifacts/visual-reward-qa/`; the 144 canonical PNGs, 24 later six-frame review sheets under `artifacts/visual-reward-review/`, reports, metrics, traces, and recording are distinguished explicitly by their manifests. Review-only sheets are not canonical frames. Failed iterations remain under `artifacts/reward-resume-diagnostics/`.

## Exact commands

Run Flow locally:

```bash
npm install
npm run dev
```

Run a production preview:

```bash
npm run build
npm run preview -- --host 127.0.0.1 --port 4174
```

Run the complete release gate:

```bash
npm run qa:release
```

Run its constituent gates independently when diagnosing a failure:

```bash
npm run lint
npm run test:run
npm run build
npm run qa:design-migration
npm run qa:motion
FLOW_RELEASE_QA=1 npm run test:e2e
npm run test:e2e:dev
```

On a host where managed Chrome cannot launch, use the repository-documented Playwright 1.62.1 Docker path without changing any expectation, timeout, threshold, or retry policy.

## Living Studio expansion — implementation verification (2026-09-05)

### Scope delivered

- Voice Journal is a real local-first workspace: editable title, long-form text, tags, MediaRecorder capture/pause/resume/stop/discard, periodic chunk persistence, bookmarks, transcript segments, photograph attachments, drawing marks, interrupted-recording recovery, save/draft state, and exact undo/redo.
- Atmospheres are a persistent four-layer native Web Audio instrument (texture, rain, tone, pulse), not a playlist. Layer state, volume, mute/play state, saved presets, duplication, and route continuity are stored through the canonical transaction boundary.
- Memories are deterministic compositions made only from journal-owned text, photographs, drawings, bookmarks, and recorded voice. The product offers three bounded composition families, selectable source material, scale/position/date placement, audio trim/playback/restart, photograph removal/restoration, PNG export, and project JSON export.
- Environment Intelligence stores primary, secondary, minimized, and quiet workspace state in the shared document. Put-away/restore and journal-plus-atmosphere layouts use the same atomic LifeAction pipeline.
- The editable “I’m home” ritual is local, deterministic, enableable/disableable, and supports adding/removing up to three steps without introducing a second state system.
- Studio commands use the global typed/final-voice interpreter and one atomic planner. Long-form dictation does not swallow explicit calendar, capture, outcome, commitment, navigation, system, clarification, or confirmation commands.
- Development builds expose a bounded structured interpretation trace at `window.__FLOW_COMMAND_TRACE__` with normalized input, resolved domain/intent/entities/context/confidence/actions or unresolved reason. It is diagnostic only and never mutates product state.
- Binary media lives in IndexedDB; metadata and relationships live in schema-version-5 `LifeDocument`. Migration recovers an in-progress recorder as `interrupted`. Orphan cleanup includes current undo and redo snapshots so recoverable media is not destroyed.

### Final automated command output

```text
$ npm run lint
> eslint .
exit 0

$ npm run test:run
Test Files  33 passed (33)
Tests       930 passed (930)
Duration    99.07s
exit 0

$ npm run build
> tsc -b && vite build
666 modules transformed
dist/assets/index-BzpB5W0f.css   63.63 kB │ gzip: 12.01 kB
dist/assets/index-Bq1DhVwx.js   859.59 kB │ gzip: 252.72 kB
✓ built in 2.59s
exit 0
```

The 930-test total includes 107 table-driven Living Studio language cases, 14 Studio transaction/planning cases, 3 real React Studio boundary journeys, schema migration/persistence coverage, and the existing calendar, global voice, life-state, reward, motion, and Apple-grade acceptance foundation.

### Browser and microphone status

- Manual inspection used the already-running in-app browser at `http://127.0.0.1:4174/`; no new Chromium process was launched. Home, `/journal`, `/atmosphere`, and `/memories` rendered successfully with the shared command dock and accessible controls. No blank or error surface was observed.
- The new `e2e/studio.spec.ts` release journeys cover Journal, Atmosphere continuity, recorded-voice Memory editing/reload, workspace put-away/restore, and calendar move/undo/redo. In this managed macOS process, both configured browser binaries were denied by the OS bootstrap service before Playwright began any test (`Permission denied (1100)`, browser process terminated by SIGABRT/SIGTRAP). Therefore no new Studio Playwright pass, screenshot artifact, trace, or console-error array is claimed from this environment.
- Physical microphone acceptance was not performed and is explicitly unverified. Synthetic final-transcript parity and the injectable MediaRecorder/recognition boundary are covered by automated tests, but they are not represented as hardware evidence.

### Living Studio changed-file manifest

No `.git` metadata is available in this workspace, so a commit or branch identifier cannot be created or reported honestly. This expansion changed or added these files:

```text
docs/quality/VERIFICATION.md
e2e/studio.spec.ts
src/app/EnvironmentHeader.tsx
src/app/FlowEnvironmentApp.tsx
src/app/FlowEnvironmentProvider.tsx
src/app/FlowStudioApp.test.tsx
src/app/commandTrace.ts
src/app/conversationContext.ts
src/app/environment-types.ts
src/app/lifeCommandController.ts
src/domain/life-actions.ts
src/domain/life-factories.test.ts
src/domain/life-factories.ts
src/domain/life-invariants.ts
src/domain/life-model.ts
src/domain/life-storage.test.ts
src/domain/life-storage.ts
src/domain/life-transaction.test.ts
src/domain/life-transaction.ts
src/domain/studio-model.ts
src/features/day-planner/interpretation/normalize.ts
src/features/day-planner/parser.test.ts
src/features/home/HomeSpace.tsx
src/features/studio/StudioPortal.tsx
src/features/studio/StudioRuntimeProvider.tsx
src/features/studio/StudioSecondarySurface.tsx
src/features/studio/atmosphere/AtmosphereLayerControl.tsx
src/features/studio/atmosphere/AtmosphereSpace.tsx
src/features/studio/atmosphereEngine.ts
src/features/studio/interpretation/studioInterpreter.ts
src/features/studio/interpretation/studioLanguageCorpus.test.ts
src/features/studio/journal/HomeRitualEditor.tsx
src/features/studio/journal/JournalDrawingPad.tsx
src/features/studio/journal/JournalSpace.tsx
src/features/studio/journal/JournalTimeline.tsx
src/features/studio/journalRuntimeClock.ts
src/features/studio/mediaRepository.ts
src/features/studio/memory/MemoriesSpace.tsx
src/features/studio/memory/MemoryComposition.tsx
src/features/studio/memory/exportMemory.ts
src/features/studio/studioCommandPlan.test.ts
src/features/studio/studioCommandPlan.ts
src/features/studio/useStudioMediaUrl.ts
src/features/voice-navigation/navigationLexicon.ts
src/features/voice-navigation/navigationModel.ts
src/features/voice-navigation/navigationNormalization.ts
src/features/voice-navigation/navigationParse.ts
src/shared/command/GlobalCommandDock.tsx
src/shared/command/globalInterpreter.ts
```

The only non-blocking build advisory is the existing oversized production JavaScript chunk. Route-level lazy loading remains a genuine performance follow-up; it did not produce a TypeScript or production-build failure.

## Voice Intelligence emergency rebuild — principal verification (2026-09-06)

### Verdict and architecture

The production language path has been rebuilt and its complete non-browser gate is green. Principal status is **READY FOR INDEPENDENT RE-ASSESSMENT**, not release PASS. The current matching Playwright Docker environment executed the 38-test production slice containing every iteration-3 failure with zero failures; the full 80-test release project, motion project, and development project remain for the fresh independent release gate. Physical-microphone acceptance remains separate and is not inferred from synthetic evidence.

- `resolveGlobalCommand` is now the single centralized candidate competition. Registered domain candidates expose an ID, domain, score, positive evidence, negative evidence, and examples; one threshold/tie policy chooses execution, clarification, or domain-neutral unsupported behavior.
- The global first-match candidate was removed. The registry now publishes **120 candidate-producing definitions** and a **149-entry action manifest**, including 27 concrete Calendar action definitions; every supported intent and Calendar action is independently named and auditable. Bounded feature grammars are invoked lazily by their action definitions while the central registry owns eligibility, negative evidence, thresholds, ties, and fallback. There is no production-wide preselected intent and no Calendar umbrella candidate. Calendar requires production-plan target resolution for stateful actions and cannot gain destructive authority from the active Calendar route.
- `LifeContext` now carries bounded route/mode, selected object and insight, temporal scope, last intent and targets, recent actions/routes, and a typed pending intent. It is populated at the application shell and consumed consistently by the same typed/final-voice controller.
- Calendar destination plus temporal range is represented by `navigate-temporal`; ordered non-mutating clauses use `global-sequence`. The week and day variants no longer lose their destination.
- Partial Commitments and week-scoped Good-to-know actions retain typed continuation state. Good-to-know acts on the selected insight ID rather than recomputing whichever insight happens to rank first.
- Journal explicitly separates command, dictation, and command-interruption behavior. Long-form dictation owns the turn before global navigation or domain selection: raw content is the default, and only the exact whole-utterance Journal interruption allowlist can escape it. “Open calendar” while dictating is therefore journal content, not navigation. Speakable labels dispatch the exact visible string or a shared semantic descriptor through the canonical runner.
- Development-only `VoiceInspector` and `window.__FLOW_COMMAND_TRACE__` expose raw/normalized text, every candidate and score, evidence, entities, bounded context, selected intent, and planned actions. They do not mutate product state.
- The commit boundary, `LifeAction` engine, CAS persistence/history, scheduler invariants, Studio media, rewards, and typed/final-recognition shared runner remain canonical and unchanged in ownership.

The detailed defect analysis is in `docs/VOICE_INTELLIGENCE_ROOT_CAUSE.md`.

### Regression, parity, and corpus evidence

The exact observed failures were first recorded in `voiceEmergencyRegression.test.ts`; all **37** current stop-ship regression cases pass, including the five-route destructive matrix and action-level Calendar registry assertions. The first milestone is covered from all 11 relevant routes in `voiceMilestones.test.ts`. `speakableActions.test.ts` now passes **61/61** assertions over a **166-contract** manifest: **57** voice-capable and **109** explicitly documented gesture-only actions. Its recursive discovery audits every actionable `button`, `motion.button`, `input`, `textarea`, and `select` in all **59 production TSX files**, including the global command dock, reward preferences, and both development inspectors. It finds **173** statically named action declarations / **155** unique labels, accepts the remaining dynamic declarations only when the actionable element still carries `data-flow-action`, and reports **zero undeclared controls**. Important Home, Today, Capture, Outcomes, and Commitments controls share typed semantic descriptors rather than hidden substitute strings. A real React parity matrix executes those five actions through the actual click handler, typed command field, and injected final-recognition adapter (**15 paths**) and asserts the same canonical state and history in every mode.

The language database is deterministic and runs every case through the production `resolveGlobalCommand` registry. Provenance is deliberately separated:

```text
static editorial source rows   2,500  (`editorial_product`; no generated row contributes to this count)
grammar-generated variants    25,000
negative/confusion cases       2,000
contextual dialogues            1,000
contextual turns                4,000  (source: contextual_dialogue)
total production evaluations   33,500
exact expected results         33,500 / 33,500
expected executions            31,313 / 31,313 completed or confirmation-ready
required-core accuracy          2,500 / 2,500 (100%)
cross-route destructive probes       250 / 250 safe
destructive false positives               0
planner errors                              0
atomicity violations                        0
unresolved mutations                        0
failure clusters                    0
```

The 2,500-row source is stored in `curatedLanguageSeeds.json`; every row has a `product-editorial-review` origin, route, semantic family, language feature, route/intent review scope, and expected production intent. During this rescue, more than **2,086 utterance texts were substantially rewritten**; the final whole-source grammar pass corrected **26** admitted rows across Studio, temporal, Capture, and Commitment language. Local Ollama drafting assistance is disclosed; no draft is presented as telemetry, recorded speech, or exclusively manual composition, and there is no runtime model dependency. The final source covers **26 semantic families**, **54 language-feature classes**, at least 43 expected production intents, and eight product routes. It has 2,500 unique normalized rows and 2,500 unique filler-stripped fingerprints. Corpus lint measures maximum semantic-core, sentence-edge-shell, and canonical grammar-skeleton frequencies of **4 / 10 / 20** after abstracting verbs, entities, names, times, durations, and polite framing. Every rolling 40-row window covers at least nine families, five intents, and four routes. Eight whole-source grammar admissions reject singular/plural disagreement, determiner/object number conflicts, article/adjective sound errors, malformed promise objects, semantically incompatible adjective/object pairs, and broken infinitive/`that` joins; the final violation list is empty. All-family samples and editorial rationale are in `CURATED_EDITORIAL_REVIEW.md`; the frozen source SHA-256 is `341a5f8cd4bc720cedee6c24c10167512c39da596d8db413dc4babba61397295`. Generated grammar, adversarial grammar, and contextual dialogues retain separate provenance and are never relabeled as editorial or recorded real-user speech. Full provenance is documented in `docs/VOICE_LANGUAGE_PROVENANCE.md` and `CURATED_LANGUAGE_MANIFEST.md`. Reports:

- `artifacts/voice-intelligence/coverage-report.json`
- `artifacts/voice-intelligence/confusion-matrix.json`
- `artifacts/voice-intelligence/failure-clusters.json`
- `artifacts/voice-intelligence/accuracy-report.json`
- `artifacts/voice-intelligence/production-pipeline-report.json`
- `artifacts/voice-intelligence/production-case-results.jsonl`

The separate generated navigation inventory contains 13,892 variants and passes 13,892/13,892. It is partitioned into four scoped tests, eliminating the prior aggregate 20-second timeout without raising a global timeout. The Apple-grade route matrix passes 592 unique natural variants from every five supported product routes (2,960 route executions). The production-pipeline evaluator runs all **33,500** semantic cases through the real command runner, domain planner/entity resolution, transaction/invariant engine, and history. Six direct partitions and two contextual partitions keep every worker update below the Vitest 60-second RPC watchdog without relaxing a test timeout. It persisted 33,500 per-case records, observed **15,255** real state mutations, **202** expected clarifications, and **65** confirmations. Every one of the **31,313** expected executions completed or reached its required confirmation state; planner errors, unsafe error mutations, atomicity violations, and unresolved mutations are all **0**. Average command latency was **2.023 ms** and maximum **165.355 ms** in the final matching-Docker evidence run.

### Final non-browser command output

```text
$ npm run check
> npm run lint && npm run test:run && npm run build
lint: eslint . — PASS
Test Files  38 passed (38)
Tests       1086 passed (1086)
Duration    218.51s
668 modules transformed
dist/assets/index-7peFNsf8.css   64.82 kB │ gzip:  12.22 kB
dist/assets/index-BxpbofqX.js   894.16 kB │ gzip: 261.75 kB
✓ built in 4.43s
exit 0
```

Vite also emitted its existing chunk-size advisory and Rollup/Zod pure-annotation notices; neither is a TypeScript or production-build failure.

### Fresh browser and physical-microphone gates

The historical direct managed-macOS launch remains preserved because it failed before page creation:

```text
TMPDIR=$PWD/node_modules/.tmp \
PLAYWRIGHT_BROWSERS_PATH=$PWD/node_modules/.cache/ms-playwright \
npx playwright test e2e/voice-intelligence.spec.ts --project=chromium --reporter=line

3/3 tests did not start
browserType.launch: Target page, context or browser has been closed
Google Chrome terminated with signal SIGABRT before page creation
```

Exact launch output is preserved at `artifacts/voice-intelligence/browser/managed-chromium-launch.txt`; it remains honest historical infrastructure evidence and is not presented as the current Docker result. The current matching-Docker run regenerated `artifacts/voice-intelligence/browser/results.json` with all three browser journeys true and `physicalMicrophone: NOT_PERFORMED`.

The documented matching `mcr.microsoft.com/playwright:v1.62.1-noble` environment is now available. A current production build ran the five affected specifications as one consolidated slice:

```text
npx playwright test \
  e2e/living-environment.spec.ts e2e/release-evidence.spec.ts \
  e2e/studio.spec.ts e2e/tide-release.spec.ts \
  e2e/voice-intelligence.spec.ts \
  --project=chromium --workers=1 --reporter=line

38 passed (1.6m)
```

Those tests cover the exact Home click/keyboard/command route, shared recognition vocabulary, typed Journal bookmark, authored Atmosphere casing, valid SVG rendering with browser-console assertions, Journal put-away/restore, day-boundary clarification, batch editing, precise recording controls, and replacement-recognizer synchronization. Their `afterEach` checks reported zero console errors, page errors, and failed application requests. This is targeted current-build evidence, not a claim that the full 80-test release suite, the motion project, or the development project has already passed; `artifacts/release-qa/results.json` still honestly contains the preceding full-run FAIL until the independent gate regenerates it.

Physical microphone: **NOT PERFORMED**. Browser `SpeechRecognition` and a human speaker remain required to run the requested 100-utterance `physical_microphone_manual` acceptance; injected final transcripts prove pipeline parity, not device or recognition accuracy.

### Voice intelligence changed-file manifest

No `.git` metadata is present, so this manifest is the exact available change record for the sprint:

```text
docs/quality/VERIFICATION.md
artifacts/voice-intelligence/accuracy-report.json
artifacts/voice-intelligence/browser/managed-chromium-launch.txt
artifacts/voice-intelligence/browser/results.json
artifacts/voice-intelligence/confusion-matrix.json
artifacts/voice-intelligence/coverage-report.json
artifacts/voice-intelligence/failure-clusters.json
artifacts/voice-intelligence/production-case-results.jsonl
artifacts/voice-intelligence/production-pipeline-report.json
artifacts/voice-intelligence/resolver-accuracy-report.json
docs/VOICE_INTELLIGENCE_ROOT_CAUSE.md
docs/VOICE_LANGUAGE_PROVENANCE.md
e2e/voice-intelligence.spec.ts
src/app/EnvironmentHeader.tsx
src/app/FlowEnvironmentApp.test.tsx
src/app/FlowEnvironmentApp.tsx
src/app/FlowEnvironmentProvider.tsx
src/app/commandTrace.ts
src/app/conversationContext.test.ts
src/app/conversationContext.ts
src/app/environment-types.ts
src/app/lifeCommandController.ts
src/domain/life-model.ts
src/domain/life-storage.ts
src/features/day-planner/EventBlock.tsx
src/features/day-planner/EventBlockControls.tsx
src/features/day-planner/InlineFeedback.tsx
src/features/day-planner/PlannerHeader.tsx
src/features/day-planner/VoiceCommandBar.tsx
src/features/day-planner/__snapshots__/tideLanguage.test.ts.snap
src/features/day-planner/interpretation/intent.ts
src/features/day-planner/interpretation/interpreter.ts
src/features/day-planner/interpretation/tideLanguagePrimitives.ts
src/features/day-planner/parser.test.ts
src/features/day-planner/planner.test.ts
src/features/elite/components/FocusLens.tsx
src/features/elite/components/HomeAccessibleActions.tsx
src/features/elite/components/InstinctLens.tsx
src/features/elite/components/PeopleLens.tsx
src/features/elite/components/TimeScopeControl.tsx
src/features/elite/components/TodayLens.tsx
src/features/elite/components/WeatherLens.tsx
src/features/focus/FocusSpace.tsx
src/features/inbox/InboxSpace.tsx
src/features/insights/GoodToKnowSpace.tsx
src/features/now/NowInset.tsx
src/features/now/NowSpace.tsx
src/features/people/PeopleSpace.tsx
src/features/plans/PlansSpace.tsx
src/features/studio/atmosphere/AtmosphereSpace.tsx
src/features/studio/atmosphere/AtmosphereLayerControl.tsx
src/features/studio/StudioSecondarySurface.tsx
src/features/studio/StudioPortal.tsx
src/features/studio/interpretation/studioInterpreter.ts
src/features/studio/journal/HomeRitualEditor.tsx
src/features/studio/journal/JournalDrawingPad.tsx
src/features/studio/journal/JournalSpace.tsx
src/features/studio/journal/JournalTimeline.tsx
src/features/studio/memory/MemoriesSpace.tsx
src/features/voice-intelligence/CURATED_CORPUS_PROVENANCE.md
src/features/voice-intelligence/CURATED_EDITORIAL_REVIEW.md
src/features/voice-intelligence/CURATED_LANGUAGE_MANIFEST.md
src/features/voice-intelligence/curatedLanguageSeeds.json
src/features/voice-intelligence/languageDatabase.test.ts
src/features/voice-intelligence/languageDatabase.ts
src/features/voice-intelligence/productionPipelineEvaluator.test.ts
src/features/voice-navigation/generatedNavigationCorpus.ts
src/features/voice-navigation/navigationCorpus.test.ts
src/shared/command/VoiceInspector.tsx
src/shared/command/globalMatchers.ts
src/shared/command/globalInterpreter.ts
src/shared/command/speakableActions.test.ts
src/shared/command/speakableActions.ts
src/shared/command/uiActionDescriptors.ts
src/shared/command/voiceEmergencyRegression.test.ts
src/shared/command/voiceMilestones.test.ts
src/shared/rewards/RewardInspector.tsx
src/shared/rewards/RewardPreferencesButton.tsx
src/types/node-fs.d.ts
```

### Genuine limitations

- The deterministic language system is English-first and uses bounded product grammars rather than open-domain inference. Novel phrasings outside those product grammars can still require rephrasing.
- Corpus accuracy measures the static curated, generated, adversarial, and contextual database above; no corpus row is claimed as recorded physical speech, an independent real-user sample, or evidence of acoustic recognition quality.
- Device permission, OS audio routing, browser recognition availability, acoustic conditions, and real recognition latency remain unverified until physical-microphone acceptance runs.
- Fresh changed-build Chromium assertions and console inspection remain blocked on this managed host and must run unchanged on a browser-capable host before release PASS.
- The existing production JavaScript chunk-size advisory remains a non-blocking performance follow-up.

## Motion provenance repair — bounded checkpoint (2026-09-06)

### Verdict

The previously proposed `Page.captureScreenshot` worker design was independently rejected because a request-dispatch timestamp is not a pixel-acquisition timestamp and several returned frames were byte-identical. It is no longer the acceptance path. Intermediate evidence now uses metadata-timestamped `Page.screencastFrame` PNGs and decoded product-pixel progression.

The corrected mechanism produced a three-case focused PASS in terminal output. A later focused invocation exposed an evidence-hygiene defect by overwriting the canonical manifest/timing/provenance files while leaving the older full-run `results.json`; the focused result is therefore not independently recoverable as a coherent artifact set and is not accepted as release evidence. The source now isolates every direct/focused run from canonical evidence. No browser run was repeated under the still-saturated host.

The fresh complete `npm run qa:motion` remains **FAIL**, not PASS: under a severe unrelated shared-host CPU spike, the unchanged fixed-tolerance matrix completed 16 of 24 sequence/viewport cases and the portfolio journey exceeded its fixed 90-second limit. The production performance journey and six-signature × 20 stress journey both passed. No tolerance, duration, frame count, matrix row, performance budget, or assertion was weakened, and no unrelated process was stopped.

Physical microphone status remains **NOT PERFORMED**. No synthetic transcript, browser adapter result, or compositor evidence is represented as physical-microphone acceptance.

### Root cause and final acquisition design

Chromium's screencast is damage-driven, so an animation can have no emitted frame near a requested checkpoint even when it is visually progressing. A separate `Page.captureScreenshot` request did force a compositor readback, but CDP supplies no native acquisition timestamp for that command; treating its dispatch as capture time was invalid.

The test harness now prearms one `Page.screencastFrame` stream before the real Enter key and maps each frame's `ScreencastFrameMetadata.timestamp` into renderer `performance.now()` using `performance.timeOrigin`. A test-only 4 × 4 marker uses both a native rAF paint tick and an independently composited WAAPI pulse to keep the damage stream alive. The marker is removed after capture. A dependency-free PNG decoder hashes rendered pixels while excluding a 12 × 12 top-left region, and all four active checkpoints must have different product-pixel digests. Callback arrival lag is preserved as a diagnostic but cannot satisfy timing. Each accepted PNG must also have a native rAF DOM/WAAPI audit within the unchanged ±60 ms tolerance.

Release evidence cleanup removes `artifacts/voice-intelligence/browser/results.json` before every new release attempt. Physical-microphone wording is conditional: it can mention automated Chromium proof only when the E2E voice gates actually executed and passed. Unit coverage exercises stale-result removal and every reporting branch.

### Prior focused diagnostic — not durable release evidence

The three cases that had repeatedly missed damage-driven frames passed together in the repository-matched Playwright container, but a subsequent focused invocation overwrote their manifest. These numbers are preserved as command output only, not as a current independently auditable release artifact:

```text
$ npx playwright test e2e/visual-reward-motion.spec.ts \
    --project=visual-reward-chromium --workers=1 --reporter=line \
    --grep='(time-travel/desktop|tide-recovery/tablet|capture-to-outcome/mobile)'
3 passed (22.1s)

timed compositor intermediates     12 / 12
distinct semantic pixel digests    12 / 12
maximum metadata target error      25.465 ms (fixed allowance: 60 ms)
maximum paired native-audit skew   16.015 ms
```

Capture timestamps were compositor metadata, not worker dispatch or callback arrival. The heartbeat region was excluded before hashing. This diagnostic supported the design, but it cannot close the release gate without a coherent saved artifact set.

### Fresh complete motion result

The authoritative motion command ran once, without retrying failed cases:

```text
$ npm run qa:motion
18 passed, 9 failed (18.2m)
FLOW VISUAL REWARD MOTION QA: FAIL

production performance journey        PASS
six signatures × 20 lifecycle stress  PASS (120 / 120)
signature matrix                       16 / 24 cases
portfolio journey                      FAIL — fixed 90 s timeout
```

The eight incomplete matrix cases failed honestly because one or more metadata-timestamped frames or one paired audit were absent within ±60 ms: outcome-completion/desktop, time-travel/desktop, capture-to-outcome/desktop, time-travel/laptop, outcome-completion/tablet, capture-to-outcome/tablet, outcome-completion/mobile, and time-travel/mobile. The laptop time-travel case missed only its paired audit at 63.332 ms. During this phase, unrelated containers were observed consuming approximately 401%, 226%, and 53% CPU, with additional database load. The passing performance worker recorded a 0.974% normal missed-frame rate, 83.3 ms normal maximum gap, and 55 ms longest normal task; under deliberate 4× throttling it recorded 0.793%, 200 ms, and 142 ms. All remain inside their locked budgets.

Because the 144-frame matrix and portfolio recording are incomplete, the last authoritative result is FAIL. The current canonical directory is explicitly a pre-isolation mixed checkpoint: its older full-run `results.json` does not match its later focused manifest/timing/provenance files and must not be evaluated as one run. The next authoritative command atomically clears that tree before writing. A fresh `npm run qa:motion`, followed by `npm run qa:release`, still must complete on an uncontended matching host before release PASS.

### Non-browser validation

The final harness-only source passed a fresh complete check in the same repository-matched Docker image:

```text
$ npm run check
lint: PASS
Test Files  39 passed (39)
Tests       1094 passed (1094)
Duration    319.74s
668 modules transformed
dist/assets/index-7peFNsf8.css   64.82 kB │ gzip:  12.22 kB
dist/assets/index-BxpbofqX.js   894.16 kB │ gzip: 261.75 kB
build: PASS (7.28s)
exit 0
```

The 13,892 navigation variants remain complete; eight fixed cooperative partitions replaced four oversized partitions without changing a row, route, or assertion. The strict evaluator still persists all 33,500 full production outcomes. It now serializes each case alongside its existing evaluator partition, then performs one final aggregate/write pass; that final 29 MB evidence step completed in 2.423 seconds without increasing Vitest's five-second limit. The fresh report records 33,500/33,500 passed, 31,313/31,313 expected execute/confirmation paths, and zero planner errors, unsafe planner errors, atomicity violations, or unresolved mutations.

The curated corpus source remains frozen at SHA-256 `341a5f8cd4bc720cedee6c24c10167512c39da596d8db413dc4babba61397295`; this repair does not change production interpretation, state, scheduling, persistence, rewards, or media code.

### Files changed in this checkpoint

```text
docs/quality/VERIFICATION.md
docs/MOTION_QA.md
e2e/compositor-capture-worker.mjs
e2e/native-frame-capture.ts
e2e/png-pixel-fingerprint.ts
e2e/reward-dev-strictmode.spec.ts
e2e/visual-reward-motion.spec.ts
e2e/visual-reward-performance.spec.ts
playwright.dev.config.ts
playwright.motion.config.ts
scripts/qa-motion.mjs
scripts/motion-evidence-scope.d.mts
scripts/motion-evidence-scope.mjs
scripts/qa-release-evidence.d.mts
scripts/qa-release-evidence.mjs
scripts/qa-release.mjs
src/app/qaReleaseEvidence.test.ts
src/features/voice-intelligence/productionPipelineEvaluator.test.ts
src/features/voice-navigation/navigationCorpus.test.ts
src/types/node-fs.d.ts
```

No production runtime file was changed for this motion/evidence repair. The workspace has no `.git` metadata, so no commit was created.

## Canonical motion and development evidence isolation — source validated (2026-09-06)

Independent QA accepted the compositor provenance and fixed tolerances, then found two evidence-ownership leaks in sequence. Direct focused motion Playwright invocations could mix a focused manifest with a full-run result. After that was isolated, direct development `--list` still overwrote the canonical development JSON and HTML report, while the StrictMode specification itself used a literal canonical browser-evidence directory. Both paths now derive from one capability selected before Playwright loads:

- `qa:motion` and `qa:release` are the only accepted canonical owners;
- canonical cleanup swaps in a clean same-volume directory and restores the prior tree if the replacement rename fails;
- direct motion/development invocations receive `artifacts/visual-reward-debug/run-<time>-<pid>/`, with all development reporters, test output, screenshots, and JSON evidence nested inside that run;
- an unowned request for `artifacts/visual-reward-qa/`, or any focused output outside the debug root, fails configuration;
- the motion, performance, and development-signature specifications all consume the selected run directory;
- only the explicit `qa:release` owner maps development output back to `artifacts/release-qa/playwright-dev-*` and `artifacts/always-on-voice-release/`; `qa:motion` cannot acquire that capability;
- release development evidence explicitly retains canonical ownership after the motion phase.

Source-level validation, with no Chromium launch, passed:

```text
$ TMPDIR=$PWD/node_modules/.tmp npm exec vitest run src/app/qaReleaseEvidence.test.ts -- --maxWorkers=1
Test Files  1 passed (1)
Tests       6 passed (6)
Duration    2.74s

$ npm run lint
PASS

$ node node_modules/@playwright/test/cli.js test --config=playwright.dev.config.ts --list
Total: 1 test in 1 file
output: artifacts/visual-reward-debug/dev-list-<run>/development/
canonical development JSON/report/browser-evidence content and mtimes: unchanged

$ npm run check
lint: PASS
Test Files  39 passed (39)
Tests       1096 passed (1096)
Duration    201.21s
668 modules transformed
dist/assets/index-C6i7e_IS.css   64.85 kB │ gzip:  12.19 kB
dist/assets/index-SstnJ-r-.js   894.16 kB │ gzip: 261.06 kB
build: PASS (3.66s)
exit 0
```

The six evidence tests cover stale voice-result removal, conditional physical-microphone wording, focused/canonical path authorization, rejection of unsafe destinations, atomic replacement of stale canonical motion evidence, exact development destination derivation, and a real no-browser Playwright list. The list regression snapshots all canonical dev files before invocation, verifies their existence/content/mtime afterward, and requires the debug HTML and JSON reports. No browser was launched by `--list`, and no production runtime file changed.

The exact quiet-host release command remains:

```bash
docker run --rm --name flow-reward-final-native-release --shm-size=1g \
  -v ~/Downloads/flow-voice-calendar:/work \
  -v flow-visual-reward-node-modules-v2:/work/node_modules \
  -w /work -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  mcr.microsoft.com/playwright:v1.62.1-noble npm run qa:release
```

Do not reuse or manually combine files from the current pre-isolation canonical checkpoint. The command above starts by replacing them with an empty canonical run directory.

## September 8 critical voice-control rebuild — IN PROGRESS, NOT RELEASE-APPROVED

Current request: `~/.codex/attachments/41200741-2058-475f-8a61-aad7ddda9e51/pasted-text.txt`.
The historical results above do not validate the changed September8 source. The active checkpoint and requirement ledger are in `artifacts/voice-control-rebuild-20260908/RESUME.md` and `RELEASE-ASSESSMENT.md`.

Both required read-only audits completed; `voice_rebuild_principal` remains the sole production/test writer. Independent `flow_qa` has **not** started for this candidate. Root owns checkpoint/evidence consolidation and targeted manual browser review.

Observed evidence so far:

- Initial core RED:31failed/6passed. Native multi-final assembly also reproduced premature prefix dispatch before repair.
- Latest inspected complete source run is `full-source-iteration5.log`:10failed/1654passed,63files,298.18s. Five failures are the deliberately enforced new quota minima, one the unchanged40-intent diversity requirement, and the other four are earlier-loaded export feedback/preset tests repaired in a later focused run (two history cases also needed test-label correction). Later targeted passes do not replace this result. Newer types/lint checks are recorded separately, not inferred from these unit results.
- `studio-linked-parity-iteration1.log`:154passed across3files; includes21React transaction tests. Six controls currently have pointer/typed/final convergence checks, not universal UI parity; independent expected-field assertions are being strengthened.
- Root's earlier separate-origin4176 browser check verified two reproduced layout fixes on intermediate assets. It is not the final six-viewport screenshot gate. No physical microphone was activated there.
- Native-boundary review led to executed REDs and repairs, including a pending-confirmation authority race where Confirm acquired forJ1 deleted newly pendingJ2. `native-react-context-iteration2.log`:37passed (29adapter/8mountedReact),16.65s. A larger selected native/control subset reports74passed. These simulated native callbacks are not acoustic observations; see `NATIVE-ASSEMBLY-BOUNDARY-REVIEW.md`.
- Legacy admitted corpus remains2,500. `domain-frozen-oracle-iteration3.log`:246pass/12skipped,7.11s, across independently declared pending contracts. New proposals remain pending unchanged editorial admission. Per-row scoped editorial review marks189of200clear,11holds; the other46awaitmetadata. Neither static eligibility nor draft/extracted counts are release corpus admission.
- `source-authority-drawing-iteration1.log`:5pass/63skipped,5.96s. Repaired actual late export feedback after pointer edit/Undo/Redo, stale rendered Journal drawing after voice clear/history, and named built-in preset deletion incorrectly targeting an active user mix. Full suite still needs revalidation.
- `journal-selected-paragraph-iteration1.log`:4pass/29skipped,1.81s. `studio-playback-parity-iteration2.log`:2pass/27skipped,3.59s. Bookmark pointer/typed/final calls the same original playback target; rejected playback reports a meaningful error. These are synthetic/component checks, not physical microphone or native browser-media acceptance.

Latest continuation (14:35 local): `off-route-playback-iteration3.log` is12PASS/2files/8.22s, including pointer navigation/selection cancellation of delayed playback. `raw-creation-span-red.log` reproduces5exact title failures; focused parser repair is6PASS/60filtered/1.62s. Full-state literal creation nowhas7PASS through typed/final, independent insertedrecords and exactUndoRedo (`raw-creation-fullstate-iteration3.log`). `pending350-iteration2.log` includes289PASS/68FAIL with7literalcases, hence350pendingcontracts282PASS/68FAIL, not admittedquota. Language auditor classified all68; report `PENDING68-SEMANTIC-REVIEW.md`. Additional frozencontracts/framecatalogs/dialogueproposals remain pending; source100legacy-fit declarations mechanicallyverified exactsource/hash/coordinates, not100runtimepasses.

Root inspected `entity-view-parity-iteration2.log`284PASS/4files/9.93s, `command-acquisition-iteration1.log`27PASS/3files/8.03s and `acquisition-native-compatibility-iteration1.log`59PASS/3files/32.79s. Typed queued wrong-target race reproduced before repair; semantic references nowbindat submission, latestdocument staysCAS-owned. Stale recommendation source audit reproduced3failures (Capture/Commitment/Step ghostsources); `entity-view-parity-iteration4.log`31PASS/2files/6.49s afterrepair/expandedpointerchecks. These overlap and are not summed. Current presentation-settings/parity work remains inprogress; no freshfullsource/build/browserorphysicalresult. Four new25-case archives and root decisions remain in `FROZEN-I-J-STUDIO-SECOND-REVIEW.md`. None of these overlapping focused results replaces complete-source iteration5 above.

Open gates: native boundary repairs, complete visible capability parity/registry, required corpus quotas and independent semantics, fresh complete source/build/browser validation, exact six-viewports, independentQA, physical microphone acceptance. **Release remains BLOCKED / implementation active.**

Runtime safety: Docker became available externally; no unrelated services were stopped or restarted. Fresh Flow-only QA must preserve historical evidence. The prior one-off isolated performance grant is not a renewed grant to alter other workloads. Root owns preview4176/session28655; the user's4174listener/data remain out of cleanup scope. This workspace has no Git metadata; no commit or Git attribution is claimed.
