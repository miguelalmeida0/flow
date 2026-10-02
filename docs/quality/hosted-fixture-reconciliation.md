# Hosted release fixture reconciliation

These corrections preserve independent expected document contents, identities, clocks, undo/redo history and mutation counts. They do not derive expected state from the interpreter under test. Baseline failures are retained in `artifacts/hosted-release/20261002-source/triage/`.

## Local voice acquisition

`GlobalCommandDock` starts supported local recognition on mount. Ownership acquisition completes asynchronously. Tests must await actual listening before supplying transcripts. Home remains wake gated; domain journeys perform a real “Flow” utterance and verify that wake does not change stored data. A final releases the fake adapter's handlers, so subsequent turns wait for listening again. Explicit Stop, Retry and reclaim controls remain explicit interactions.

`FlowPresentationParity`'s idle Hide test must stop recognition first. `FlowEnvironmentProvider.applyPresentation` intentionally refuses Hide during active listening. The active rejection and idle success both preserve storage/history.

## Canonical date representation

`interpretation/sourceDates.ts:bindRequestDestinations` binds relative destinations to civil dates at the global interpreter boundary. Only the expected action representation changes:

| Independent case | Existing independent date | Correction |
| --- | --- | --- |
| `literal-create-1` | `rows[0].date = 2026-09-09` | Destination date becomes `{dateKey: row.date}`. |
| `literal-create-2` | `rows[1].date = 2026-09-09` | Same representation correction. |
| `literal-create-4` | `rows[3].date = 2026-09-09` | Same representation correction. |
| `repository-draft-0023` | Frozen `newEvent.dateKey = 2026-09-09` | Concrete destination. |
| `repository-draft-0025` | Frozen `newEvent.dateKey = 2026-09-09` | Concrete destination. |
| `repository-draft-0034` | Frozen `newEvent.dateKey = 2026-09-09` | Concrete destination. |
| `repository-draft-0066` | Frozen `datedEventChanges.destinationDate = 2026-09-09` | Concrete defer date. |
| `repository-draft-0067` | Same independently declared destination date | Concrete defer date. |
| `repository-draft-0068` | Same independently declared destination date | Concrete defer date. |
| `repository-draft-0069` | Same independently declared destination date | Concrete defer date. |
| `repository-draft-0072` | Both frozen destinations are 2026-09-09 | Concrete defer date. |

Legacy defer declarations already carry an independent `destinationDate` in each `legacyDeferSlots.json` row. The overlay uses that exact value for its action date rather than retaining the unbound spoken word. No frozen defer slot or expected resulting event changes.

## Labels and literals

- Calendar choice labels include the event's civil date (`scheduling/resolution.ts:choices`). The ambiguous Product meeting tests retain the exact title, 10 AM source and 8:30 AM destination. Missing-reference feedback names the visible calendar date. `voice-rebuild-editorial-094` retains Shareholders, 11:30 AM and zero mutations, adding Tuesday, Sep 8 to the label.
- `tide.test.ts` supplies “Ana”; `voiceGeometryContract` supplies “Deep Work” and “Walk Dog”. Expected titles retain those supplied capitals. Geometry and durations stay exact.
- “Something under 20 minutes” excludes 20; the independent maximum is 19. This does not change “up to 20” semantics.
- The environment Focus refinement copy uses “28 available”; the independent 28-minute duration and zero history before confirmation remain unchanged.

## Cancellation

`curatedLanguageSeeds.json` declares `curated-1569`, “never mind”, as `cancel` (`reviewScope: home:cancel`). `legacyOtherContracts.json` contradicted it with history/undo. Correct the overlay to cancellation with empty slots. Preserve `EXACT_BEFORE`, zero history/commit/revision deltas, and empty actions. Cancellation must not undo unrelated work.

