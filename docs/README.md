# Flow engineering guide

## Code ownership

| Directory | Responsibility |
| --- | --- |
| [`src/app/`](../src/app/) | Application composition and shared environment wiring |
| [`src/domain/`](../src/domain/) | Application/domain types, invariants and deterministic rules |
| [`src/kernel/`](../src/kernel/) | Capability and orchestration contracts |
| [`src/features/day-planner/`](../src/features/day-planner/) | Planning actions, reconciliation and calendar behavior |
| [`src/features/voice-intelligence/`](../src/features/voice-intelligence/) | Voice intent, transcription and interpretation paths |
| [`src/features/voice-home/`](../src/features/voice-home/) | Voice-home presentation and interaction state |
| [`src/features/friends/`](../src/features/friends/) | People and relationship UI |
| [`src/features/studio/`](../src/features/studio/) | Studio interactions |
| [`src/shared/`](../src/shared/) | Shared UI and isolated utilities |
| [`e2e/`](../e2e/) | Browser journeys, viewport, speech and interaction regressions |
| [`scripts/`](../scripts/) | Release and local quality tooling |

A domain operation must not depend on browser animation state. Voice interpretation proposes intents; deterministic application state owns mutations. Preserve explicit confirmation for consequential actions and keyboard alternatives to speech.

## Build and ship

- [Local commands](../README.md#run-locally): `npm ci`, `npm run dev`, `npm run check`
- [Engineering standards](../CONTRIBUTING.md)
- [Security and microphone permission boundaries](../SECURITY.md)
- [Pages artifact deployment](../.github/workflows/deploy-flow.yml): publish from `main` only; `test` can build without publishing
- [Deterministic CI gates](../.github/workflows/deterministic-gates.yml)

## Historic design evidence

- [Readme reference captures](readme/current/) depict specific reviewed states.
- [Diagrams](diagrams/README.md) document system models.
- [Internal handoffs](internal/handoffs/) are historical design/implementation context, not current release authority.

Do not bulk-rename feature folders or historical assets solely to make trees look symmetrical. Move code only with dependency mapping and passing tests.
