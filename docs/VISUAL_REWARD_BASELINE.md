# Visual reward baseline

Captured before production edits on 2026-09-04.

## Release state

- `npm install`: PASS — 286 packages audited, 0 vulnerabilities.
- `npm run lint`: PASS.
- `npm run test:run`: PASS — 23 files, 728 tests.
- `npm run build`: PASS — 627 modules; JavaScript 717.92 kB / 215.15 kB gzip. The authoritative container release build also recorded CSS 62.79 kB and JavaScript 717.92 kB / 215.77 kB gzip.
- Direct managed-macOS `npm run test:e2e`: browser launch failed with Chrome `SIGABRT`/`EPERM`, before application code ran.
- The unchanged suite in the repository-matched `mcr.microsoft.com/playwright:v1.62.1-noble` runtime: PASS — 59/59 production Chromium tests.
- Authoritative container `npm run qa:release`: PASS — 728 tests, strict build, design migration, 59 production E2E and 1 development StrictMode E2E; `FLOW PRODUCT RESCUE RELEASE QA: PASS`.

The host launch failure is an infrastructure limitation, not hidden product evidence. Saved baseline evidence is in `artifacts/release-qa/results.json`.

## Product and routes

Canonical routes were `/`, `/today`, `/focus`, `/weather-outfit`, `/people`, `/people?view=commitments`, `/good-to-know`, `/capture`, `/outcomes`, and `/outcomes/:id`. Legacy Calendar, Inbox, Plans, Commitments, and Now URLs resolved to those canonical worlds.

One `FlowEnvironmentProvider` owned the versioned LifeDocument, atomic LifeAction transaction commit, persistence/CAS, exact history, temporal projection, global command interpreter, and one shell-owned browser recognition session. Typed and final voice transcripts already shared `runCommand`.

## Motion and mascot

- Dependency: Motion for React 12.23.12. No GSAP, Rive, audio, particle, canvas, WebGL, or second state runtime.
- Existing transitions: route layout motion, three measured shared-flight kinds, calendar layout motion, Tide SVG path, event recolor/anchor treatments, and transition diagnostics.
- Mascot: local DOM/SVG-compatible soft-form implementation; no `.riv` or production audio asset existed.
- Reduced motion: the OS `prefers-reduced-motion` query controlled Motion and the measured shared-flight fallback. There was no in-product override.

## Known motion defects at entry

- No typed reward contract, post-commit RewardDirector, fatigue/cooldown policy, audio consent runtime, settings, or reward inspector.
- Cross-domain transaction detail was flattened into summary copy; real before/after state was the only trustworthy source for reward facts.
- Calendar feedback could keep a changed visual treatment after the actual transition settled.
- Home lenses did not own stable cross-route layout identity.
- The mascot used an infinite listening translation loop and had no semantic adapter contract.
- Focus showed a fixed progress value and an immediate stop could be described as completion.
- Commitment reservations were not guaranteed protected.
- Instinct dismissal was not a real “acted on” semantic action.
- The release harness had no `qa:motion`, 144-frame Level 3 matrix, reward/audio diagnostics, or portfolio recording.

## Baseline visual evidence

- Locked source: `docs/internal/handoffs/FLOW_ELITE_HANDOFF_FINAL_2026-09-04/design/FLOW_FINAL_LOCKED_REFERENCE.png`
- Current production matrix: `artifacts/elite-product-rescue/visual-matrix/`
- Motion evidence: `artifacts/apple-grade-release/` and `artifacts/living-environment-release/motion-stress.json`

Git metadata was unavailable in this source directory, so no branch or commit was recorded.
