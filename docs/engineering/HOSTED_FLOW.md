# Hosted Flow operations

This is a preparation runbook. It does not authorize spending, registry publication, infrastructure creation, or promotion. The initial service is an invitation beta; browser documents stay in storage belonging to that browser and origin.

## Runtime and deployment contract

One Node 22 web service per environment serves the Vite application, `/api/*`, and WebSocket `/api/voice` from one HTTPS origin. Staging and production share one private persistent Key Value ledger. Authentication keys are separated by `FLOW_ENVIRONMENT`; costs, identity limits, and voice leases share `FLOW_BUDGET_NAMESPACE`. Do not create a namespace for each test or environment in real-provider operation.

`Dockerfile.hosted` pins the verified linux/amd64 Node 22.23.3 base manifest. It installs locked build dependencies, generates the hosted model contract, and copies explicit runtime paths into a non-root final image. The final image contains no application tests, desktop server, registry build bundle, source tree, or development dependencies. Some production npm packages may contain their own upstream test/documentation files; they are not application fixtures.

The image defaults to `FLOW_INFERENCE_ENABLED=false`. Missing secrets, an unavailable store, or invalid inference configuration must leave application routes and deterministic typed features available. `/api/health` reports application and inference readiness separately. Its release ID comes from the image; do not override `FLOW_RELEASE_ID` in Render configuration.

## Prepare the exact candidate

Stop source writers and integrate the reviewed packaging files before freezing. Do not reset, stash, or switch this dirty checkout. Append `!.env.hosted.example` after the existing `.env.*` ignore rule. Review the final changes and untracked files, including preexisting changes that enter this release.

```sh
node scripts/build-hosted-image.mjs inventory > artifacts/hosted-release/reviewed-inventory.json
```

Review every listed file and hash before the next command. The inventory is an allowlisted source snapshot, not a substitute for secret scanning or code review. It excludes real `.env` files, credentials by known filename, generated contracts, model caches, build output, and test artifacts. It retains reviewed desktop source and tests for provenance and whole-repository QA; those paths never enter the hosted runtime. Inspect included source for embedded credentials and private data. If the inventory contains unrelated work, stop and narrow the source policy through review before freezing.

```sh
node scripts/build-hosted-image.mjs prepare --candidate flow-beta-YYYYMMDD-N --reviewed artifacts/hosted-release/reviewed-inventory.json
node scripts/build-hosted-image.mjs verify --candidate flow-beta-YYYYMMDD-N
node scripts/build-hosted-image.mjs build --candidate flow-beta-YYYYMMDD-N
```

`prepare` refuses a changed inventory, existing candidate directory, symlinks, and changed source during copying. Candidate source lives at `artifacts/hosted-release/candidates/<id>/context`. `build` verifies this context, builds only linux/amd64, and loads the local image. It never pushes. The generated contract is rebuilt inside the container rather than copied from developer output.

`manifest.json` records source hashes and base image. `build-receipt.json` records lockfile/Dockerfile hashes, source-manifest hash, image ID, platform, and generated contract/prompt hashes read from the actual final image. `built-unqualified` means the build completed, not that release gates passed. A `building` receipt after interruption or a `failed` receipt cannot qualify; use a fresh candidate ID for another attempt. Never reuse another candidate's evidence after source or configuration changes.

Run source qualification in a separate copy, because installing dependencies and generating test/build outputs must not mutate the immutable build context:

```sh
node scripts/build-hosted-image.mjs qualification-copy --candidate flow-beta-YYYYMMDD-N
```

The command exclusively creates the candidate's `qualification` directory from verified source. Install locked dependencies there and run U7 checks with `FLOW_RELEASE_SOURCE_MANIFEST` pointing to the absolute sibling `manifest.json` once U7's manifest mode is integrated and verified. Both gate and image receipts must use `sourceManifestSha256`. The gate must recheck all reviewed source files and reject unknown source additions while allowing only its documented generated/dependency output paths. The immutable `context` verifier permits no extra files, including dependencies. Do not run `npm ci`, tests, or build output generation directly in that context.

## Qualify locally under Node 22

Local Node 26 test passes do not establish Node 22 compatibility. Keep full U7 results, then verify the actual application image. These commands do not call providers when the container has no provider configuration.

```sh
docker run --rm --platform linux/amd64 --network none --read-only --user node --cap-drop ALL --security-opt no-new-privileges flow-hosted:<id> node --version
docker run --detach --name flow-hosted-qualify --platform linux/amd64 --read-only --user node --cap-drop ALL --security-opt no-new-privileges --publish 127.0.0.1:4300:3000 flow-hosted:<id>
curl --fail --silent --show-error http://127.0.0.1:4300/api/health
curl --fail --silent --show-error http://127.0.0.1:4300/journal
docker stop --time 30 flow-hosted-qualify
```

