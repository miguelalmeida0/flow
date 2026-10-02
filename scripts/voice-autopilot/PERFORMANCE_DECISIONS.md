# Voice performance decisions

Functional parent: `aa63e018da0e3aa8dca3445923538881487dab38`.
Existing instrumentation and historical observations are preserved. Failed samples
remain in their original reports. A scoped replay never qualifies the full gate.

## P0: benchmark stability — KEEP

- Prior failed observation: `2026-09-20T15-54-03.734Z-after`,
  `confirm-barge-in/1`, exact Journal text exceeded the existing 15 s deadline.
- The trace contains the correct final text. Decoder construction was 2199.86 ms;
  decoder-ready to first token was about 9180 ms. This is processing delay, not
  evidence of lost dictation or incorrect Journal persistence.
- Fresh full replay also exposed intermittent `Flo` in the day-query transcript.
  The wake gate correctly rejects it. Do not expand wake aliases to hide it.
- Investigation adds per-second process RSS/CPU/page-in sampling and scoped
  runner selection. No timeout increases and no failed observations removed.
- Decision: unresolved; no performance qualification yet.

### Frame-phase correction under test

- Full replay `2026-09-20T16-46-26.608Z-before`: 27/30. All ten
  Journal/confirm setups passed; day-query repetitions 1, 3 and 10 produced Flo.
- Captured PCM from `2026-09-20T17-05-04.863Z-before` has identical
  onset-aligned SHA-256 `d33404c091117aa6e717d28971f3df5ecb2c68b89cfc545267706ef349c750ad`.
  Success/failure differs by 128 leading samples (5.33 ms), one worklet quantum.
- `phase-probe.json` reproduces Flow/Flo at the production decoder seam.
  Onset-relative 560 ms preroll yields Flow for both captures. 80 ms and 20 ms
  candidates yield Flo for both: REJECT those candidates for correctness.
- Implementation under browser replay: `decoder_pcm.py`, `stt_worker.py`.
  Preserve the existing 560 ms context and all post-onset samples; carry partial
  codec blocks across packets and pad the final remainder once.
- Eight PCM/endpoint unit checks pass. CPU/memory effect and browser correctness
  remain under measurement; this is not yet a retained performance optimization.
- Resource qualification excludes concurrent native compilation. The captured
  four-sample run retains two processing timeouts during compilation, in addition
  to two reproduced Flo failures. No timeout was enlarged.
- Browser replay `2026-09-20T17-12-29.034Z-before`: 6/6.
- First full stability run `2026-09-20T17-16-37.064Z-before`: 30/30.
  Detection→useful partial p50 2840 ms / p95 4854 ms; endpoint→final
  1170 / 2510 ms; TTS-start→scheduled 846 / 4396 ms; fixture→cancel request
  823 / 1434 ms. These are a baseline, not a performance win claim.
- Second and third full runs: `2026-09-20T17-43-23.654Z-before` and
  `2026-09-20T17-55-37.018Z-before`, both 30/30. No timeout enlargement.
  Gate 1 is complete. `stability-gate.json` retains all three identities;
  `qualified-before.json` combines the latter two fully instrumented runs.
  Failures from earlier investigations remain preserved, not overwritten.
  The frame-phase repair is retained for reproducibility and correctness.

## STT lifecycle candidate — live qualification

- Hypothesis: complete codec state reset can replace expensive reconstruction
  while preserving immutable codec weights.
- Root cause found in upstream release source matching installed rustymimi 0.4.1,
  commit `f8d6daff579d3d39b57d926c8e9519eb55128e56`:
  `Mimi::reset_state` omits `self.downsample.reset_state()`. The downsampler
  contains streaming convolution history. Current upstream includes the reset.
- Required before KEEP: compare fresh/reset tokens for identical PCM, alternate
  different utterances, 100-turn soak, measured setup/CPU/memory distributions,
  real-audio and functional gates. Existing reconstruction remains active.
- Isolated codec probe now completed: original reset mismatched fresh tokens in
  7/8 turns. Patched complete reset matched fresh tokens in 100/100 alternating
  utterances, and its fresh-token digests exactly matched the original wheel.
  Reset p50 0.0559 ms / p95 0.0835 ms; reconstruction in the same probe
  p50 72.06 ms / p95 667.09 ms (only four construction samples; not a live-turn
  distribution). RSS first ten mean 764.34 MiB, last ten mean 517.10 MiB,
  observed peak 770.27 MiB. No rising RSS or encode-time trend in this probe.
  Evidence: `codec-reset-original.json`, `codec-reset-complete.json`.
