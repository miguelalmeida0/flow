# Flow visual reward release assessment

Date: 2026-09-05. This report is an in-progress assessment until the final manifest, visual review, and independent verdict below are filled in. Historical passes are not fresh release evidence.

## 1. Final verdict

**NOT RELEASED — independent QA FAIL.** The fresh complete automated release passed at `2026-09-05T13:06:48.762Z`, including the unchanged legacy guard. Independent QA then identified distorted text during Home → Today entry and missing development StrictMode coverage for the six signatures. Both exact findings are assigned to the principal for bounded repair. Sections with earlier measurements below are historical until replaced with the final corrected candidate.

## 2. Baseline results

The mission baseline passed 728 unit/integration tests and 59 production Chromium tests. See `VISUAL_REWARD_BASELINE.md`. The existing calendar, language corpus, LifeState history, and shared typed/voice path were retained. Managed-host Chromium could not launch; browser validation uses the matching Playwright 1.62.1 container, not a substitute renderer or mocked application.

## 3. Final release results

The latest complete `artifacts/release-qa/results.json` is automated **PASS**: seven commands exited zero; 793 unit/integration tests across 30 files, strict TypeScript/build, 127-module design migration, four motion cases, 71 production Chromium tests and one development acquisition test passed without retries/skips/flakes. The unchanged cold legacy guard completed twenty transitions with zero long tasks/drops/residue. The browser error arrays are empty. The earlier 87 ms legacy failure remains preserved, not waived. Independent assessment remains **FAIL** for the two concrete issues in §1; passing existing automation does not establish release completion.

## 4. Product reward transformation

Flow now acknowledges real intent and persisted consequences proportionally, then returns to stillness. Small edits receive a quiet acknowledgment; moving or creating work receives a bounded semantic response; substantial recovery and completion can earn a milestone. Durable domain meaning survives the animation. This applies across Home, Today, Focus, Capture, Outcomes, and Commitments—not only the portfolio recording.

## 5. Reward event architecture

Typed submission and final recognition use the same interpreter and typed action pipeline. The pure draft is validated, persisted with revision/CAS protection, and committed as one history operation. Only then does the provider emit a frozen transaction event. Stable before/after identities plus typed actions produce reward facts. `RewardDirector` decides presentation; it cannot modify `LifeDocument` or add history. Internal cross-world navigation preserves the original transaction reward instead of replacing it with a navigation acknowledgment.

## 6. Reward levels and suppression

Level 0 suppresses failed/no-op/ambiguous/pending/preview/hydration/migration/remote/hidden/background work. Level 1 acknowledges navigation, intent, and small edits. Level 2 confirms resolved work. Level 3 is restricted to actual Tide recovery, meaningful elapsed Focus completion, semantically completed Outcomes, and kept Commitments. Transaction IDs, coalescing, cancellation, and cooldowns prevent duplicate or queued ceremonies. Undo is neutral; redo is capped at Level 2.

## 7. Motion library ownership

Motion for React owns live DOM layout and presence. The measured flight layer owns one aria-hidden source clone. The mascot renderer owns its local DOM/SVG character. Native Web Audio owns consented sound. No two engines transform the same element. Verified installed versions are React 19.2.8, Motion 12.43.0, and Playwright 1.62.1; these are not inferred from dependency lower bounds.

## 8. Motion for React implementation

Shared semantic tokens and recipes define Tide, Anchor, Bloom, and neutral-history motion, including their reduced variants. Work commits immediately; motion never delays the action. Active effects cancel on new work, undo, preference changes, visibility loss, and unmount. Calendar events, timeline, and Breathing Room honor both OS and in-app Reduced preferences. Important-event stars explicitly settle at opacity one.

## 9. GSAP / FLIP implementation

GSAP is not installed. Measured transform-FLIP implements the cross-world transition using Motion and one clone. This avoids introducing a competing animation owner. The source and actual destination are measured; the path, clone, label, and shell residue must all disappear at settle.

## 10. Rive or mascot fallback

No valid `.riv` asset exists, so Rive is not claimed. The local DOM/SVG renderer implements semantic poses. The mascot is absent during hydration, routine edits, active focus, utility routes, and crowded layouts. It appears only for an actual Live listening/understanding moment or active earned Level-3 moment when its measured footprint is clear of cards and controls. Resize, scrolling, temporal changes, browser Back, and remote adoption re-evaluate safety. Minimal preference remains available.

