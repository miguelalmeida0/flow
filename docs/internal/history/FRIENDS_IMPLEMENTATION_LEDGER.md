# Friends, voice notes, and Journal markers — September 12

Implementation handoff for independent QA. This is not release or physical microphone approval.

## Baseline

Pre-edit backup and results: `.recovery/friends-20260912T094444Z/`. Baseline lint/build passed. Full baseline: **4,083 passed / 463 failed**, 4,546 tests in 91 files. The raw failure-heading multiset is authoritative; deduplicated headings are not exact unique test identities. No Git repository, dependency, paid service, hosted model, account, OAuth or backend was added.

The September 12 browser attempt failed at native Chromium launch (SIGABRT/EPERM). It was not retried. Browser and physical microphone acceptance remain **NOT RUN**; root-owned `artifacts/friends-qa/PHYSICAL_ACCEPTANCE.md` describes the local procedure.

## Implemented P0–P10

| Stage | Implemented behavior | Main tests |
| --- | --- | --- |
| P0 | Existing wake/native-final, Calendar scope and transactional safety preserved; full source backup | voiceRecovery, wakeAcquisition, FlowContextualCalendar, contextualCalendarLanguage, contextualCalendarTransactions |
| P1 | Schema v6 migrates current/history/transaction documents; canonical Person IDs and aliases; truthful contact creation; Friends replaces actual Home Atmosphere slot; person/group/note navigation | friends-foundation, life-storage, FlowFriends, FlowMemoryFriends |
| P2 | Literal drafts; canonical recipient clarification; exact revision confirmation; fact-preserving tone edits; repeated read-aloud; spoken questions/barge-in; overlap reask; local delivery receipt; failure/retry; immutable delivered history | FlowFriends, messaging, deliveryProjection, promptSpeech, FlowMemoryFriends |
| P3 | Canonical Calendar participants/selectors/avatars; person/pronoun followups; combined Calendar/message proposal; exact clock conflicts/refinements; explicit own availability sharing | calendarProposal, FlowFriends, FlowMemoryFriends, contextual Calendar suites |
| P4 | Existing StudioRuntime owns Journal and Voice Notes; pause/resume/Stop; verified finalization before send; one-Undo acquisition; stale finalizer revocation; real suffix removal from exported audio | FlowVoiceNotes, recordingTiming, audioClip, migrated legacy recorder controls |
| P5 | Shared manual markers; exact command/narrative separation; measured recording-relative ranges; kind/ordinal resolution and original-audio seek | voiceMarkers, recordingTiming, FlowMarkerJourneys |
| P6 | Small lazy post-Stop literal extractor; suggested/kept/dismissed states; negation/quotation safeguards; no automatic actions | voiceMarkers, FlowVoiceNotes |
| P7 | Journal shares recorder/marker projection/controls/timing; neutral timeline replaces fabricated waveform; legacy bookmark IDs and Memory links retained | voiceMarkers, FlowMarkerJourneys, FlowVoiceNotes, migrated legacy controls |
| P8 | Explicit marker-to-Calendar/commitment with accumulated slots and source-date/author provenance; marker reply; private text or genuinely bounded WAV sharing with sanitized shared IDs | markerConversions, audioClip, FlowMarkerJourneys, FlowMemoryFriends |
| P9 | Private groups/canonical members; spoken member/date/time continuations; proposal options; explicitly recorded actual replies; final Calendar/message proposal; archived delivery history | FlowGroups, FlowFriends, deliveryProjection |
| P10 | Private Memory links to people/groups/events/moments; explicit composition-only sharing; reactions and text/voice replies; linked Memories/commitments; actual-source relationship queries | FlowMemoryFriends, relationshipQueries, FlowMarkerJourneys |

Friends overview has Recent, Plans, Voice notes and Groups. Recent uses delivery timestamps, not storage key order. Person surfaces expose Message, Voice note, Make a plan, availability sharing, plans, Memories and commitments. Shared content and private originals have separate identities.

## Required A–R journeys