Use an unoccupied container name/port; do not stop another task's container. Record exact image ID and health JSON. Require the expected release ID, `applicationReady:true`, and disabled inference. Check nested person routes, JS/CSS/worklet MIME types, nonexistent assets/API failures, and absence of source-map/source/secret exposure. Run real browser deterministic typed create/save/reload/undo against this image. Inspect runtime paths and `npm ls --omit=dev`; verify absence of application test probes and development executables. Verify SIGTERM exits within the grace period, including an active authenticated WebSocket under deterministic test doubles. No provider credentials belong in these checks.

## Launch inputs and proposed costs

Before publication/provisioning, record approval for:

- Render workspace and region. Accessible workspace `tea-dakmcrek1f9s73dqjfb0` has not been selected or confirmed. `frankfurt` in the template is a proposal.
- Private GHCR owner/package, publishing access, and a separate Render pull-only registry credential. Existing GitHub `repo`/`workflow` access does not establish `write:packages` authorization.
- Actual hosting quote. Two `0.5c-512mb` web services at $7/month and one `256mb` store at $10/month give a proposed $24/month base, before other charges.
- Proposed $10/day parent provider budget, environment sublimits, and bounded live-test allocation. Hosting is separate.
- Provider credentials/settings and disclosure: audio goes to Deepgram, relevant command/context to OpenAI, output speech is AI generated. Hosting in Frankfurt does not imply EU-only provider processing.
- Final public origin, beta operator, invitation count, and promotion approval for the identified image and config revision.

Current proposal: 20 invited identities, five concurrent voice sessions globally, one per identity, five minutes per session, 15 reserved audio minutes per identity/day, and 100 shared requests per identity/day. The request count includes reasoning, verification, and TTS. Canceled or uncertain reservations remain charged. No anonymous inference or automatic voice replay.

## Provider and configuration record

Record these versions with the image/config receipt:

- Reasoning: `gpt-4.1-mini-2025-04-14`, strict server-owned contract, `store:false`.
- STT: Nova-3 general, provider version pinned by `deepgram-stt.mjs`, 24 kHz mono PCM16LE, `mip_opt_out=true`. Verify the exact request parameter and actual account opt-out price during the approved canary.
- TTS: `tts-1`, `alloy`, speed 1, PCM, at most 600 UTF-8 input bytes. The 10,000 microUSD proposal conservatively covers the 9,000 microUSD input-character upper bound. This model has an announced January 6, 2027 shutdown; schedule replacement qualification before then.

The settled U5 model configuration is 64,000 conservative input tokens and 2,048 output tokens, reserving 30,000 microUSD per call (above the 28,877 microUSD minimum). The server counts rendered prompt/schema bytes plus framing; verify representative inputs fit. STT is disabled until the operator confirms the account rate; its configured rate must be at least 7,700 microUSD/minute, with at least six rate-minutes reserved per five-minute session (46,200 at that floor). Raise reservations when verified prices require it. Do not lower server floors or substitute average TTS output cost.

Use `.env.hosted.example` as a variable inventory, not a file to upload with secrets. Set real credentials through protected Render settings. Give staging and production separate provider keys where supported while retaining the one parent ledger. Record configuration revision and non-secret bounds separately from the image. Do not log invites, cookies, CSRF tokens, Redis URLs, prompts, audio, or provider keys.

## Publish and stage after approval

1. Confirm the approved GHCR package is private and the operator has publishing access. Authenticate using a protected credential mechanism; never place tokens in command arguments or shared logs.
2. Tag the already-qualified image ID and push it. Do not rebuild:

   ```sh
   docker tag <qualified-image-id> ghcr.io/<approved-owner>/<approved-package>:<candidate-id>
   docker push ghcr.io/<approved-owner>/<approved-package>:<candidate-id>
   docker buildx imagetools inspect ghcr.io/<approved-owner>/<approved-package>:<candidate-id>
   ```

