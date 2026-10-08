# Security and privacy

Report vulnerabilities privately via [the maintainer contact page](https://miguelalmeida.xyz/#contact). Do not submit private calendar events, audio recordings, credentials or transcripts to public issues.

Flow's browser UI includes microphone-facing paths and locally operated calendar and journal surfaces. Microphone permissions, speech recognition provider behavior, browser storage and any external services must be evaluated separately; an attractive voice demo is not evidence of universal on-device processing or always-on listening.

- Request and use browser microphone permissions only for an explicitly initiated feature.
- Do not log or persist raw transcripts, sensitive notes or provider secrets without a documented requirement.
- Validate and constrain data flowing from speech/browser adapters into deterministic state changes.
- Consequential actions require explicit confirmation, with accessible visual/keyboard alternatives.
- Prevent cancellation races and stale requests from writing to newer application state.

Release changes follow [deterministic CI](https://github.com/miguelalmeida0/flow/blob/main/.github/workflows/deterministic-gates.yml) and the [`main`-only Pages workflow](.github/workflows/deploy-flow.yml). Do not expose tokens in `VITE_*` variables or static assets.