- The patched wheel is installed only into an isolated artifact target. The
  production environment and live decoder lifecycle remain unchanged pending
  completion of the three-run stability gate and subsequent live qualification.
- After Gate 1, install the verified local wheel and call only its explicit
  `reset_complete` capability. Retain reconstruction for unpatched environments,
  fresh LmGen every utterance, and reset every transformer cache. Decoder-ready
  events identify the lifecycle actually used. No endpoint/drain/TTS changes in
  this experiment. Browser replay and full decoder soak are pending.
- Candidate v1: browser replay `2026-09-20T18-08-50.334Z-after` passed 6/6.
  Setup was 0.36–8.05 ms in the first six observed utterances. Both real reactive
  interruptions stopped all browser sources in 19.9 / 42 ms from detection.
  Whole-turn results did not yet improve consistently; no claim of a global win.
- **REVERT v1:** full decoder soak matched fresh tokens for 74 turns, then failed
  at turn 75: rotary position exceeded its 8192-entry table. Native attention
  `reset_kv_cache()` clears KV data but omits `self.pos = 0`. The shorter codec
  probe had not crossed that cumulative position limit. Preserve the failed run
  in `stt-reset-soak-v1-failed.json`; restore reconstruction immediately.
- Candidate v2 additionally resets attention position. Its distinct
  `reset_complete_v2()` capability prevents accidentally reusing v1. It must pass
  the complete 100-turn decoder soak before retention. This remains the same
  codec/model architecture and weights, with two missing mutable-state resets.
- Candidate v2 complete decoder soak: **100/100 exact token sequences** match
  fresh decoders (`stt-reset-soak-v2.json`). Setup p50 0.268 ms / p95 0.665 ms,
  max 3.045 ms. MLX active allocation is constant at 2,012,909,738 bytes.
  RSS first/last twenty means: 2727.99 / 2307.15 MiB. Whole decoding first/last
  twenty means increased 4296.12 → 5181.58 ms despite stable allocation; do not
  claim a flat latency trend. Native encode rose 24.28 → 36.07 ms per frame;
  generation 54.90 → 59.41 ms. Resource contention remains to be characterized.
  One second of thread sampling occurred during this auxiliary soak; it is not
  a release latency distribution. Browser qualification follows separately.
- **KEEP v2:** `voice-autopilot/2026-09-20T18-50-29.001Z` passed 33/33;
  chaos 110/110, all observed safety counts zero, all five established false-wake
  controls zero and all attenuation levels pass. Live decoder setup across 54
  utterances: p50 0.498 ms / p95 16.481 ms / max 78.564 ms. Seven reactive
  interruptions: detection → all source-ended callbacks p50 29 ms / p95 54 ms.
  These are browser audio callbacks, not physical speaker measurements. Final
  release comparisons will use matched repeated scenarios, not mixed workloads.

## Drain experiment — guarded candidate under qualification

- Hypothesis: the full fixed 19-step tail repeats silence already consumed
  during the 960 ms endpoint wait. Its retained baseline p50 is still about
  1052 ms after codec repair.
- Compare the same real PCM with full tail, seven extra frames for nonempty
  hypotheses, and stable-output termination. Preserve the entire full tail and
  existing same-audio retry for empty short utterances. Require identical full
  text before a live microphone replay; never accept truncation as a speedup.
- Paired real PCM `drain-paired.json`: 13/13 identical final transcripts;
  fixed tail p50 1081.81 ms versus seven-frame candidate 451.04 ms. Empty
  short replies keep the full tail and retry, so p95 remains about 1.4 s.
  Stable-output early termination did not activate: whitespace tokens continued.
- Live guarded-tail replay `2026-09-20T19-05-15.572Z-after`: 6/6;
  endpoint→final 429/883 ms p50/p95. All samples and CPU/RSS traces retained.
- Adaptive profiles next: closed 240 ms, short 400 ms, normal 640 ms,
  incomplete/dictation 1760 ms. Partials select silence policy only; final
  authority remains mandatory. Tail accounts for silence already decoded, with
  at least seven delayed frames; empty hypotheses retain the original full tail.
  `endpoint-640-paired.json` matches all four native reference transcripts.
