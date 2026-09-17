# Flow Locked Voice Home checkpoint

Saved safely at `2026-09-06T23:31:57+02:00` after the user requested an immediate stop.

## Stop state

- The active `flow_principal` implementation turn was interrupted.
- The task-owned Docker container `flow-locked-home-final` was identified and stopped gracefully. It had been running only:
  `npx playwright test e2e/locked-voice-home.spec.ts --project=chromium --workers=1`.
- The container used `--rm`; it is no longer present.
- No Flow process is listening on port `4174`.
- No task-owned Flow/Playwright release container remains running.
- No files were reverted, discarded, reset, or cleaned.
- This workspace has no `.git` metadata, so there is no branch or commit checkpoint.

## Mission source

Handoff: `~/Downloads/FLOW_LOCKED_VOICE_HOME_HANDOFF_2026-09-06/`

The required documents were read in the exact order from `00_START_HERE.md`, and all supplied storyboard/Home/screen references were inspected before implementation.

The repository-required workflow was followed:

1. `flow_mapper` and `flow_language_auditor` completed read-only reports in parallel.
2. Both reports were given to `flow_principal`.
3. The first principal candidate was independently tested by `flow_qa`.
4. `flow_qa` returned `FAIL` with five exact visual/interaction blockers.
5. Those five failures were routed back to `flow_principal`.
6. The principal implemented the second pass and was in browser validation when interrupted.

## Implemented before the independent QA failure

- No-click wake-armed → wake reward → preparing → active Home.
- Bare and wake-prefixed `Flow` handling.
- One application-shell recognition owner.
- Typed and final transcripts share the canonical interpreter/controller/transaction path.
- Ephemeral voice-world presentation state outside `LifeDocument` and history.
- Canonical semantic intent projection with phase/domain/target/action/confidence.
- Four real Home previews: Calendar, Journal, Atmosphere, Memories.
- Shared Home-card continuity, continuous mascot identity, interruption, and reduced-motion states.
- Atomic `Open my journal and leave Sunday evening playing` behavior.
- Correct `the last one` reference handling and spatial `Go back` precedence.
- Honest empty states; no fabricated personal content.

## Independent QA result on the first candidate

Green evidence:

- `npm run check`: PASS.
- 42/42 test files and 1,113/1,113 tests passed.
- Production build: PASS, 671 modules.
- Fresh Docker locked-Home Chromium: 2/2 passed.
- Broader Calendar/Studio/voice Chromium: 13/13 passed.
- Browser console/page/first-party request errors: 0.

Independent `flow_qa` nevertheless returned `FAIL` for five product-quality gaps:

1. Voice energy was stationary and did not travel to resolved target geometry.
2. Mascot gaze → body → world staging was absent.
3. Calendar preview events lacked shared identities with destination `EventBlock`s.
4. Wake mascot choreography lacked the locked sprout/leaf, squash, lift, arm, face, follow-through, leaves, and ripple beats.
5. Final target acknowledgement was not proven to paint before same-task navigation/mutation.

Fresh first-candidate screenshots are preserved under `artifacts/locked-voice-home/`, but are superseded by the in-progress second pass and must not be treated as final release evidence.

## Second-pass implementation present at interruption

The principal reported these five fixes implemented in source:

- Canonical target direction added to `voiceWorld`.
- A bounded, interruptible rAF target-paint handshake before controller execution, targeting 70–140 ms while preserving exact-once command serialization and one history entry.
- Diagnostics for acknowledgement, painted frame, execution, navigation, and commit ordering.
- A global measured semantic pulse from the command dock to resolved card/entity geometry, with a reduced-motion ring alternative.
- Semantic mascot gaze → body → world staging.
- Mascot rewritten as a sprout/leaf SVG with sleeping → happy wake, 22 px lift, arm and sprout follow-through, three restrained leaves, and a ripple.
- Stable `calendar-event-${id}` identities connecting Home preview rows to Calendar `EventBlock`s, with separate transform ownership and reverse continuity.
- The targeted event can be injected into the Home preview so `the last one` remains visibly addressable.
- Atmosphere preview reflects the actual layer response.
- `e2e/locked-voice-home.spec.ts` expanded from two to six scenarios covering the missing acceptance paths.

Latest reported focused validation for this second pass, before interruption:

- Focused Vitest: 13/13 PASS.
- ESLint: PASS.
- Production build: PASS, 671 modules.
- Full `npm run check`: **NOT YET RUN on this exact second-pass source**.
- The six-scenario Docker Chromium run was interrupted and stopped before a result was collected.
- Physical microphone: NOT PERFORMED.
- Audible autoplay acceptance: NOT PERFORMED.

`artifacts/locked-voice-home/verification.json` still describes the earlier 1,113-test candidate. It is stale for the second pass until the final local and browser gates regenerate it.

## Known touched files

### New voice-home feature

- `src/features/voice-home/wakeEnvelope.ts`
- `src/features/voice-home/wakeEnvelope.test.ts`
- `src/features/voice-home/voiceWorld.ts`
- `src/features/voice-home/voiceWorld.test.ts`
- `src/features/voice-home/useVoiceWorld.ts`
- `src/features/voice-home/VoiceEnergy.tsx`
- `src/features/voice-home/HomeDomainCard.tsx`
- `src/features/voice-home/HomePreviews.tsx`

### Production integration

