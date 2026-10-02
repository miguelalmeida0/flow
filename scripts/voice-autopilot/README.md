# Flow voice autopilot

Run `npm run test:voice:autopilot`. Replay with
`npm run test:voice:autopilot -- --scenario <id>` (comma-separated IDs also work).

The runner reuses healthy developer services, starts missing local services,
waits for STT/TTS and an authenticated live probe of the selected reasoner,
and stops only its own process group. It uses installed local models; there
is no hosted speech service or transcript injection in the audio lanes.

## Lanes

- A: a fresh headed Playwright Chromium per scenario, resolved using
  `chromium.executablePath()`, with native fake-device, fake-UI permission,
  and absolute `--use-file-for-fake-audio-capture=<wav>%noloop` arguments.
  WAVs contain one second of leading and two seconds of trailing PCM silence.
  Production getUserMedia, AudioWorklet, WebSocket, Kyutai, conversational
  dispatch, persistence, and Kokoro/Web Audio are exercised.
- B: headed Web Audio MediaStream microphone input. Test speech is queued
  reactively after actual production playback starts. Production capture
  and STT remain real. Assistant echo uses actual captured TTS PCM.
- C: asynchronous browser Web Lock ownership transfers plus separately
  labeled hook/protocol/kernel fault-injection regressions. These unit tests
  do not constitute microphone or model evidence.
- Device loopback and real-room acoustics are separate, unmeasured coverage.

Fixtures are generated locally by Kokoro; explicitly recorded macOS offline
voices provide independent user replies and Portuguese pronunciation. Some
name fixtures compose speech segments with a measured 100 ms pause. Their
metadata records text, voice/model, sample rate, duration, RMS, peak, and SHA-256.
No generated audio belongs in source control.

## Repeated latency measurements

Mode A — native microphone certification:

```sh
npm run test:voice:autopilot -- --native
npm run test:voice:autopilot -- --native --scenario wake-0db
```

The canonical native set is wake + command, one mutation (`add-anita`), and
one normal query. It uses real Chromium getUserMedia with the native fake-device
and process-bound WAV arguments. Separate browser launches are expected here.
The full established 33-scenario qualification suite remains explicitly available
as `npm run test:voice:autopilot`; run it only at meaningful qualification
checkpoints, never automatically after each optimization.

Mode B — long-lived reactive digital latency benchmark:

```sh
npm run test:voice:latency -- --samples 10
npm run test:voice:latency -- --scenario wake --samples 10
npm run test:voice:latency -- --scenario endpoint --samples 10
npm run test:voice:latency -- --scenario tts --samples 10
npm run test:voice:latency -- --scenario barge-in --samples 10
```

One headed Chromium process, one context, one page, one reactive input AudioContext
and MediaStream survive the whole invocation. There is no per-sample launch,
reload, focus, or window creation. Production AudioWorklet, PCM transport, real
Kyutai STT, Flow dispatch, and Kokoro playback remain in the measured path.
No transcripts or model responses are injected. Worker epochs and the production
capture identity are checked for continuity.

`--samples N` means **N total scenarios**, cycling through the selected group
(default: wake, normal query/TTS, confirmation/barge-in). This replaces the old
N repetitions *per scenario* behavior. Confirmation retains the real Journal
dictation, proposal, deletion, and undo assertions, so it contains multiple audio
turns. The report gives total scenarios and individual observed turns separately.
One failed scenario stops the invocation, saves its evidence, and closes the
browser; there is no automatic retry/relaunch.

Before each scenario, test state is restored through Flow's existing storage-sync
listener with a new revision. A harness-only response instrumentation exposes
the hook's existing public `cancel` and `sleep` controls so wake samples begin
asleep. It changes no recognition/reducer/dispatch logic or production files.
Audio input must finish before reset; the microphone and worker stay live.
Fixtures are synthesized/cached before opening the persistent voice owner.

Lifecycle output is explicit:

```text
[VOICE LAB] Chromium started pid=<pid>
[VOICE LAB] reusing browser for 50 samples
[VOICE LAB] Chromium closed
```