- First adaptive live replay `2026-09-20T19-10-52.301Z-after`: 6/6;
  endpoint→final 404/461 ms, speech end→final 1116/2276 ms, detected
  barge-in→all browser sources ended 15.9/18.1 ms. Small sample, not final
  performance qualification. TTS remains unchanged (733/4590 ms to playable).
- Additional real pause matrix preserves 200–1500 ms pauses without splitting
  the command, but exposed downstream date parsing of pause punctuation:
  `open next. Thursday` becomes a lookup for an event titled `next.`.
  Those failed observations remain in `voice-fluidity/2026-09-20T19-31-36.023Z`.
  Repair the date grammar; do not remove punctuation from arbitrary titles.

## TTS residency candidate — not enabled

- Installed Kokoro `Model.generate` resets `pipeline.voices` on every request and
  clears the MLX allocator cache after each segment. The language pipeline itself
  is lazy, so worker-ready does not establish first-synthesis readiness.
- Required: independently measure voice/G2P setup, generation and framing before
  selecting a change. No retained optimization or claimed improvement yet.
- Four isolated process probes, ten syntheses each (nine warm observations):
  original first chunk p50/p95 313/627 ms; voice-cache 285/396 ms;
  allocator-cache 293/396 ms; sentence units 164/211 ms. First process
  synthesis remains 3.1–4.4 s in every candidate. These are generated PCM,
  not browser/audio-device observations. Original/candidates have separate
  process starts and OS cache effects; only matched warmed texts support causality.
- REJECT allocator retention: no meaningful first-chunk improvement relative
  to voice-cache, about 133 MB retained temporary allocation versus 0.4 MB.
- Sentence units: isolated CPU median 215 ms versus original 141 ms;
  total generation increases for multiple sentences, but first audio arrives
  sooner. Process peak RSS about 765 MB versus original 769 MB. Retain only
  if the real full-duplex replay confirms the user-perceived win and safety.
- First live candidate changes only sentence segmentation, keeps original
  `model.generate`, allocator clearing and all cancellation guards. Abbreviations,
  initials and decimals stay intact; three text-preservation unit checks pass.
  Bounded latest-work queue helpers have two passing tests but are not yet wired.

## Pause matrix and resource interference

- `voice-fluidity/2026-09-20T19-31-36.023Z`: six dictation pauses
  (200–1500 ms) preserve exact saved/reopened text; six commands preserve
  speech but fail temporal routing of STT punctuation. The whole temporal
  destination grammar now accepts punctuation between any weekday modifier
  and weekday; it does not normalize event titles. Router suite: 275/275.
- Replay `2026-09-20T19-36-21.151Z`: all six command pauses pass, five
  dictation cases pass; 750 ms case fails before speech at mic acquisition.
  Browser ready event arrives at 16.6 s and mic-live at 37.1 s. Same worker
  epochs, no decoder restart. Preserve 11/12, not a passing matrix claim.
- Contemporaneous process snapshot: unrelated simulator Shelf process about
  3.1 GB RSS / 100% CPU, virtualization process 55% CPU. Do not terminate
  unrelated processes or silently exclude resource-pressure failures.

## TTS live iterations

- Sentence-only replay `2026-09-20T19-43-26.759Z-after`: 6/6; first
  cold-worker playable audio 7270 ms; aggregate playable p50/p95 608/7270 ms.
  Contention also slowed STT; do not attribute all distribution changes to TTS.
- Add one bounded discarded `Ready.` synthesis before worker-ready. Replay
  `2026-09-20T19-46-24.788Z-after`: 6/6, first live playable 483 ms;
  aggregate 503/965 ms. Full stack ready in 13.65 s. Report startup cost
  explicitly; warming moves work before readiness rather than eliminating it.
- Cancellation qualification next: one persistent synthesis consumer, one
  pending replacement, request IDs across worker/server/browser, reject late
  audio/start/done, cancel all old browser sources on supersession. Three
  queue/player regression checks plus client/hook 30/30 pass. No transcript or
  proposal semantics change. Real self-echo/confirm/no/wait replay pending.

## Isolated STT resource precision experiment — NOT RETAINED

