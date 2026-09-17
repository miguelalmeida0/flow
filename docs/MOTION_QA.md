# Motion QA

Run the dedicated gate after a production build:

```bash
npm run build
npm run qa:motion
```

`qa:motion` runs the real production UI and action engine. It deletes stale motion evidence, captures the six signature sequences at 1440, 1280, 834, and 390 px at requested 0/20/40/60/80/100% samples, runs 20 interrupted production cycles plus six signatures × 20 interrupted repetitions, records browser errors and performance diagnostics, saves full traces/video, and records the portfolio journey. It fails unless all 144 frames are present and passed command visibility/containment/overflow/clone/target checks, native frame timing is complete, both performance/stress verdicts are PASS, browser error arrays are empty, and a nonempty portfolio recording exists.

All motion measurement and signature screenshots use native requestAnimationFrame, performance.now, timers, and Web Animations clocks. The fixture shifts only Date and lets elapsed wall time continue. Each 0% frame precedes the real trigger, and 100% requires all native animations, reward layers, and transition clones to have settled. The 96 intermediate PNGs are actual Chromium `Page.screencastFrame` payloads. Capture time comes from `ScreencastFrameMetadata.timestamp`, converted to the renderer's monotonic clock with `performance.timeOrigin`; callback arrival and PNG transfer latency are recorded only as diagnostics and never used as acquisition time.

A tiny test-only 4 × 4 pixel marker is installed before the real Enter key. A native rAF paint tick and an independently composited WAAPI pulse keep Chromium's damage-driven screencast producing frames while the product transaction occupies the renderer. The marker is removed after capture and excluded from decoded product-pixel fingerprints with a 12 × 12 top-left mask. The gate requires four different semantic pixel digests outside that mask for every active timeline, so encoder-byte changes or the heartbeat alone cannot satisfy progression. Each compositor frame is also paired to the nearest separately timestamped native rAF DOM/WAAPI audit within the same fixed tolerance. Time travel samples the existing 480 ms whole-Home scene from its native WAAPI start, not the separate 180 ms acknowledgment. Its nominal intermediate samples are 96/192/288/384 ms. The other signature timelines remain 1120 ms (ceremonies) and 1220 ms (Capture flight). Timing remains ±60 ms, with ±25 ms reserved for a future short timeline of at most 200 ms. Missing metadata, coverage, audit pairing, or product-pixel progression fails the gate. No direct-screenshot dispatch timestamp, synthetic pose, mocked rAF, paused clock, longer ceremony, image interpolation, or manually moved product DOM is accepted.

`frame-timing.json` retains nominal percentages, native metadata timestamps, mapped capture times, callback arrival lag, semantic pixel digests, and paired renderer audits. Zero/settled frames retain their actual screenshot request/return intervals because they are boundary evidence rather than intermediate timing evidence. `compositor-provenance.json` preserves every metadata-timestamped frame and renderer audit sample for all 24 sequences. The matrix retains full action/DOM/source traces while disabling the trace recorder's competing JPEG screenshots. Independent contact-sheet review is still required; nominal labels are never described as exact frozen poses.

Artifacts:

- `artifacts/visual-reward-qa/results.json`
- `artifacts/visual-reward-qa/frame-manifest.json`
- `artifacts/visual-reward-qa/frame-index.html`
- `artifacts/visual-reward-qa/frame-timing.json`
- `artifacts/visual-reward-qa/compositor-provenance.json`
- `artifacts/visual-reward-qa/signature-stress.json`
- `artifacts/visual-reward-qa/motion-metrics.json`
- `artifacts/visual-reward-qa/browser-evidence.json`
- `artifacts/visual-reward-qa/playwright-results.json`
- `artifacts/visual-reward-qa/playwright-report/`
- `artifacts/visual-reward-qa/playwright-results/` (traces and per-test video)
- `artifacts/visual-reward-qa/portfolio-demo.webm`

The canonical `artifacts/visual-reward-qa/` tree is reserved for `npm run qa:motion` and the enclosing `npm run qa:release`. Both commands replace any previous canonical tree with a clean same-volume directory before the run. Direct Playwright, `--grep`, `--list`, and development-debug invocations are assigned a unique directory under `artifacts/visual-reward-debug/`; supplying the canonical path without an authorized release owner is rejected during configuration. Development HTML/JSON reporters, Playwright test output, screenshots, and StrictMode browser evidence are derived from that same unique debug root. Only the explicit `qa:release` owner may map them to `artifacts/release-qa/playwright-dev-*` and `artifacts/always-on-voice-release/`. This keeps focused results from being paired with older full-run evidence. A focused/debug result is diagnostic only and is never consumed by the release runner.

The local equivalent audit uses PerformanceObserver, a requestAnimationFrame sampler, Chrome DOM/listener counters, runtime Motion/reward/audio diagnostics, and strict residue assertions. It reports actual availability and does not call itself MotionScore. The performance worker disables Playwright trace recording because trace DOM snapshots execute in the measured page process; `motion-metrics.json` records `traceDisabledForMeasurement: true` plus the exact phase of each maximum frame gap. The signature-frame and portfolio workers retain trace evidence. Budgets are unchanged: longest observed product long task ≤120 ms, normal frame gap ≤200 ms, 4×-CPU frame gap/long task ≤600 ms, CLS ≤0.25, DOM growth ≤180 nodes, listener growth ≤30, missed-frame rate ≤8% normally and ≤12% against the correct 66.68 ms frame budget during deliberate 4× CPU throttling, and exactly zero running animation, reward target, transition clone, active frame loop, or audio node at settle. Rates are used instead of absolute missed-frame totals because slower CI hosts produce more samples for the same journey; the raw sample and miss counts remain in the artifact.

