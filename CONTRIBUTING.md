# Contributing

Flow develops on `test`, with independently verified release changes promoted to `main`. No other development branches are allowed; `gh-pages` is retired and must not be recreated. Read [`AGENTS.md`](AGENTS.md) and [`docs/README.md`](docs/README.md).

## Change ownership

- Place deterministic business and state rules in `src/domain/`, `src/kernel/`, or the relevant feature model rather than component effects.
- Keep speech/browser acquisition, intent resolution and state mutations separate; voice must not be the only way to complete an action.
- Protect event cancellation, stale async results, reduced motion, keyboard focus and first-utterance acquisition in regression tests.
- Never commit real user transcripts, calendar exports, microphone recordings or API credentials.

## Verify

```bash
npm ci
npm run check
npm run test:e2e
```

For interaction or animation changes, also run the relevant `qa:release`, `qa:motion`, and browser viewport checks. A simulated test run does not certify microphone behavior on every device; state the environments tested.

Production is deployed only by [the Pages artifact workflow](.github/workflows/deploy-flow.yml) on `main`. Do not restore a push-based deployment branch or bypass required gates.