The corresponding `languageDatabase` migration claiming “otherwise undo” is removed. This agrees with the kernel cancellation contract. A mounted application regression creates and saves a capture, then submits “never mind” and checks the complete snapshot is unchanged.

## Journal sentence precondition

The journal dialogue starts a new empty entry and begins recording. “Save the last sentence” requires a sentence. Add a real preceding dictation turn to those journeys, retaining the existing bookmark turn ID and expected bookmark operation. Keep an explicit empty-entry case proving clarification and unchanged history; do not manufacture a bookmark or weaken the production guard.

This adds 40 declared turns, `d120-3.5` through `d159-3.5`; existing turn IDs remain stable.

## Nine occupied future creation slots

An artifact-only diagnostic continued across independent dialogues and captured full errors; it did not change the canonical evaluator. The existing default fixture contains Email at 11 AM and Creative Review at 4 PM on 2026-09-06. These nine generic execution rows therefore correctly fail scheduling:

| Row | Requested title | Start | Duration | Existing collision |
| --- | --- | --- | --- | --- |
| `curated-0097` | Tax preparation | 11 AM | 30 minutes | Email |
| `curated-0194` | Team retro meeting | 11 AM | 40 minutes | Email |
| `curated-0336` | Doctor's appointment | 4 PM | 30 minutes | Creative Review |
| `curated-0478` | Presentation practice | 11 AM | 45 minutes | Email |
| `curated-0563` | Grocery planning | 11 AM | 25 minutes | Email |
| `curated-0618` | Writing workshop | 11 AM | 20 minutes | Email |
| `curated-0945` | Garden planning | 11 AM | 30 minutes | Email |
| `curated-0962` | Travel planning session | 11 AM | 30 minutes | Email |
| `curated-0987` | Passport paperwork block | 11 AM | 25 minutes | Email |

The corpus keeps its occupied fixture and expects a scheduling error with zero creation, commits and history. This is an explicit expected collision outcome, not a changed fixture. `FlowCalendarCreationBoundary.test.tsx` separately executes the requests against an explicitly empty tomorrow and independently checks the exact title, civil date, start, duration, unchanged today and undo/redo. It also repeats every occupied case and checks the entire snapshot remains unchanged. The three malformed literal titles are production defects exposed by those free-slot cases.

For `0336`, the mounted application deliberately routes “book ... appointment” to reasoning because external booking differs from adding a calendar entry. Preserve that gate. Its original source phrase is covered at the parser/scheduler boundary for both free and occupied slots; the mounted success/collision tests use explicit “add” calendar intent. Undo restores all stored dates and history while retaining the user's current Sep 6 view projection; the expected document declares that projection explicitly.

## Deferral to the already selected civil day

`d240-3` through `d259-3` request tomorrow morning after navigating to tomorrow. Roadmap already occupies 10:30–11 AM on that date. `deferEvent` incorrectly moved it into the deferred collection of the same date, violating the existing invariant. `applyStateAction` now routes same-day deferral through existing `placeToday` placement, preserving the invariant and treating an already-satisfied day/part request as no change. Mounted regressions assert 2026-09-06, original geometry, complete snapshot equality for no-ops, exact other-day preservation and history for moves. Structured `defer.atMinutes` regressions additionally prove occupied times reject, free times move and identical times stay unchanged. Ordinary spoken move commands retain their established Tide reflow semantics.

## Stale native confirmation

The native acquisition tests prove that an old Confirm cannot authorize a replacement deletion. The authority mismatch was converted into ordinary clarification, whose runner cleared the replacement pending request. Return feedback at the mismatch boundary instead; retain both the unchanged document/history and the replacement confirmation controls.

## Storage failure injection

U9 changed the provider persistence boundary from the boolean `saveLifeSnapshot` wrapper to `saveLifeSnapshotOutcome`. The native pause/resume rejection tests inject `storage-unavailable` at that current boundary. Their audible-state, unsaved-feedback and exact unchanged-snapshot assertions remain intact.
