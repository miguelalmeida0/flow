# Flow local voice companion

Local, private speech-to-text and text-to-speech for Flow. Nothing here
ever leaves this Mac.

## Models

| Role | Model | License | Download | Notes |
|---|---|---|---|---|
| STT | `kyutai/stt-1b-en_fr-mlx` | CC-BY 4.0 | 2.36 GB | Streaming, semantic VAD built in. |
| TTS | `mlx-community/Kokoro-82M-8bit` | Apache 2.0 (Kokoro) | ~0.4 GB | **Fallback, not the originally-locked model** — see below. |

**Why Kokoro instead of Kyutai TTS.** Kyutai TTS (1.6B params) was measured
directly on this Mac (Apple M3, 17.2GB RAM): real-time-factor 0.39–0.62x at
both 4-bit and 8-bit quantization, warm and cold — meaning it generates
audio *slower* than real time and cannot sustain live streamed playback.
Kokoro-82M measured 3.7–11x real-time-factor once warm, with 0.2–0.5s
first-chunk latency. This triggered the pre-authorized Kokoro fallback.

## Storage

Model weights are cached under `voice-companion/.hf-cache/` (gitignored,
~6GB total) — **never commit this directory.** Delete it any time; both
models re-download automatically.

## Why two Python virtual environments

`moshi_mlx` (STT) hard-pins `mlx<0.27`. `mlx-audio` (TTS/Kokoro) hard-pins
`mlx>=0.31.1`. No version of `mlx` satisfies both, so:

- `.venv` (Python 3.13) — STT only, see `requirements-stt.txt` /
  `overrides-stt.txt`.
- `.venv-tts` (Python 3.12) — TTS only, see `requirements-tts.txt`.

`server.py` itself imports neither `moshi_mlx` nor `mlx_audio` (only
`websockets` + stdlib), so it runs fine under `.venv`'s Python. It spawns
`stt_worker.py` (under `.venv`) and `tts_worker.py` (under `.venv-tts`) as
subprocesses and relays framed messages between them and the browser's
WebSocket connection (see `framing.py`).

## First-time setup

The low-latency codec lifecycle uses the local reset repair documented in
[CODEC_LIFECYCLE.md](../CODEC_LIFECYCLE.md). Install it after the standard STT
dependencies below. Without that explicit capability, Flow safely reconstructs
the original codec for each utterance, with higher setup latency.

```sh
cd voice-companion
uv venv .venv
uv pip install -p .venv/bin/python -r requirements-stt.txt --override overrides-stt.txt

uv venv .venv-tts --python 3.12
uv pip install -p .venv-tts/bin/python -r requirements-tts.txt
# uv-managed venvs have no `pip` shim, so `spacy download` silently no-ops —
# install the English model wheel directly instead:
uv pip install -p .venv-tts/bin/python "en_core_web_sm @ https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl"
```

Both model downloads happen automatically the first time each worker
starts (a few seconds each; see startup log output).

## Startup

```sh
cd voice-companion
HF_HOME="$PWD/.hf-cache" .venv/bin/python server.py
```

Wait for both `STT ready` and `TTS ready` in the log (a few seconds —
model warmup, not download, once cached). The session token is printed and
written to `~/.flow-companion/voice-token`; Flow's frontend needs it in
`localStorage.setItem("flow.voiceCompanion.token", "<token>")` (no settings
UI for this yet — set it via devtools, same as the existing desktop
companion's token).

Optional env vars: `FLOW_VOICE_COMPANION_PORT` (default 8766),
`FLOW_STT_HF_REPO`, `FLOW_TTS_MODEL`, `FLOW_TTS_VOICE` (default
`af_heart`), `FLOW_VOICE_LOG_LEVEL`.

## Health check

```sh
curl http://127.0.0.1:8766/health
# {"ok": true, "sttReady": true, "ttsReady": true, "version": "0.1.0"}
```

Unauthenticated on purpose (reveals nothing beyond "a process is
listening" — same rationale as the Node desktop companion's `/health`).

## Wire protocol

`ws://127.0.0.1:8766/voice?token=<token>`, Origin must be
`http://localhost:5173` or `http://127.0.0.1:5173` (checked before the
handshake — a disallowed origin or bad token gets a real HTTP 403/401, the
connection never opens).

Client → server: binary frames are raw PCM16LE mono 24kHz microphone
audio; JSON text frames are `session.start` / `session.stop` /
`tts.speak {text}` / `tts.cancel`.

Server → client: binary frames are raw PCM16LE mono 24kHz TTS audio; JSON
text frames are `ready` / `speech.start` / `transcript.partial {text}` /
`transcript.final {text}` / `speech.end` / `stt.error {message}` /
`tts.start` / `tts.done` / `tts.cancelled` / `tts.error {message}`.

See `src/kernel/voice/voiceCompanionClient.ts` for the browser client and
`src/kernel/voice/voiceSessionMachine.ts` for the state machine this drives.

## Privacy boundary

Everything stays on `127.0.0.1`. No cloud speech API, no telemetry, no
audio ever written to disk by this service. The companion process can only
run STT/TTS inference — it has no filesystem or command-execution
capability (unlike the Node desktop companion, which is intentionally more
capable and has its own separate allowlist).

## Resource usage (measured on Apple M3, 17.2GB RAM)

- STT (Kyutai 1B, bf16): ~2GB resident.
- TTS (Kokoro-82M-8bit): well under 1GB resident.
- Combined companion (both workers) alongside the existing Ollama reasoner
  (qwen3-vl:2b, ~2GB) and the Node desktop companion (negligible): see
  FINAL REPORT's "TOTAL RESOURCES" section for the exact measured numbers.

## Troubleshooting

- **"Model type bit not supported"** loading Kokoro: an old `mlx-audio`
  version (< 0.5) got resolved instead of the one in
  `requirements-tts.txt`. Delete `.venv-tts` and reinstall from the
  requirements file exactly as above — don't `pip install mlx-audio`
  standalone without the pinned version, it can silently resolve older.
- **`cmake: command not found`** installing STT deps: you skipped
  `--override overrides-stt.txt`. Re-run the STT install command exactly
  as shown above.
- **`en_core_web_sm` not found** at TTS runtime despite "Download and
  installation successful" from `spacy download`: `uv`-managed venvs have
  no `pip` shim, so spacy's internal `pip install` subprocess silently
  no-ops. Use the direct wheel-URL install command above instead.
- **Port 8766 already in use**: an old companion process is still running
  (`lsof -i :8766`, then `kill <pid>`), or set `FLOW_VOICE_COMPANION_PORT`.
- **First TTS utterance after startup is slow (several seconds)**: this is
  a one-time MLX/Metal kernel-compile cost on the very first `generate()`
  call in the process's lifetime, not a per-utterance cost — every call
  after the first is fast (measured 0.6–0.8s warm).