## 11. Web Audio implementation

Sound is Off by default and requires explicit opt-in. A lazy, StrictMode-safe singleton synthesizes short local cues without downloads or a paid service. At most one cue accompanies a transaction. New work, history, visibility loss, preferences, and teardown cancel active nodes. No information is available exclusively through sound.

## 12. Signature interactions

The six real signatures are Tide recovery, elapsed Focus completion, Outcome completion, Commitment kept, temporal scene travel, and Capture-to-Outcome. Each uses real UI actions and persisted domain consequences. The stress matrix applies all six twenty times across full/reduced motion and normal/4× CPU conditions, with interruption, history, navigation, resize, visibility, and lifecycle cuts.

## 13. Tide recovery

Flexible work reflows or explicitly defers while protected and fixed anchors remain still. The recovered-time result remains readable after the bounded Tide motion. Stable IDs, positive durations, supported bounds, no duplication/loss/overlap, and atomic compound behavior remain enforced by the scheduling engine. This mission did not replace Tide scheduling with a visual demo.

## 14. Focus completion

An immediate stop cannot manufacture a Level-3 milestone. Meaningful elapsed work produces persisted protected minutes and a durable completion result. The browser fixture changes wall-clock Date only; native requestAnimationFrame, performance timing, timers, and WAAPI remain real. The completion image is not a fabricated elapsed-time pose.

## 15. Cross-world reward

Capture becomes an actual Outcome with editable steps and preserved lineage. One measured source travels to the actual destination, then disappears. Completed Outcomes retain their meaning without contradictory editing controls. A kept Commitment remains a durable relationship fact after leaving the open list. Temporal navigation updates all Home lenses coherently without adding domain history.

## 16. Undo / redo

Undo cancels presentation before restoring the exact document, links, deferred items, protection, Focus state, and transaction metadata. Redo restores the same operation with presentation capped at Level 2. One logical compound operation remains one history entry. Failed, clarified, unsupported, previewed, or navigational commands do not manufacture history.

## 17. Reduced motion

System, Full, and Reduced preferences are available. Reduced mode removes decorative travel and ceremony while retaining source/destination hierarchy, immediate changes, readable durable results, and every action. Hidden documents suppress sensory output and do not replay missed celebrations on return.

## 18. Accessibility

Meaning is not dependent on sound, color, movement, or the aria-hidden mascot. Controls retain semantic names, keyboard access, and visible focus. Mobile headings reserve space above the milestone label; the command surface remains reachable. Measured mascot exclusion prevents overlap with actual cards and controls. These checks are not a claim of third-party accessibility certification.

## 19. Performance measurements

The current authoritative base performance audit passed: normal maximum frame gap 133.3 ms, estimated misses 3.79%, longest task 72 ms; deliberate 4× CPU maximum gap 133.4 ms, estimated misses 0.26%, longest task 81 ms. CLS is 0.02838, DOM delta +15, listener delta −4, and settled animations/reward layers/clones/frame loops/audio nodes are zero. The complete release remains pending.

Budgets are unchanged: normal maximum frame gap 200 ms, long task 120 ms, estimated missed frames 8%; at 4× CPU, maximum gap/long task 600 ms and estimated misses 12%; CLS 0.25, DOM growth 180, listener growth 30. CPU profiles are diagnostic and are never substituted for default, profiler-off acceptance runs.

Before restarting the complete release, the frozen build passed three consecutive default 20-cycle checks with both profiler and additional attribution disabled:

| Run | Normal max gap | Estimated misses | Longest task | 4× max gap |
| --- | ---: | ---: | ---: | ---: |
| 1 | 83.4 ms | 4.38% | 82 ms | 166.6 ms |
| 2 | 66.6 ms | 1.79% | 56 ms | 166.7 ms |
| 3 | 33.4 ms | 0.74% | 0 ms | 133.4 ms |

All three passed every budget and residue assertion. Their full metrics/logs are in `artifacts/reward-resume-diagnostics/layout-cache-stability-followup/`. The preceding FAIL/FAIL/PASS batch remains in `layout-cache-stability/`. Native idle controls and resource observations document large shared-environment variance; they do not claim every earlier long task was external and do not substitute for the release gate.

## 20. Motion audit