These tests use production interpretation/controller/persistence. Mounted voice cases inject final transcripts through the adapter seam; they do not establish physical recognition reliability. Test names below live under `src/app/` unless another directory is shown.

| Journey | Concrete coverage | Test files |
| --- | --- | --- |
| A — Text Sarah | Body survives global corrections, polite processing, quoted colons, body commas and embedded destructive words | FlowFriends.test.tsx |
| B — Person disambiguation | Names/aliases/plausible first-name collisions produce canonical choices; spoken full name resolves one ID | FlowFriends.test.tsx; features/friends/friends-foundation.test.ts |
| C — Voice confirmation | Refine/read/re-read, post-prompt choices, barge-in, overlapped authorizer reask, latest revision delivered once | FlowFriends.test.tsx; features/voice/promptSpeech.test.ts |
| D — Calendar + John | One Calendar/history commit; Open John → meeting query → move → Tell him retains IDs | FlowFriends.test.tsx |
| E — Conflict + alternative | Occupied exact Thursday stays protected; spoken Friday refines pending proposal without clock substitution | FlowFriends.test.tsx; features/friends/calendarProposal.test.ts |
| F — Voice note | Typed/final-voice acquisition, narrative capture, pause/finalization, saved-asset guard, verified send and saving failure | FlowVoiceNotes.test.tsx |
| G — Manual marker | Mark and kind/ordinal selection use measured recording-relative ranges | FlowMarkerJourneys.test.tsx; features/studio/voiceMarkers.test.ts, recordingTiming.test.ts |
| H — Suggested marker | Limited literal post-Stop suggestions; negated/quoted promises rejected; question punctuation optional | FlowVoiceNotes.test.tsx; features/studio/voiceMarkers.test.ts |
| I — Marker playback | Seek retained original audio to selected moment; legacy projection retains identity | FlowMarkerJourneys.test.tsx; features/studio/voiceMarkers.test.ts |
| J — Marker reply | Shared clip gets safe new marker IDs; reply draft and receipt retain exact shared marker ID; explicit send | FlowMarkerJourneys.test.tsx |
| K — Marker → Calendar | Day/time slots accumulate, concrete clock choices, Actually 7:30/7pm preview corrections, confirmation | FlowMarkerJourneys.test.tsx; features/studio/markerConversions.test.ts |
| L — Marker → Commitment | Source author/direction preserved; missing incoming author asks; source-relative tomorrow uses source date | features/studio/markerConversions.test.ts |
| M — Journal markers | Private Journal selection, common moments, old bookmarks/Memory links survive reload | FlowMarkerJourneys.test.tsx; features/studio/voiceMarkers.test.ts |
| N — Journal → friend | Only chosen text or approved PCM range shared; new bounded WAV, safe rebased markers, original private, decode failure sends nothing | FlowMarkerJourneys.test.tsx; features/studio/audioClip.test.ts |
| O — Group plan | Ambiguous member → spoken name → day → afternoon → reviewed invitation → actual recorded reply → Calendar confirmation | FlowGroups.test.tsx |
| P — Failed send | Calendar remains committed; exact message retries without duplicate Calendar/history; media save failure stays unsent | FlowFriends.test.tsx, FlowVoiceNotes.test.tsx; features/friends/messaging.test.ts |
| Q — Undo | One Undo revokes recorder; receipt survives snapshots; restored draft cannot replace delivered payload; archived recipient and retained assets remain | FlowVoiceNotes.test.tsx, FlowFriends.test.tsx; features/friends/deliveryProjection.test.ts, messaging.test.ts |
| R — Controls vs prose | Exact controls stay out of text; narrative “he told me to stop and go home” stays; typed words never reuse acoustic timing | FlowVoiceNotes.test.tsx; features/studio/recordingTiming.test.ts; migrated typed legacy cases in FlowStudioApp.test.tsx |

## Diagnostics

