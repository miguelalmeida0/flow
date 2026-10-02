# Hosted release baseline — October 2, 2026

## Candidate identity

Source checkout: `feat/voice-latency-fluidity-v1` at `114fd9d4826c1d407c3b93231cde82fc644fe5db`, including its pre-existing tracked and untracked work. The immutable pre-work archive, per-file SHA-256 manifest, and binary diff are under `artifacts/hosted-release/20261002-source/`. The archive contains 862 files; it is a recovery baseline, not a deployable approved release.

## Observed checks

| Check | Current checkout result | Evidence |
|---|---|---|
| Full unit suite | FAIL: 4,821 passed, 463 failed, 0 pending; 5,284 total | `unit-results.json`, `unit.log` |
| Desktop server suite | PASS: 36 tests | `server.log` |
| Focused browser calendar suite | 4 passed, 1 failed; complete browser suite still required | `triage/browser-calendar-red-approved.json` |
| Hosted providers | Not run | No credentials configured in the current shell |

Evidence paths above are relative to `artifacts/hosted-release/20261002-source/`. `failure-identities.json` preserves every failing file and full test name. No failure has been waived by count; all remain unresolved until individually investigated.

## Initial failure groups

- 330 failures in `productionPipelineEvaluator.test.ts`: semantic contracts and aggregate assertions. The generated corpus summary alone is incomplete because failing partitions stop early; its advertised accuracy cannot certify the release.
- 122 failures across application and planner UI suites: many reference the former inactive “Start Flow Live” control while the current local recognizer starts automatically. Other failures require separate diagnosis.
- Remaining failures include language-database contracts, exact calendar/semantic slots, UI capability evidence, and tide behavior.

Owner: release implementation. Next checks: reproduce representative semantic failures against their source fixtures; reconcile voice activation expectations with the actual supported mode; preserve persisted state/history assertions throughout repairs.

## Implementation checkpoints

These checks apply to the evolving working tree, not an immutable deployment candidate.

| Unit | Verified result | Evidence |
|---|---|---|
| U2 runtime isolation | 124 tests passed across 11 files; production build passed | `u2-results.json`, `u2-build.log` |
| U3 gateway | 29 tests passed against real Redis, including cross-environment authentication isolation, shared parent quotas, and Redis process identity | `u3-final-results.json`, `u3-final.log` |
| Production dependency audit | No reported advisories | `dependency-production-audit.json` |
| Development dependency audit | 10 reported package advisories; review outstanding | `dependency-audit.json` |
| U10 commitments/prose | 759 focused assertions passed; typecheck passed | `u10-authoritative.json`, `u10-typecheck.log` |
| U10 complete command pipeline | 2,686 passed, 35 failed, zero pending; down from 330 failures | `u10-pipeline-authoritative.json` |
| U9 durable save and authority | 361 tests passed across 33 kernel, transaction, and application files; zero failures/skips; typecheck passed | `u9-authoritative.json`, `u9-authoritative-typecheck.log` |
| U10 integrated browser calendar journeys | 5 passed, zero failures/skips/retries; production build passed | `u10-browser-authoritative.json`, `u10-integrated-build.log` |
| U10 integrated application and durable boundaries | 867 tests passed across 50 files; zero failures/skips | `u10-integrated-authoritative.json`, `u10-integrated-authoritative.log` |
| U4 integrated gateway and speech | 84 server tests passed with real Redis; production build passed | `u4-integrated-server.json`, `u4-integrated-build.log` |
| U4 integrated frontend and corpus | 3,967 passed, 7 failed, zero pending; all failures are in the language database and aggregate corpus reporter | `u4-integrated-unit.json`, `u4-integrated-unit.log` |
| U4 full Chromium intermediate baseline | 74 passed, 47 failed, 9 did not run; zero retries/flaky results | `u4-browser-baseline.json`, `u4-browser-failures.json` |
| U5 integrated gateway | 102 tests passed with real Redis; production build passed | `u5-integrated-server.json`, `u5-integrated-build.log` |
| U5 integrated application/kernel | 1,092 tests passed across 78 files; zero failures/skips; full repository lint passed | `u5-integrated-unit.json`, `u5-integrated-lint.log` |
| Dependency patches | brace-expansion 1.1.21 and 5.0.12 installed; full audit now 0 high/critical, 2 moderate development advisories | `dependency-audit-patched.json` |
| U6 integrated server and lint | 102 server tests passed with real Redis; full repository lint passed | `u6-integrated-server.json`, `u6-integrated-lint.log` |
| U6 intermediate frontend regression | 3,942 passed, 10 failed, zero pending; seven known corpus gaps and three newly detected local incomplete-phrase presentation regressions | `u6-integrated-unit.json` |
| U6 repaired integration | 70 affected/hosted tests passed across ten files, zero pending; rebuilt application passed all three onboarding/geometry browser tests, zero retries | `u6-repaired-authoritative.json`, `u6-integrated-build.log`, `u6-browser-authoritative.json` |
| U7 worker corpus checkpoint | 33,740 declared outcomes recorded: 33,740 passed, zero failed/skipped/missing; final integrated run pending | `u7-corpus-attempt2-production-pipeline-report.json`, `u7-corpus-attempt2-production-case-results.jsonl` |
| U7 worker HTTPS checkpoint | Two native synthetic-microphone browser tests passed, zero retries: invitation/Start/durable save/Stop and failed cross-tab logout with reload/new-tab opt-out; root replay and expanded boundary cases pending | `u7-https-attempt4.json`, `u7-https-attempt4.log` |
| U7 intermediate local browser slice | Two passed, three failed; exact failures retained for diagnosis, no waiver | `u7-local-browser-attempt1.json`, `u7-local-browser-attempt1.log` |