Root inspected all 144 corrected native-compositor frames after the targeted matrix passed. Capture-to-Outcome now has independently resizing paper and unscaled co-moving text, legible at every sampled phase and viewport. The 96 intermediate images have distinct real compositor timestamps, a maximum nominal sample error of 9.70 ms and a maximum nearest native-audit skew of 8.34 ms. Time travel is sampled against its existing 480 ms scene transition, not its separate 180 ms reward acknowledgement. No clocks were paused, product durations lengthened, or poses synthesized. `docs/quality/design-qa.md` records the fresh complete visual approval and preserves the prior failures. The principal previously fixed a simulated-clock/native-animation mismatch, calendar Reduced ownership, invisible importance markers, mobile milestone collisions, Home mascot safe zones, internal choreography labels, and replacement of the original cross-world reward. Profile-attributed repeated clock formatting is now bounded/cached. Geometry-dependent calendar snapshots skip feedback-only renders while retaining actual movement, parent-height changes, selection, drag/resize, and native viewport handling; all nine focused production geometry tests pass. Failed candidates remain identifiable; the full release is still pending.

## 21. Unit / integration counts

The final frozen implementation passed **793 tests across 30 files**. Actual output in `artifacts/release-qa/tests.log`:

```text
Test Files  30 passed (30)
     Tests  793 passed (793)
  Duration  55.32s
```

Semantic corpus cases are reported separately from Vitest tests; they are not asserted to be globally unique utterances.

## 22. Browser E2E counts

Final production, development StrictMode, motion, and aggregate counts pending. No old test was removed to gain a pass. The full release must finish before a fresh independent assessment.

## 23. Visual frame inventory

The canonical matrix is six signatures × four viewports × six samples = exactly 144 PNGs. Root review attachments contain 24 six-frame contact sheets with each source PNG's SHA-256 and actual native capture interval. They are noncanonical and cannot inflate the frame count. The final regenerated matrix, locked 1672 × 941 reference comparison, and portfolio recording still require final human-model inspection. The locked reference hash is `9e439ed9ee367c606df2653a2c0b6d17d4cf4cf9ddd398312507b522f6c751c3`.

## 24. Portfolio recording

The canonical output is `artifacts/visual-reward-qa/portfolio-demo.webm`. Its final run identity, size, duration, and direct motion review are pending. A recording file's existence is not an assertion of visual quality or proof of acoustic recognition.

## 25. Synthetic voice

Final result pending the complete release. Synthetic tests exercise the final recognition adapter boundary through the actual voice UI and shared production transaction path, including one foreground session, navigation, follow-up context, exact transcript display, error recovery, and recognition-boundary deduplication. The parser and scheduler are not mocked.

## 26. Physical microphone

**NOT RUN.** Synthetic transcripts cannot establish acoustic recognition, microphone permission/device selection, Chrome speech-service availability, or room conditions. `VOICE_ACCEPTANCE.md` records the separate twelve-phrase, one-activation physical journey. No acoustic PASS is inferred from a browser video or injected recognition test.

## 27. Genuine limitations

Interpretation is deterministic English and intentionally bounded. Persistence is local-first, without accounts, provider sync, recurrence, or collaboration. Browser speech depends on hardware, permission, and speech-service availability. No valid Rive asset was supplied. Free weather has explicit stale/unavailable states and a coarse Berlin default. The production bundle's Vite size advisory remains a non-blocking optimization opportunity. This workspace exposes no usable Git revision, so no commit or Git-derived exact diff is fabricated.

## 28. Exact changed-file inventory

The final mission-owned file list will be recorded in `docs/quality/VERIFICATION.md` and copied here after source freeze. It is a recorded ownership inventory, not a reconstructed Git diff. `artifacts/visual-reward-review/source-snapshot.json` fingerprints release inputs; a hash snapshot does not identify pre-mission changes.

## 29. Run Flow

```bash
cd ~/Downloads/flow-voice-calendar
npm install
npm run dev
```

Production preview:

```bash
npm run build
npm run preview -- --host 127.0.0.1 --port 4174 --strictPort
```

## 30. Run complete QA

```bash
cd ~/Downloads/flow-voice-calendar
npm run qa:release
```

Focused constituent gates:

```bash
npm run lint
npm run test:run
npm run build
npm run qa:design-migration
npm run qa:motion
FLOW_RELEASE_QA=1 npm run test:e2e
npm run test:e2e:dev
```

The complete release preserves command output, JSON manifests, browser reports, traces, native frames, stress metrics, and the portfolio recording. Do not reuse a historical PASS for changed production code.
