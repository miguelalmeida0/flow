# Mimi streaming-state reset repair

The installed rustymimi 0.4.1 `Mimi::reset_state` omits the downsampler's
streaming convolution state. Calling its original `reset()` is not equivalent
to constructing a fresh tokenizer. Alternating identical PCM through the
original reset reproduced different encoded tokens in 7/8 turns.

The longer full decoder soak also exposed an unreset rotary-position counter:
the first candidate failed at turn 75 after reaching position 8192. It is
rejected, even though its shorter codec-only probe passed.

`build_reset_codec.py` builds the published 0.4.1 source after verifying its
SHA-256, adding the missing `downsample.reset_state()` and attention position
reset, and exposing an explicit `reset_complete_v2()` capability. The codec math,
model weights and architecture are unchanged. The local version is
`0.4.1+flowreset2`; the rejected v1 capability is never eligible for live reuse.

Build with Rust/Cargo and uv on PATH:

```sh
python3 voice-companion/build_reset_codec.py
uv pip install --python voice-companion/.venv/bin/python --no-deps artifacts/voice-latency/reset-codec/wheels/rustymimi-0.4.1+flowreset2-cp313-cp313-macosx_11_0_arm64.whl
```

The wheel filename depends on the selected Python ABI and platform. The build
script defaults to the actual STT worker's `.venv/bin/python`; it does not
install automatically or change a running process. Do not bypass PyO3 ABI
checks. Do not install this wheel into the separate Kokoro environment.

Process lifetime: model weights, tokenizer vocabulary, Mimi weights and native
codec structure. Utterance lifetime: reset every transformer cache, reset every
codec streaming buffer (including downsampler), and construct a fresh `LmGen`
with its own token history, sampler and generation indices. Endpoint, transcript
and PCM alignment state remain per utterance/session. Immutable weight residency
does not authorize retaining conversational state.

Qualification uses two independent probes: `codec_reset_probe.py` compares
encoded tokens to fresh objects, and `stt_reset_soak.py` compares full decoder
token sequences across 100 alternating real fixtures. They supplement, and never
replace, the production digital-microphone autopilot and mutation safety gates.
Original and failed observations remain under `artifacts/voice-latency/`.