The initial focused browser run verified real calendar geometry, compound persistence and undo/redo, multi-action preservation, and invalid input feedback. Its remaining test timed out on the outdated `Product meeting — 10 AM` choice label at `e2e/flow.spec.ts:112`; the current label includes the date. After correcting that selector, root rebuilt the integrated checkout and all five journeys passed in Chrome with zero retries. The initial sandbox run could not launch Chrome and is infrastructure evidence only. These browser tests use typed commands, not real speech providers.

The U7 HTTPS fixture uses the native browser microphone API with a declared synthetic WAV, the real worklet, HTTPS/WSS gateway and Redis, plus synthetic provider adapters. It does not establish real provider transcription, inference, speech quality or latency. The failed-logout test first reproduced an actual microphone remaining live in a sibling tab; the subsequent worker pass verifies track shutdown and persistent opt-out. `triage/requirements-evidence-map.md` lists the remaining acceptance evidence.

Source triage classified all 463 baseline assertions in `triage/classified-failures.json`; classification is not a repair or waiver. The detailed handoff is `triage/U1-U10-triage.md`. It identified 294 commitment failures and false-positive prose recognition as production defects. The corpus reporter also omits failed/unreached outcomes and must become complete before its accuracy can be used.

The commitment/prose repair cleared those 295 failed assertion identities. Frozen commitment oracles were not edited. U10 subsequently reconciled acquisition fixtures with the supported lifecycle and corrected stale confirmation, same-day placement, and three title-parsing defects. Root's integrated run covers all `src/app` tests plus affected transaction, kernel bridge, calendar, and geometry tests. The production pipeline's remaining aggregate report failure is its hardcoded 33,700 count against 33,740 declared outcomes after adding required dictation turns; U7 owns reporter repair and complete outcome accounting. Corpus admission and capability-coverage requirements still require full-suite disposition. No exception has been approved.

The real Redis restart probe preserved the charged ledger while changing the server process identity. The corrected gateway refused readiness/reservations and returned inference unavailable with zero provider calls; `/journal` still returned 200. Evidence: `triage/u3-redis-restart-proof.json`. Operators must reconcile usage after a store restart; startup never silently authorizes restored counters. Account-level Redis configuration and the provider deployment remain unverified.

U9 now stages kernel session/idempotency writes until persistence, releases the document lock during inference, and rejects stale execution after cancellation, supersession, revision changes, or expiry. Focused tests exercise real stored snapshots, failed saves, retry exactly once, explicit discard, compound local persistence, and proposal validation. Hosted model plans containing multiple steps and a mutation request separate reviews before any execution; a one-step preview cannot approve undisclosed subsequent changes. `u9-red.json` records the initial reproduced defects. This evidence does not cover real hosted providers or the full application/browser suites.

Deployment inputs and provider lifecycle decisions are tracked in `artifacts/hosted-release/20261002-source/deployment-decisions.md`. The speech candidate is now character-billed `tts-1` so a complete bounded request can be reserved before generation. Live voice quality and latency remain unverified. No provider spending or infrastructure purchase has been authorized or performed.

## Remote CI

Run `36990095447`, branch `ci-pipeline-upgrade-2026`, commit `e59373f6ca9cdbac8bc878dc6c03757047216b39`, completed with a baseline-tolerant success. This is a different source candidate. Its run and job metadata are saved in `remote-ci.json`; it is not a passing result for this working tree.

## Release rule

The hosted plan requires G1–G8 on a frozen candidate. A new failed identity, a missing report, an unfinished run, a skipped critical test, or any reachable critical defect blocks release. Local companion tests, provider doubles, and real hosted-provider evidence remain separate.