- Same installed Kyutai architecture with MLX 8-bit linear weights reduces active
  allocation 2,012,368,934 → 1,052,692,518 bytes; conversion costs 556.6 ms.
  Twelve auxiliary real-PCM turns preserve lexical content, but three wake
  transcripts lose punctuation (`Flow, Open Calendar.` → `Flow Open Calendar`).
  Exact token equality is 9/12, so this is not a transparent lifecycle repair.
  Production remains original precision. Any further consideration requires
  separate fresh/reset equivalence at the candidate precision and full real-audio
  wake/safety qualification. Evidence: `stt-q8-resource-candidate.json`.
- Follow-up `stt-q8-reset-soak.json`: **100/100** identical token sequences
  against fresh references at the same candidate precision. Original-precision
  references remain separately retained in the report. Active allocation is
  constant at 1,086,787,754 bytes; setup p50/p95 0.149/0.218 ms; full
  decode 2534/3108 ms. First/last twenty means 2635/2412 ms and
  RSS 1093/807 MiB; observed RSS peak 1210 MiB. Candidate stays opt-in
  (`FLOW_STT_LINEAR_BITS=8`), with original precision the production default,
  pending matched real-microphone and full functional qualification.

## Split echo correction — KEEP after targeted real replay

- `voice-autopilot/2026-09-20T19-52-55.209Z`: confirm/no/wait passed,
  self-echo failed. Faster endpointing split sentence-chunked assistant output
  into multiple STT utterances; the first was rejected but the next sentence
  escaped the overlap-only echo guard. The fixture also started Confirm before
  all prior echo PCM had been consumed. Preserve this failed observation.
- Continue an identified echo only through the remaining normalized output
  prefix, same worker/session, and a next speech onset within 2000 ms of its
  audio cursor. Require at least three words; independent closed replies remain
  admissible. Discard continuation on expiry, mismatch or new spoken output.
  No proposal changes and no approval authority are granted by this guard.
- Harness waits for its actual input source-ended callback and the worker PCM
  cursor, then asserts **no echo sentence** reached dispatch. No longer selects
  the next arbitrary final as Confirm while echo input remains in flight.
- `2026-09-20T19-57-37.942Z`: self-echo PASS, actual subsequent Confirm
  deletes once, actual Undo restores the same entry. Hook suite 18/18.

## Streaming wake — full qualification running

- Evolving lexical state replaces independent partial regex checks. Bare Flow
  remains tentative; an observed delimiter confirms the wake immediately.
  Authoritative final still revalidates the wake and alone grants dispatch.
  Stale utterance partials are ignored. Possessive Flow's is not a wake.
- FSM 16/16 plus hook 19/19. Current original-precision full replay has passed
  all six attenuation levels and five established false-wake controls.

## Full gate and bounded echo repair

- `voice-autopilot/2026-09-20T20-04-55.884Z`: 32/33, chaos 115/115.
  Only self-echo failed: the identified contiguous echo continuation recognized
  "confirmed" instead of the known output word "confirm". No unauthorized
  mutation occurred, but the sentence incorrectly reached dialogue dispatch.
- `speechEcho.ts` permits one word with at most two character edits only in
  an already identified, bounded echo continuation of at least five words.
  Independent short replies and materially different instructions are excluded.
  Hook/helper 21/21; two consecutive actual self-echo replays passed in
  `2026-09-20T20-15-47.630Z-after`, including subsequent real Confirm/Undo.

## Closed-reply presentation delay — targeted KEEP

- Full-gate Confirm/No/Never mind final-to-decision was typically 271–285 ms,
  with 247–256 ms spent waiting for target paint. Existing history bypass
  already completed in under 1 ms. This is presentation latency, not inference.
- Voice confirm/cancel/history now use the unchanged authoritative runner
  immediately after projection. Proposal validation, utterance authority and
  transaction idempotency remain in their existing execution paths.
- `2026-09-20T20-22-26.055Z-after`: 2/2 real closed-confirm scenarios,
  final-to-decision 50.8/51.0 ms; exactly one deletion, identical Undo restore.
  End-of-speech latency remained 3.4–3.8 seconds: no claim that this UI fix
  eliminates the separate STT bottleneck. CPU/memory effect not isolated.
- Wait trace exposed a real gap: legacy unsupported route, no decision event.
  Bare Wait now shares existing cancellation semantics with kernel classifyReply.
  Its real fixture now also requires cancellation speech and rejects a later
  stale Confirm, instead of only checking that no deletion occurred immediately.