The existing Voice Inspector and capped trace history expose canonical social context, pending prompt/revision authority, proposed versus committed actions, transaction ID, delivery status/receipt, recording lifecycle, segment classification and timed actions. Async outcomes patch their originating command ID; a late receipt cannot annotate or replace a newer command. Tested by `features/friends/relationshipQueries.test.ts` and the delayed-delivery case in `FlowMemoryFriends.test.tsx`.

## Validation before independent QA

- Combined focused/preservation command below: **237 passed / 8 failed**, 22 files, 197.34 seconds (`node_modules/.tmp/friends-focused-final.log`). Six FlowCalendarPreservation native-voice failures are also in the untouched baseline (legacy manual Start Flow Live expectation). Two new failures were a test assuming receipt array order and a stale schema-v5 migration output expectation; both corrected without weakening product assertions.
- Post-correction mounted/migration: **46/46 passed**, 5 files, 29.85 seconds (`friends-final-confirmation.log`): Friends 20, Voice Notes 6, Marker Journeys 5, Groups 2, life-storage 13.
- Earlier critical run: **32/32 passed** (`friends-final-critical.log`). The final mounted run adds failed-send coverage.
- Latest Recent projection regression: **3/3 passed**, 2.56 seconds (`friends-recent-final.log`). Final strict TypeScript: **exit 0**, no diagnostics (`friends-types-final.log`).
- Post-freeze authorized migration-test correction: genuine v3/v4 serialized inputs now assert their legacy version; **13/13 passed**, 4.26 seconds (`friends-migration-final.log`). Production and tests were then refrozen.
- Ten previously passing typed legacy recorder cases passed after explicit v6 fixture migration (`friends-p4-legacy.log`). Baseline failures were not rewritten.
- Playwright: **2 collected, not executed**, 430/1440 pixels (`friends-e2e-collection.log`). The authored spec uses the actual keyboard command field, production parser/scheduler, reload, reduced motion, overflow and console-error assertions. Screenshots await a local browser run.

```bash
TMPDIR=$PWD/node_modules/.tmp npx vitest run --maxWorkers=1 src/features/friends src/features/studio/audioClip.test.ts src/features/studio/voiceMarkers.test.ts src/features/studio/recordingTiming.test.ts src/features/studio/markerConversions.test.ts src/features/voice/promptSpeech.test.ts src/app/FlowFriends.test.tsx src/app/FlowGroups.test.tsx src/app/FlowVoiceNotes.test.tsx src/app/FlowMarkerJourneys.test.tsx src/app/FlowMemoryFriends.test.tsx src/app/voiceRecovery.test.tsx src/app/wakeAcquisition.test.tsx src/app/FlowContextualCalendar.test.tsx src/app/contextualCalendarLanguage.test.ts src/app/contextualCalendarTransactions.test.ts src/app/FlowCalendarPreservation.test.tsx src/domain/life-storage.test.ts
TMPDIR=$PWD/node_modules/.tmp npx vitest run --maxWorkers=1 src/app/FlowMarkerJourneys.test.tsx src/app/FlowVoiceNotes.test.tsx src/app/FlowFriends.test.tsx src/app/FlowGroups.test.tsx src/domain/life-storage.test.ts
TMPDIR=$PWD/node_modules/.tmp npx vitest run --maxWorkers=1 src/features/friends/deliveryProjection.test.ts
TMPDIR=$PWD/node_modules/.tmp npx tsc -b --pretty false
TMPDIR=$PWD/node_modules/.tmp npx playwright test e2e/friends-journeys.spec.ts --project=chromium --list
```

Root owns final complete tests, lint/build, baseline comparison, bundle measurement and independent flow_qa after source freeze.

## September 12 independent-QA repair pass

The first full expansion run had **3,891 passed / 743 failed** (4,634 total). This was a failed gate. Its +280 failures were investigated against the pre-edit backup; the results above are historical checkpoints, not the final release verdict.

The five independent findings are repaired:

- Group invitations now render the reviewed resolved day and time together; both typed and final-transcript tests compare the delivered receipt payload with the complete preview.
- The exact “Make that a commitment” command converts the selected Journal marker and asks the required person/direction questions.
- Marker reply creates a revision- and expiry-bound dictation question. The next literal sentence becomes a reviewed reply, including embedded Calendar words. Cancel/navigation revoke the question. Explicit confirmation remains required.
- Text and voice replies retain the public shared message ID through draft, recording, payload fingerprint and receipt. An explicit Memory reply never inherits another recording's marker. Missing/stale/mismatched public targets cannot create a draft or recorder. A unique incoming-message query binds its actual public target; ambiguous queries clear older selection. A voice reply without a selected target offers at most three concrete shared-message choices, and the next spoken choice binds the exact ID before acquiring audio. Pointer Friends dispatch now retains command ownership across its own navigation, so it can acquire the same recorder used by typed/final transcripts.
- All 58 formerly unbound controls have canonical action metadata. Core collection, actual group-reply recording, Memory event/moment linking, voice reply, and native seek/volume/speed operations now reach existing shared handlers by voice. The read-only position display and developer-only trace selector remain explicitly categorized non-product controls. Every new inventory entry remains **pending-three-mode**; source coverage is not physical verification.

Regression repairs preserve the older behavior where it remains valid: “Remember to … as soon as …” stays capture; “Tell me a joke” is not addressed to a contact; existing People/Friends navigation and person-query intent shapes remain; linked commitment reservations remain visible. Journal bookmark aliases use the existing bookmark action and common marker projection. New measured bookmark ranges are retained when available; historical bookmarks and typed prose do not acquire fictional acoustic alignment. Single-range segment IDs retain their prior form.

The 250 added legacy Journal contract failures came from one shared expected-action helper, not lost prose. That helper now expects truthful untimed typed ranges instead of fabricated `end = start + 1ms`. No generated corpus rows were rewritten. Rerunning all 2,200 independent legacy contracts produced **1,886 passed / 314 failed**: the 314 failed curated IDs are exactly the same set as the untouched baseline, with **zero new failed IDs** (`friends-qa-legacy-contracts.log`).

The ten callback-control tests now explicitly acquire a fresh empty recording. They no longer pretend that a finalized 512-byte Journal recording is an empty recording. Two new typed/final-transcript regressions assert that starting over on a finalized Journal preserves its complete snapshot, original bytes, text and markers and acquires no recorder. This bounded policy passed **12/12 selected cases** (`friends-qa-recording-guard.log`). Pause/resume before Stop remains supported; starting another take after Stop requires a new entry. No concatenation or silent overwrite was added.

Additional focused evidence: **83/83 tests in 11 files** passed (`friends-qa-final-focused.log`, 41.07 seconds); **43/43** prior repair checks passed; canonical source/handler/product-voice inventory checks **3/3** passed; linked-relationship preservation **1/1** passed. Global interpretation **249/249**, Studio language **108/108**, and Studio command planning **42/42** passed. The combined older semantic run had one unchanged baseline “under 20 minutes” oracle failure (expected 20, actual 19), which was not rewritten. Lint passed (`friends-qa-lint.log`). After the last reply-selection correction, the final reply-target/voice-entry/ambiguity/seek check passed **27/27 in 4 files**, 12.37 seconds (`friends-qa-reply-final.log`); strict TypeScript exited **0** with no diagnostics (`friends-qa-types-final.log`). The final inventory and unique/ambiguous message-selection checks passed **5/5 selected tests** (`friends-qa-last-contracts.log`). Playwright collection again found **2 tests**, with no browser launch (`friends-e2e-collection-final.log`).