The runner asserts one launch and one close. PID/start-time/session metadata lives
under `artifacts/voice-autopilot/browser-sessions/`. Startup only cleans up a
recorded orphan whose owner has gone and whose Chromium PID, start time, and
unique session command marker still match. It never scans and kills arbitrary
Chrome windows. Normal exit, failures, SIGINT, SIGTERM, and SIGHUP close page,
context, and browser, then stop only a stack launcher created by this invocation.
Shared resident services are reused and left running.

Use targeted benchmark → optimization → targeted regression. The benchmark
has a 20-minute deadline; it never launches the full qualification suite.
Use `--phase before` for a comparison baseline. Native and reactive results
are labeled separately: reactive PASS does not certify native device integration.

Scoped reply iterations also accept `--scenario closed-reply` or
`--scenario closed-undo` (and other `closed-<reply>` IDs). N total samples
cycle through the selected replies. The measured reply is distinguished from its
Journal setup and preceding confirmation.

`npm run test:voice:fluidity` adds real audio for lexical adversaries,
hesitations, corrections, pronouns and the 200/350/500/750/1000/1500 ms pause
matrix. Use `-- --group endpoint` or `-- --scenario <id>` for scoped replay.
These supplement the unchanged 33 established functional scenarios.

`npm run test:voice:cold-warm` requires stopped voice workers, then measures
ten turns with new worker processes and idle intervals of one and five minutes.
Use `-- --idle-minutes 1,5,15` for the longer matrix. It records exact worker
epochs, startup warming and reasoner model-local load/evaluation durations;
it does not call a fresh browser a cold model or flush OS filesystem caches.

Artifacts live in `artifacts/voice-latency/`; before and after reports are
separate. `test:voice:autopilot -- --baseline <report.json>` renders the
same before/after distributions and waterfall in the usual latest HTML.
Percentiles use nearest rank; missing measurements never count as zero.
The useful-partial boundary requires a lexical word followed by an observed
space or punctuation delimiter; the first decoder fragment (often "F") is
reported separately by the legacy first-partial metric.
Legacy `speech.start` occurs after fresh decoder initialization. New worker
PCM-detection measurements include that initialization, but still begin at
worker processing, not physical microphone onset; they cannot retroactively
repair the missing boundary in older baseline traces.
All waterfall positions use the browser observation clock. Worker `atMs`
values have their own monotonic origin and must not be subtracted from it.

The legacy playback events observe scheduling and cancellation requests.
They do **not** measure physical audible start or physical stop. Those
fields remain null. A fresh browser is also not a cold model: resident
service reuse and fixture synthesis can warm models before a scenario.
Cold model timings remain unknown unless separately measured.

## Evidence

Each run writes a timestamped directory under gitignored
`artifacts/voice-autopilot/` and updates `latest/index.html`, `report.json`,
and `wake-curve.json`. Evidence includes browser screenshots, boundary events,
real transcripts, playback lifecycle, timings and persisted disposable state.
Reactive input captures stay in generated artifacts for failure diagnosis.
Pairing tokens, request headers, model weights and private developer data are
not included in the report. A failure exits non-zero and identifies its replay.

Endpointing belongs to production: PCM energy relative to a measured noise
floor, contextual silence profiles (closed reply 240 ms, short command 400 ms,
normal 640 ms, no lexical evidence 960 ms, incomplete/dictation 1760 ms),
bounded model drain, one canonical final, then clean decoder state. Partial
hints never authorize mutations or approvals. The harness never stops a session to manufacture a
final. Short empty outputs receive at most one bounded same-audio onset-aligned
retry; an empty result still grants no execution authority.

Kokoro pays one discarded synthesis before advertising readiness, then emits
sentence-sized PCM while preserving text, abbreviations and decimals. A single
synthesis consumer retains only the latest pending request. Request IDs fence
late worker, websocket and browser playback output. Browser source-ended
callbacks prove browser cancellation; physical speaker latency remains unknown.

PASS applies only to assertions actually executed. Digital attenuation is not
a claim about room acoustics or far-field microphones. Regression comparisons
must use exact file and test names, never equal failure totals.