The normal authoritative gate is `npm run qa:release`, which includes this motion gate before the production and actual development StrictMode browser suites. The release additionally requires native Home → Today intermediate text geometry (`artifacts/route-entry-motion/`) and all six signatures × Full/Reduced in Vite development (`development-signatures.json`). Runtime probes confirm the development renderer and StrictEffectsMode; production wrapping alone is not equivalent evidence. All twelve signature cases interrupt fresh active presentation and verify exact state/history plus zero cleanup residue. Managed macOS Chrome may fail to launch with the documented sandbox EPERM/SIGABRT; in that environment use the repository-matched `mcr.microsoft.com/playwright:v1.62.1-noble` container without changing expectations.

Run the final gate only on a quiet host, using this exact container configuration (the preview retained for the user on 4174 is separate):

```bash
docker run --rm --name flow-reward-final-native-release --shm-size=1g \
  -v ~/Downloads/flow-voice-calendar:/work \
  -v flow-visual-reward-node-modules-v2:/work/node_modules \
  -w /work -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  mcr.microsoft.com/playwright:v1.62.1-noble npm run qa:release
```

This is private container IPC with a 1 GiB `/dev/shm`, not host IPC. No CPU affinity, CPU quota, scheduling-priority override, extra retry, disabled assertion, or changed timing budget is applied. The image digest is `sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e`. The Docker VM reports 8 CPUs and 8,321,994,752 bytes RAM shared with unrelated workloads; resource contention observations are preserved separately from product findings. Verified installed versions inside the release container are Node 24.18.1, React/React DOM 19.2.8, Motion/framer-motion/motion-dom 12.43.0, Playwright 1.62.1, Vite 7.3.6, Tailwind Vite 4.3.3, TypeScript 5.9.3, and esbuild 0.28.2. Declared package ranges are not represented as exact installed versions. Targeted checks use the same mounts/image/shared-memory setting and the existing production Playwright config. `FLOW_PROFILE_MOTION=1` and `FLOW_ATTRIBUTION_MOTION=1` are diagnostic-only flags, absent from acceptance runs.

Frame existence is not visual approval. The manifest contains exactly 144 canonical frames: six sequences × four viewports × six samples. Playwright failure screenshots, report assets, and generated contact sheets are explicitly noncanonical QA attachments and are not counted toward 144. After every final run, inspect the 24 canonical frames for each sequence through `frame-index.html` or contact sheets and record source/destination clarity, unrelated motion, line/path quality, text clarity, mascot/control collision, residue, route flashes, dead space, mobile containment, protection stability, reduced behavior, and settled state in `docs/quality/design-qa.md`.

## Previous automated motion run — independent findings being repaired

The `2026-09-05T13:02:05.654Z` motion manifest passed its then-current gate. Independent QA subsequently found route-entry text distortion in the recording and missing actual development StrictMode signature coverage. The following metrics are historical; a fresh full gate is required for the repaired source. Complete previous evidence is preserved under `artifacts/reward-resume-diagnostics/independent-gate-failure/`.

- 4/4 motion cases (6.6 minutes), 144/144 canonical frames and no noncanonical QA PNGs in the generated gate directory;
- 96 native compositor intermediate frames: maximum nominal timing error 30.423 ms within the fixed 60 ms bound; maximum native audit skew 24.276 ms;
- 24 six-frame review sheets are separate noncanonical attachments, with actual final visual review recorded in `docs/quality/design-qa.md`;
- 20 production performance cycles plus six signatures × 20 full/reduced/normal/throttled lifecycle repetitions;
- normal: 247 samples, 33.4 ms maximum frame gap at `cycle-1:history`, one estimated miss (0.403%), and no observed long task;
- deliberate 4× CPU throttling: 333 samples, 66.7 ms maximum gap at `cycle-15:history`, no estimated misses, and observed 59/51 ms long tasks, all within the unchanged 600 ms throttled budget;
- CLS 0.02837721, node delta +15, listener delta −4, document delta 0;
- zero running animations, reward targets, transition residue, active clones, frame loops, or audio nodes at settle;
- two trace archives from the trace-enabled signature/portfolio workers;
- `portfolio-demo.webm`, 3,549,013 bytes;
- the separate unchanged cold legacy guard passed 20 transitions (36.6-second test), median 10.9 ms, zero measured long tasks, estimated drops, clones or frame loops, against its original 50 ms long-task limit.

The performance worker's `traceDisabledForMeasurement: true` flag is local to that worker; it prevents Playwright snapshot collection from contaminating the measured main thread. It does not remove the required trace evidence from the other two journeys. The throttled long tasks above are reported honestly rather than described as zero; they remain below the locked gate.