3. Record the registry digest and verify it resolves to the qualified linux/amd64 image. Use `ghcr.io/...@sha256:...` for both environments. Retain this digest and later rollback digests in the private registry.
4. Replace every template placeholder and confirm region/resource names. Validate the concrete Blueprint using `render blueprints validate render.yaml` with the current CLI; validation is not permission to apply. An image service does not use `autoDeployTrigger`; promotion is an explicit digest/configuration action. A Blueprint must be available on the approved repository branch before Render can read it; Dashboard/API image creation is another supported path. Do not assume `main`, merge, push, or apply automatically.
5. Confirm Key Value journal/snapshot persistence, `noeviction`, empty external allowlist, and enabled internal authentication. Set both services' `FLOW_REDIS_URL` to this store's authenticated internal URL; no public Redis URL. Keep inference disabled initially.
6. Verify the static app and release identity on the protected staging origin, then configure the approved ledger and issue only the operator invite. Turn inference on only after approved bounds/secrets/provider controls exist.

## Ledger authorization and invitations

Run operator commands from a protected environment with access to the private store. Never attach initialization to startup, deployment hooks, or health probes.

For the first, explicitly approved spending authorization only, set the approved operator variables listed in `.env.hosted.example`, including the staging sublimit, and execute:

```sh
FLOW_AUTHORIZE_NEW_LEDGER=yes node server/hosted-gateway/operator.mjs initialize
```

Set `FLOW_ENVIRONMENT=production` with its approved sublimit and run `node server/hosted-gateway/operator.mjs environment`. Both use the same parent namespace and store. The parent atomic cap bounds aggregate spending even if environments overlap. Keep the operational sublimit allocation within the approved parent budget.

`node server/hosted-gateway/operator.mjs invite <identity>` prints a one-time secret. Do not capture its output in release artifacts; deliver it privately through an approved channel. Reissuing an identity's invite revokes its prior session generation. Issuance count is an operator-managed beta limit, not an invented automatic 20-user enforcement claim.

`node server/hosted-gateway/operator.mjs disable` disables paid work in the shared ledger. This control is intentionally one-way in the present operator interface. There is no supported enable/reconcile command. Treat using it as an incident requiring the recovery process below.

## Staging, promotion, and observation

After approval, run the live microphone → STT → reviewed proposal → explicit confirmation → durable local change → TTS journey. Verify cancel, quota exhaustion, failed save/retry, session expiry, store failure, identity isolation, and stale work after deployment. Real microphone/provider evidence is separate from deterministic HTTPS browser doubles.

G1–G8 must pass for the exact digest and configuration before operator-only production promotion. Deploy the same digest, repeat application/identity/storage checks, and rehearse the first-release fallback below before issuing tester invites. Observe initial sessions and provider/ledger usage before increasing access. Do not print user payloads in operational logs.

## First release fallback and later rollback

The old Pages application belongs to another browser storage origin. Keep its link available for old data; it is not a rollback target for newly created hosted documents.

For the first hosted release, retain the same image and origin and set `FLOW_INFERENCE_ENABLED=false`. Redeploy that configuration, verify all old voice connections close, and verify typed creation, persistence, reload, and undo still work. Browser data remains at the hosted origin. This configuration fallback does not reset or relatch the spending ledger. If immediate cross-environment paid-work termination is required, use the irreversible operator `disable` control and follow incident recovery.

For later releases, retain the last verified compatible image digest and non-secret config revision. Verify browser storage compatibility before deploying an older image. Roll back the digest/config pair on the same origin, check `/api/health` for its exact release ID, and repeat persistence and cancellation smoke tests. Never delete local storage, clear counters, or reset the Redis namespace to make a rollback pass.

## Redis restart or uncertain ledger incident

The store journal can lose roughly one second of acknowledged writes. The gateway latches Redis process identity and refuses paid work after it changes, even if some counters survive. Supported recovery today is typed-only service.

1. Disable inference configuration in both environments and stop active provider work. Keep the same namespace and preserve the store.
2. Preserve restricted ledger/provider usage evidence; reconcile uncertain reservations conservatively. Do not refund canceled or missing work on assumption.
3. Treat restored invite/session authority as potentially stale. Any future recovery implementation must revoke it across environments.
4. Leave paid inference disabled. There is no tested recovery relatch command. Do not call `initialize` under a new namespace, delete counters, edit `redisRunId`, or recreate the store to bypass the guard.
5. A future reconciliation/reauthorization feature requires explicit approval, atomic generation checks, conservative charges, auth revocation, and tests before use. This runbook does not authorize that feature or a manual equivalent.

## Primary references

- [Render Blueprint fields](https://render.com/docs/blueprint-spec), [private images](https://render.com/docs/deploying-an-image), [Key Value persistence](https://render.com/docs/key-value), [pricing](https://render.com/pricing).
- [OpenAI deprecations](https://developers.openai.com/api/docs/deprecations), [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini), [TTS-1](https://developers.openai.com/api/docs/models/tts-1).
- [Deepgram data handling](https://developers.deepgram.com/trust-security/your-data).