- `src/features/home/HomeSpace.tsx`
- `src/core/mascot/mascot-model.ts`
- `src/core/mascot/MascotRenderer.tsx`
- `src/core/mascot/StaticMotionMascotRenderer.tsx`
- `src/features/day-planner/EventBlock.tsx`
- `src/features/day-planner/interpretation/references.ts`
- `src/app/FlowEnvironmentApp.tsx`
- `src/app/FlowEnvironmentProvider.tsx`
- `src/app/lifeCommandController.ts`
- `src/shared/command/GlobalCommandDock.tsx`
- `src/shared/command/globalInterpreter.ts`
- `src/shared/command/globalMatchers.ts`
- `src/features/studio/interpretation/studioInterpreter.ts`
- `src/features/studio/studioCommandPlan.ts`

### Tests and evidence

- `src/app/FlowLockedVoiceHome.test.tsx`
- `src/app/FlowEliteApp.test.tsx`
- `src/features/studio/studioCommandPlan.test.ts`
- `e2e/locked-voice-home.spec.ts`
- `artifacts/locked-voice-home/verification.json`
- `docs/quality/design-qa.md`
- `docs/quality/VERIFICATION.md`

## Selected exact file hashes at stop

```text
e373a97595561bb63c243e14580b59cd32a83dd96dec2e14b24cfbf9af0c4b61  src/features/voice-home/wakeEnvelope.ts
101d9d983d4bac8413fbbac9aa8fe076aa19613bc550bba9f2c92bf1c60f3c4c  src/features/voice-home/wakeEnvelope.test.ts
54a6124b3d568d6ceccae5b4ecc037ee303be5a70dcafc6c39a06de23e20a124  src/features/voice-home/voiceWorld.ts
7e35ec0bedd71e9fab595ca86555c64155aa0b91e34b27d1f09a66d38d342417  src/features/voice-home/voiceWorld.test.ts
f15ea26253468840e1a95963ffd57f4a0e6e32f8809c64d63b9a4284fc647dce  src/features/voice-home/useVoiceWorld.ts
f07481c1ba4a7dc40766de29ffaa04e5ad99bfff8e5b7ca22f4258a4517b40b1  src/features/voice-home/VoiceEnergy.tsx
4e86686121c379014896067266890b5ceb4d08ba1b3f92adb6687794d26c953b  src/features/voice-home/HomeDomainCard.tsx
b781c332d1def0a8e3e086afac1a6ce9483cf52c02efd452f0c37e89f7fc256e  src/features/voice-home/HomePreviews.tsx
43306d4cba79ea88560b92c4a0c6b4e81c49fa0a14b7fa09ffbd99f9ab8b2941  src/features/home/HomeSpace.tsx
6ca4398be82b3f7f5f6400e3b6a2fb3f549734e74dd10d176f3996503b5acd5b  src/core/mascot/mascot-model.ts
895c14e0583ad7a723a3f65380bf2bfcaeba384894f9a21a77346e7ac4f12525  src/core/mascot/MascotRenderer.tsx
d6d80762f9a73a954cba679dc973087b1c8c8f337509ebdfaf7f975dab20c268  src/core/mascot/StaticMotionMascotRenderer.tsx
557255f22d97983bd5b9bceb9dbb0e3c52a5f3593842c81637148f968dbcb12d  src/features/day-planner/EventBlock.tsx
9dbcad232bdce2e21b88342875a645b521d16262dabed377b0bdb7abbb4cb446  src/app/FlowEnvironmentApp.tsx
795e1b38c70a757bc44b04b8958e2e8d68eefa650e3d83ff53dbd07edeb58429  src/app/FlowEnvironmentProvider.tsx
fe2f7b75c9f50b8704648a9b19b9240952b642eafc7129c7a2e4c8e888e41dd7  src/app/lifeCommandController.ts
1c0435d16d520e3a58d4fc98a629d357e88b15c059cfd0aec378b1dadcfe0b6f  src/app/FlowLockedVoiceHome.test.tsx
be58fbd8502ac69b825a9ede03f4337e032ace51779d3459b9dd4f53fe507245  e2e/locked-voice-home.spec.ts
14b91f27743bb315f4ff05b6ba1371e260de0f79a8249139583dce3de0bbbc41  docs/quality/VERIFICATION.md
e1680839e3418f8348ee1771bd5dfad51bb97f04e2afb8d87830f1f6a2d1c97f  docs/quality/design-qa.md
```

## Exact resume sequence

1. Read this checkpoint; do not rerun the handoff discovery.
2. Verify the selected hashes above before editing. If a hash differs, inspect the change rather than resetting it.
3. Resume the existing `flow_principal` with the five routed QA failures and this checkpoint. Have it inspect its interrupted edits before continuing.
4. Run focused second-pass tests, then exact `npm run check` on the frozen current candidate.
5. Run the six-scenario Docker `e2e/locked-voice-home.spec.ts` gate. Generate new screenshots and browser error arrays; do not reuse the first-candidate screenshots as final evidence.
6. Inspect the running app against the locked storyboard/Home references and update `docs/quality/design-qa.md` plus `artifacts/locked-voice-home/verification.json` truthfully.
7. Spawn a fresh independent `flow_qa` only after principal validation completes.
8. Route any exact QA failures back to `flow_principal` and repeat until `PASS` or a genuinely external blocker remains.
9. Report physical microphone and audible autoplay separately from injected recognition.

## Safety notes

- Do not reinstall or replace the existing architecture.
- Do not create a second interpreter, mutation path, state store, or undo stack.
- Do not reset files from the no-git workspace.
- Do not stop or alter unrelated Docker containers.
- Do not claim a browser, visual, microphone, or release PASS from the stale first-candidate artifacts.
