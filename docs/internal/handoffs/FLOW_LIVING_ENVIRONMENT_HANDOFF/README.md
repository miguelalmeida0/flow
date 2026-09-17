# Flow Living Environment — Elite Motion-Led Handoff

This package defines the next portfolio release after the Breathing Day + Tide calendar is stable.

## Product definition

**Flow is one calm, living environment with multiple views into the same life.**

- **Calendar** shows entities by time.
- **Inbox** shows what is unresolved.
- **Plans** show what an outcome requires.
- **People** show promises and waiting states.
- **Now** shows what genuinely fits the current moment.

The spaces are not separate mini-apps. They are projections of one shared model. An item may move visually between spaces, but it is never duplicated as unrelated data.

> Capture once. Let meaning travel. Let time adapt.

The signature interaction is the attached **Inbox → Plan morph**: a capture gains focus, releases a calm Tide path, and materializes into a structured plan without a modal, spinner, Three.js scene, or chat transcript.

## Prerequisite

Do not start this expansion until the current Tide calendar branch is verified and usable through the real UI. Preserve its scheduling engine, storage migration, event history, voice pipeline, and release harness.

Start the expansion on a separate branch when Git metadata exists. If the supplied directory has no Git metadata, report that honestly and continue without pretending to create commits.

## Read in this order

1. `PASTE_THIS_IN_CODEX.txt`
2. `FLOW_LIVING_ENVIRONMENT_MASTER_PROMPT.md`
3. `00_EXECUTIVE_MANDATE.md`
4. `01_PRODUCT_NORTH_STAR.md`
5. `02_INFORMATION_ARCHITECTURE.md`
6. `03_SCREEN_SPECIFICATIONS.md`
7. `04_MOTION_SYSTEM.md`
8. `05_INBOX_TO_PLAN_CHOREOGRAPHY.md`
9. `06_GLOBAL_VOICE_AND_PRESENCE.md`
10. `07_DESIGN_SYSTEM.md`
11. `08_DOMAIN_ARCHITECTURE.md`
12. `09_IMPLEMENTATION_ROADMAP.md`
13. `10_ACCEPTANCE_AND_QA.md`
14. `11_SCOPE_AND_NON_GOALS.md`
15. `12_PORTFOLIO_DEMO_SCRIPT.md`
16. `reference/*.ts`
17. `assets/boards/*.png`
18. `assets/screens/*.png`

## Asset map

- `assets/boards/screen-map.png` — all target screens in one board.
- `assets/boards/motion-reference-annotated.png` — annotated motion language.
- `assets/boards/inbox-to-plan-storyboard.png` — six-beat choreography.
- `assets/reference/inbox-plan-animation-reference.png` — original favored visual reference.
- `assets/screens/01-living-home.png`
- `assets/screens/02-breathing-calendar.png`
- `assets/screens/03-global-command-preview.png`
- `assets/screens/04-automatic-tide-recovery.png`
- `assets/screens/05-what-if-preview.png`
- `assets/screens/06-inbox-to-plan-morph.png`
- `assets/screens/07-plan-detail.png`
- `assets/screens/08-people-commitments.png`
- `assets/screens/09-now-engine.png`

The images are product-direction references, not permission to hardcode screenshots or build static mock pages.

## Non-negotiable engineering boundaries

- React + strict TypeScript.
- Existing Vite/Tailwind/Motion stack unless repository evidence requires otherwise.
- Tailwind class tokens centralized in TypeScript. No CSS modules, styled-components, or scattered raw colors.
- DOM + SVG + Motion for all product motion.
- **No Three.js, no WebGL scene, no shader dependency, and no canvas-only interface.**
- No runtime image generation.
- No backend, authentication, provider sync, or paid LLM dependency in this release.
- Voice, typing, direct manipulation, quick actions, and automatic Tide behavior use the same typed action pipeline.
- Every state-changing action is atomic, persisted, reversible, and testable.
- The environment remains fully usable when motion is reduced or voice is unavailable.
- Do not trade reliability for spectacle. Every elaborate visual has a deterministic fallback.

## Install into the Flow project

```bash
cd ~/Downloads/flow-voice-calendar
unzip -o ~/Downloads/flow-living-environment-elite-handoff.zip -d .
```

This creates `FLOW_LIVING_ENVIRONMENT_HANDOFF/` and does not overwrite production files.

Then open the Flow repository in a fresh Codex task and paste `PASTE_THIS_IN_CODEX.txt`.
