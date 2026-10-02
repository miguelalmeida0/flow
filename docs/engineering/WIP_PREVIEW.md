# Private WIP preview

This environment is for remote development testing. It is not a production release.

## Runtime

Deploy this branch to a separate Render **Free web service**, with automatic deployments **off** and no custom domain. Do not apply the root `render.yaml`: it describes a different, paid staging/production architecture.

- Build: `npm ci --ignore-scripts --no-audit --no-fund && npm run build`
- Start: `node server/wip-preview/index.mjs`
- `NODE_VERSION=22.23.3`
- `NODE_ENV=production` (Node optimization only; the environment is WIP)
- `NPM_CONFIG_INCLUDE=dev` (install TypeScript, Vite and esbuild during the build even with `NODE_ENV=production`)
- `FLOW_ENVIRONMENT=wip-preview`
- `FLOW_INFERENCE_ENABLED=false`
- `FLOW_PREVIEW_AUTH_SHA256`: SHA-256 of a dedicated `username:password` pair, held only in the hosting environment. Use a cryptographically random password; never commit it or put it in a URL.
- Render supplies `PORT` and `RENDER_GIT_COMMIT`. Local qualification can set `FLOW_PREVIEW_COMMIT` to a complete Git SHA.

The server refuses to start without authentication configuration and a full commit SHA. All application routes and assets require HTTP Basic authentication over the hosting platform's HTTPS. Only `/healthz` returns public liveness text. The response header `X-Flow-Commit` and runtime release ID identify the exact source; the page title and environment header label it WIP. Responses disable caching and indexing. Server source, maps, secret files and provider endpoints are not served.

The preview server imports no provider or database code. It injects `mode: browser-native` and `inferenceEnabled: false`. Home opens directly; clicking the microphone starts the existing browser SpeechRecognition path and requests permission when needed. Voice transcripts use the same command pipeline as typed input. Stop/Pause listening releases recognition; click Start to resume. Permission failures offer a visible retry. Local and hosted voice behavior is unchanged. Do not configure OpenAI, Deepgram, Redis or local-companion credentials. Local development still uses its existing runtime.

## Functionality and limits

Pointer controls and supported deterministic typed commands use the current Flow application: Calendar, Journal, Friends/People, outcomes, captures, Atmosphere, memories, undo/redo and browser-local persistence. Local media features remain browser/device dependent. Weather uses the existing free Open-Meteo endpoint.

Browser Flow Live is available in compatible browsers. Chrome may use its own network speech service; this is not offline recognition and does not enable any Flow-paid inference/provider endpoint. Hosted AI interpretation, paid speech providers and desktop companion actions remain unavailable. Browser data is isolated to this preview URL and browser; there is no cloud backup or cross-device synchronization. Refreshing or redeploying does not migrate production-origin data.

The last complete application gates passed lint/build and 181 browser tests. Vitest had 5,860 passes and six enforced evidence failures: five admitted corpus minimums and three-mode evidence for 178 product actions. Those are not waived by this preview. Live provider/acoustic qualification remains incomplete.

## Costs and rollback

Use only the Free instance in the existing Hobby workspace. At preview creation the workspace had no payment card. Render suspends free services/builds at applicable included limits when no payment method is present; adding a payment method or upgrading changes this cost boundary. Free services sleep after inactivity and can take about a minute to wake. Limits are shared with other workspace services.

Stop this preview reversibly with **Suspend Service** in its Render dashboard. Resume it to restore access. To roll back code, use **Rollback** on a prior successful preview deploy, or manually deploy a chosen commit from this branch. Do not change DNS, use the production service, promote this deployment, or force-push the branch. Rotate preview credentials by replacing the digest in this service and redeploying.

Run `node --test server/wip-preview/index.test.mjs` to verify the authentication/static-serving boundary. After building, run `npx playwright test --config=playwright.wip.config.ts` to check the actual browser-native preview runtime, typed commands and microphone denial/unavailable states. For remote verification set `FLOW_WIP_URL`, `FLOW_WIP_EXPECTED_SHA`, and `FLOW_WIP_CREDENTIAL_FILE` (an ignored local JSON file with `username` and `password`). Trace recording is disabled to keep authentication out of trace archives. These checks supplement the application suites and do not certify production readiness.
