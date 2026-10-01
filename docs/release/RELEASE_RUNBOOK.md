# Flow release runbook

## Current policy

Production remains the preserved `gh-pages` publication. A red gate always blocks promotion and deployment. `main`, `test` and `gh-pages` remain the long-lived branches. Keep `release/safe-production` until a deployed release passes live verification.

### Tier A — every PR and candidate push

`npm run qa:production -- --tier=a` performs `npm ci`, lint, the complete deterministic unit suite, desktop server tests, release-policy tests, Python deterministic tests, strict Pages build, design gate, production artifact browser smoke and npm production audit. Every executed gate has an exit code and log. CI uploads a deployable candidate only when this tier succeeds. It uses Node 22 and official actions pinned by commit.

Require the **Deterministic gates** status on main and test. Do not bypass it, including for administrators. A workflow file alone does not configure branch protection.

### Tier B — release Mac

`npm run qa:production` includes Tier A plus the existing `qa:release`, actual configured local Ollama corpus, and digital-audio voice autopilot. Offline model loading is required; use installed models only. Inspect per-case corpus results, STT reset/correlation evidence, reconnect and ownership results. A successful build or a successful test process with skipped hardware/model cases is insufficient.

`qa:release` still executes its original suites and assertions. When called by the canonical runner, it verifies the already built artifact against `FLOW_PREBUILT_ARTIFACT_HASH` instead of building a second copy. No release test is removed or disabled. Its standalone invocation continues to build.

`artifacts/production/release-manifest.json` includes exact Git SHA, dirty state, branch, runtime versions, lock hash, build timestamp, deterministic tree hash, and all gate statuses. A dirty tree can never be READY TO DEPLOY. Security approval must be a source-backed review tied to the exact commit/artifact, supplied via `FLOW_SECURITY_REVIEW_FILE`; a clean npm audit alone does not satisfy security review.

### Tier C — actual human microphone

Follow `PHYSICAL_MICROPHONE.md`. Supply a completed copy of the JSON template through `FLOW_PHYSICAL_MIC_FILE`. The required Mac/microphone/browser identity, human tester, time, exact commit and artifact hash, and all checklist results are validated. No automated agent or CI runner may fabricate this evidence. Digital/generated audio is distinct.

## Public demo and local boundary

The public origin is demo-only. It does not accept local pairing tokens or use browser SpeechRecognition fallback. Local paired voice remains Kyutai -> Flow coordinator/kernel -> Kokoro. Both companions bind to 127.0.0.1, preserve exact development origins, and require a token. Never expose ports 8765/8766, widen CORS to a wildcard, weaken browser security, or route inference to a hosted model.

Current Chrome 154.0.8037.59 was measured from the actual public origin. Both HTTP fetch and WebSocket access to loopback were blocked by Local Network Access checks with no permission granted. This is evidence for the default denied state, not proof that a granted/paired path works. No paired production-origin route is claimed.

## Build and navigation

Production mode deterministically uses `/flow/`; development/test mode keeps `/`. App routing and AudioWorklet URLs follow the build base. `dist/404.html` contains the same app entrypoint and `.nojekyll` is supplied. GitHub Pages returns HTTP 404 for direct nested SPA documents, then the application boots using `/flow/assets/`; this expected hosting status is recorded separately from unexpected asset failures. If a zero-404 deep-link requirement is imposed, it needs an approved routing/hosting change. Query parameters must survive normal direct loads.

## Artifact deployment

1. Push only the reviewed temporary release branch. Obtain a green **Flow release CI** push run for its exact SHA; retain candidate and evidence artifacts.
2. Perform Tier B and Tier C on that exact artifact. A local rebuild is not the CI artifact. Download the candidate and evidence with `gh run download <run-id> --repo miguelalmeida0/flow`, validate the artifact tree hash, and retain all release-machine evidence. The default runner builds locally. For a downloaded CI artifact, place it at dist and run `FLOW_CI_MANIFEST=/absolute/path/to/CI/release-manifest.json npm run qa:production -- --prebuilt`; this validates the matching clean CI SHA/lock/artifact and never rebuilds. The voice harness verifies the served production index bytes. Do not reuse a dev server on port 5173.
3. Review every gate result and evidence reference. Configure the `github-pages` environment to require a human deployment reviewer; allow only main, test and release/safe-production. Store no tokens in evidence inputs.
4. After the automation and all acceptance gates pass, the single Pages source cutover is **Settings -> Pages -> Build and deployment -> Source -> GitHub Actions**. Do not perform this while the release is blocked. The current source is `gh-pages:/`.
5. Dispatch **Flow guarded Pages release** with the exact SHA, successful candidate CI run ID and completed release manifest. Its validation verifies the run repository/workflow/event/branch/SHA, clean Tier A evidence, all release statuses, human microphone checklist and exact downloaded artifact hash. It uploads that same artifact with official Pages actions; deployment has only pages:write/id-token:write, with serialized non-canceling concurrency. No rebuild happens in the deployment workflow.
6. GitHub workflow_dispatch requires the workflow to be registered on the default branch. If this repository has not bootstrapped the workflow yet, this is a separate bootstrap blocker; do not merge a red candidate merely to make dispatch available. Resolve that bootstrap with an approved infrastructure-only installation after applicable gates, or another explicitly reviewed activation path.
7. Open https://miguelalmeida0.github.io/flow/ and run live boot/assets/navigation/reload/responsive/persistence/unavailable-runtime checks. Record actual errors and the deployed SHA. Until those pass, do not promote main or tag.
8. After live PASS, fast-forward/promote the exact release SHA to main without unrelated work, tag it, update documentation, and delete only the temporary release branch. If any serious defect occurs, rollback first.

## Rollback without rebuilding

Previous main: `87d95fd35535073010ab49a08094cdad616f0492`.
Previous publication: `e47028bab78231714df2853bfae935959b75bcc3`.
Preserved archive: `/tmp/flow-gh-pages-e47028b.tar` (SHA256 `d72cb05fc1726796355afa40f7515ce75e93b039a85a45bebcc83ebcd83392a9`).

Keep the remote gh-pages branch unchanged and retain its archive outside temporary storage before any release. For a failed Actions cutover, restore Pages source to **Deploy from a branch -> gh-pages -> / (root)**. Request a branch Pages rebuild using `gh api --method POST repos/miguelalmeida0/flow/pages/builds`, then verify live asset hashes and behavior against the retained archive. This republishes the old artifact; it does not rebuild old application source. If branch publication cannot be restored, upload the extracted preserved archive with the official Pages artifact action and deploy it using a reviewed rollback workflow; never run npm build to reconstruct it.

No rollback or source cutover was performed in this task. Do not delete the prior artifact/commit after replacement until the new release passes live smoke and the rollback retention period is agreed.
