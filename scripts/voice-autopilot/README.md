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

## Evidence

Each run writes a timestamped directory under gitignored
`artifacts/voice-autopilot/` and updates `latest/index.html`, `report.json`,
and `wake-curve.json`. Evidence includes browser screenshots, boundary events,
real transcripts, playback lifecycle, timings and persisted disposable state.
Reactive input captures stay in generated artifacts for failure diagnosis.
Pairing tokens, request headers, model weights and private developer data are
not included in the report. A failure exits non-zero and identifies its replay.

Endpointing belongs to production: PCM energy relative to a measured noise
floor, 960 ms sentence-final silence, bounded model drain, one canonical final,
then fresh decoder state. The harness never stops a session to manufacture a
final. Short empty outputs receive at most one bounded same-audio onset-aligned
retry; an empty result still grants no execution authority.

PASS applies only to assertions actually executed. Digital attenuation is not
a claim about room acoustics or far-field microphones. Regression comparisons
must use exact file and test names, never equal failure totals.