```bash
TMPDIR=$PWD/node_modules/.tmp npx vitest run --maxWorkers=1 src/app/FlowFriends.test.tsx src/app/FlowGroups.test.tsx src/app/FlowMarkerJourneys.test.tsx src/app/FlowMemoryFriends.test.tsx src/app/FlowVoiceNotes.test.tsx src/features/friends/friends-foundation.test.ts src/features/friends/messaging.test.ts src/features/studio/recordingTiming.test.ts src/features/studio/voiceMarkers.test.ts src/features/studio/markerConversions.test.ts src/features/friends/relationshipQueries.test.ts
TMPDIR=$PWD/node_modules/.tmp npx vitest run --maxWorkers=1 src/app/FlowVoiceNotes.test.tsx src/app/FlowMarkerJourneys.test.tsx src/features/friends/friendReplySafety.test.ts
TMPDIR=$PWD/node_modules/.tmp npx vitest run --maxWorkers=1 src/features/voice-intelligence/productionPipelineEvaluator.test.ts -t 'validates independent legacy contract'
TMPDIR=$PWD/node_modules/.tmp npx vitest run --maxWorkers=1 src/app/FlowStudioApp.test.tsx -t 'typed completes the same legacy|preserves a finalized Journal'
```

The parent owns the next complete-suite/baseline comparison, build and independent QA recheck. Browser and physical gates remain unexecuted; no release PASS is claimed by this repair pass.

## Native playback target correction

Independent QA reproduced a further defect: selecting marker B, then using recording A's native play/pause controls, left the next spoken volume command bound to B. The shared playback hook now reports actual pointer, keyboard and native play activation. A validated context selection binds the active public message or own-note ID and retains a marker only if it belongs to that target. Shared voice notes, shared Memory audio and own-note audio all use this path. Playback itself remains outside document/history mutation.

Programmatic playback has a per-element guard: its own native play event does not supersede its originating command epoch or marker/confirmation context. Existing playback echo tracking stays active, including rejection of overlapped authorizers; a native failure releases the guard. React callback updates do not detach listeners and pause the recording.

Runtime changes are limited to `features/studio/useStudioPlayback.ts`, `app/FlowEnvironmentProvider.tsx`, and `features/friends/{SharedVoiceNote,SharedMemory,VoiceNoteSpace}.tsx`. New focused regressions are `app/FlowPlaybackTarget.test.tsx` and `features/studio/useStudioPlayback.test.tsx`.

- Independent artifact reproduction: **2/2 passed** (`friends-playback-target-reproduction.log`).
- Final focused run: **40/40 passed in 6 files**, 88.36 seconds (`friends-playback-focused.log`), including 12 typed/final-transcript combinations after native play/pointer/keyboard activation, programmatic authority, echo safety, failure recovery, original marker seek/sharing and recording preservation.
- Strict TypeScript: **exit 0**, no diagnostics (`friends-playback-types.log`).
- Source/tests refrozen afterward. Parent owns the final complete-suite, lint/build and independent recheck. The preceding complete checkpoint had **4,192 passed / 463 failed** (4,655 total), with the raw failure-heading multiset exactly matching baseline; that checkpoint predates this final bounded correction.

```bash
TMPDIR=$PWD/node_modules/.tmp npx vitest run --maxWorkers=1 src/app/FlowPlaybackTarget.test.tsx src/features/studio/useStudioPlayback.test.tsx src/features/studio/studioPlayback.test.ts src/features/voice/promptSpeech.test.ts src/app/FlowMarkerJourneys.test.tsx src/app/FlowVoiceNotes.test.tsx
TMPDIR=$PWD/node_modules/.tmp npx tsc -b --pretty false
```

## Honest limits

- Delivery is explicitly Flow-local in this browser. No actual external SMS/email/chat provider, remote recipient or invented activity is claimed. The adapter is extensible; only its local implementation exists.
- Group responses are received data or explicitly recorded by the user and labelled accordingly. Nobody's availability is guessed; sharing own free windows requires draft review.
- Timing uses measured speech/segment observations and is an estimate, not word-perfect. Private raw recordings may contain spoken controls; no automatic original-audio redaction is claimed. Explicit suffix removal and sharing export genuinely bounded bytes.
- Finalized recordings cannot be silently overwritten. Start a new note/entry; pause/resume before Stop uses the current owner.
- Local language and queries are bounded. Unknown authors/recipients/dates, unsupported media and ambiguous requests clarify or report the limitation without acting.
- Browser rendering, recording quality, acoustic echo/barge-in, physical alignment and all four hands-free demonstrations remain unverified until normal local Chrome/microphone validation.
