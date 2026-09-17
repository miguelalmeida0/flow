# 09 — Implementation Roadmap

The sequence prevents a beautiful shell from hiding broken data behavior.

## Phase 0 — Freeze and map the Calendar foundation

- run baseline gates;
- inspect current Tide branch;
- record storage schema and history behavior;
- identify the single authoritative Calendar state source;
- capture current desktop/mobile screenshots;
- do not begin visual expansion until Calendar remains green.

Gate:

```bash
npm run lint
npm run test:run
npm run build
```

## Phase 1 — Shared design and motion foundation

Implement:

- living-environment tokens;
- application shell;
- `MotionBoundary`;
- centralized presets;
- `SharedFlightLayer` portal;
- reduced-motion gate;
- route transition coordinator.

Do not add feature behavior yet.

Gate component tests and reduced-motion tests.

## Phase 2 — Unified domain model and migration

Add:

- captures;
- plans;
- plan steps;
- people;
- commitments;
- links;
- global transactions;
- versioned storage migration.

Integrate existing Calendar events without duplicating them.

Gate storage migration, atomic transaction, undo/redo, and selector tests.

## Phase 3 — Living Home and navigation

Build:

- four live containers;
- click/open navigation;
- voice navigation through the existing transcript pipeline;
- shared Home-to-detail layout transitions;
- global command dock.

No static screenshots or hardcoded counts.

Gate desktop/mobile navigation E2E.

## Phase 4 — Inbox

Build real capture behavior:

- create by type and voice;
- focus/reference latest item;
- edit;
- archive;
- delete confirmation;
- unresolved projection.

Gate persistence and ambiguity handling.

## Phase 5 — Inbox → Plan vertical slice

Implement domain transaction first.

Then implement the six-beat choreography.

Required command:

> “Turn that into a plan.”

Gate:

- atomic commit;
- exact undo/redo;
- source lineage;
- animation fallback;
- reduced motion;
- 20 repeated cycles without leaked clones/listeners.

## Phase 6 — Plans and Plan → Calendar

Build:

- plan list;
- plan detail;
- step editing/completion/reorder;
- schedule step through existing Calendar actions;
- linked scheduled state;
- shared transition into Calendar.

Gate Calendar invariants and data lineage.

## Phase 7 — People commitments

Build:

- create promise;
- waiting-on direction;
- due state;
- optional plan/calendar links;
- concise thread choreography.

Do not implement contact import or messaging.

## Phase 8 — Now engine

Implement deterministic scoring and at most three recommendations.

Gate time-window calculation, duration fit, protected time, and “keep free.”

## Phase 9 — Persistent Flow Live session

Integrate:

- one-click activation;
- controlled recognition restart;
- interim preview;
- voice navigation;
- explicit privacy state;
- tab-hidden suspension;
- typed parity.

Do not block the release if physical microphone behavior differs across unsupported browsers; report support honestly and retain typed fallback.

## Phase 10 — Motion polish and performance

Polish only after behavior passes:

- source/destination focus;
- Tide path;
- progressive materialization;
- plan scheduling flight;
- promise thread;
- Now entrance;
- exact cancellation;
- reduced-motion parity.

Profile actual frames and main-thread work.

## Phase 11 — Release evidence

Extend the durable release harness.

Generate required screenshots, traces, console capture, results JSON, and motion-performance results under:

```text
artifacts/living-environment-release/
```

Run physical microphone acceptance separately.

## Scope discipline

Do not begin Money, Home, provider sync, recurrence UI, shared accounts, messaging, or a native wake word in this release.
