# Flow Apple-grade rescue checkpoint

Saved: 2026-09-04 00:20 CEST

## Stop state

- Work was stopped immediately at the user's request.
- Both Flow Playwright Docker containers were stopped explicitly (`793bb0915965`, `7aa1fc8421dd`).
- No Flow Playwright container remained running after the stop check.
- `apple_rescue_principal` was interrupted after completing the visual-gate code repair and targeted validation.
- `apple_rescue_mapper` and `apple_rescue_language` are complete.
- The latest independent `apple_rescue_qa` verdict is **FAIL**; it must be rerun after the repaired full release evidence exists.

## Completed implementation

The principal implementation already contains the Apple-grade P0/P1/P2 product rescue:

- Canonical Home, Today, Capture, Outcomes, and Commitments spaces, with Now embedded in Home/Today.
- One route-independent global command router and one typed/final-voice command pipeline.
- One `LifeDocument`/`LifeAction` atomic transaction and exact global undo/redo boundary.
- Persistent conversational entity context across navigation.
- Direct Calendar, Outcome, step, and Commitment language required by the 14-command acceptance journey.
- Navigation and unsupported speech do not create Capture data.
- Global Live Session ownership, acquisition/retry, cross-tab handling, and StrictMode coverage.
- Complete page utility loops and deterministic Now recommendations.
- Tide/Anchor/Bloom motion and reduced-motion behavior.
- Expanded semantic, unit, integration, browser, motion, and release-evidence coverage.

## Last independently audited evidence

The previous clean release run reported:

- lint: PASS
- unit: 18 files, 581/581 tests
- semantic corpus: 982 total, including 592 Apple-grade supported variants
- build: PASS
- production Chromium: 46/46
- development StrictMode Chromium: 1/1
- console errors, page errors, and failed application requests: zero

However, independent QA correctly rejected that release because the saved motion frames contained blank/frozen/clipped states and the documentation was stale. Therefore the current `artifacts/release-qa/results.json` is **historical pre-repair evidence and is not a final verdict**.

Physical acoustic execution of the exact 14-command journey is still **NOT RUN**. Synthetic final-transcript/recognition-adapter coverage is green, but it must not be described as a physical-microphone pass.

## Independent QA failures that were routed back

1. `docs/quality/VERIFICATION.md` and `docs/quality/design-qa.md` still contradict fresh evidence: they report 578 tests, partial screenshots, missing motion evidence, and an awaiting-external-run status.
2. The prior 75-frame matrix passed only filename/existence/residue checks. QA found blank Tide recovery, blank/frozen tablet/mobile event movement and completion frames, and clipped mobile Outcome-step-to-Today flight content.

## Repair applied after the QA failure

The principal completed these changes before the stop:

- Disabled the route shell's transparent initial render (`initial={false}`).
- Added route/page scroll reset so evidence captures the intended destination content.
- Bounded shared-flight geometry to the viewport and kept flight text legible instead of clipped.
- Corrected transition destination IDs for deferred Calendar events.
- Strengthened the Apple motion test to require:
  - a visible route shell and meaningful route content;
  - bounded transition surfaces;
  - a true pre-submit 0% frame;
  - absolute capture timing;
  - at least three visually distinct frames for every operation/viewport group.

Files touched by this last repair:

- `e2e/apple-product-rescue.spec.ts`
- `src/app/FlowEnvironmentApp.test.tsx`
- `src/app/FlowEnvironmentApp.tsx`
- `src/app/FlowEnvironmentProvider.tsx`
- `src/features/day-planner/CalendarSpace.tsx`
- `src/shared/motion/SharedFlightLayer.tsx`
- `src/test/setup.ts`

## Validation completed after the repair

- `npm run lint`: PASS
- unit suite: 18 files, 581/581 tests PASS
- `npm run build`: PASS
- targeted Docker Apple motion-matrix test: 1/1 PASS in 26.6 seconds
- regenerated motion frames: 75/75 present

The principal had begun visually inspecting all 15 five-frame groups. That inspection was not finished before the stop.

## Interrupted work

A new clean Docker `npm run qa:release` was in progress when stopped. It did not finish and produced no new final release verdict. Do not infer a pass from that interrupted run.

The interrupted run used the named volumes:

- `flow-apple-qa-node-modules`
- `flow-apple-qa-node-modules-visual`

These volumes are build caches only. The second was created because the first contained root-owned Playwright cache entries. Both active containers were stopped; the volumes were intentionally preserved for resumption.

## Exact resume sequence

1. Resume `apple_rescue_principal` with this checkpoint and finish visual inspection of all 75 regenerated frames (15 five-frame groups).
2. If any group is blank, frozen, ambiguous, clipped, or loses unrelated layout, repair it before running the complete gate.
3. Normalize the node-modules volume ownership, then run the clean release gate:

   ```bash
   docker run --rm \
     -v flow-apple-qa-node-modules:/work/node_modules \
     mcr.microsoft.com/playwright:v1.62.1-noble \
     chown -R 501:20 /work/node_modules

   docker run --rm --user 501:20 \
     -e npm_config_cache=/tmp/flow-npm-cache \
     -e CI=1 \
     -v ~/Downloads/flow-voice-calendar:/work \
     -v flow-apple-qa-node-modules:/work/node_modules \
     -w /work \
     mcr.microsoft.com/playwright:v1.62.1-noble \
     bash -lc 'npm ci && mkdir -p node_modules/.cache && ln -sfn /ms-playwright node_modules/.cache/ms-playwright && npm run qa:release'
   ```

4. Inspect the new `artifacts/release-qa/results.json`, Playwright JSON/HTML, all key screenshots, every motion group, and traces where relevant.
5. Update `docs/quality/VERIFICATION.md` and `docs/quality/design-qa.md` to the exact new counts and evidence. Keep the physical microphone result separate and honest.
6. Reactivate the same independent `apple_rescue_qa` agent with the repaired evidence and documents.
7. If QA returns any failure, route its exact report back to `apple_rescue_principal` and repeat. Declare release only after independent QA returns `PASS`.
8. Run the physical one-activation 14-command acoustic journey separately; until a human actually speaks it successfully, its verdict remains `NOT RUN`.

## Source-control note

This source bundle has no `.git` metadata, so no checkpoint commit could be created and added-versus-modified provenance cannot be reconstructed. The working files and generated artifacts are preserved in place.
