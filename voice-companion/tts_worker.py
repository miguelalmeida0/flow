"""
TTS worker subprocess — runs under .venv-tts (mlx-audio / Kokoro-82M). See
FINAL REPORT's fallback decision: Kyutai TTS measured real-time-factor
< 1.0x even warm and 4-bit quantized (0.39-0.62x across both
quantizations), so this uses the pre-authorized Kokoro fallback, which
measured 3.7-11x warm. Spawned and supervised by server.py, talks to the
parent over stdin/stdout using framing.py's protocol — process isolation,
not a network boundary.

Stdin frames (from server.py):
  J {"cmd": "speak", "text": "...", "id": <int>}
  J {"cmd": "cancel"}

Stdout frames (to server.py):
  J {"type": "worker.ready"}
  J {"type": "tts.start", "id": <int>}
  A <pcm16le bytes>          -- one or more chunks per utterance
  J {"type": "tts.done", "id": <int>}
  J {"type": "tts.cancelled", "id": <int>}
  J {"type": "tts.error", "message": "...", "id": <int>}
"""
import json
import os
import sys
import threading
import time
import uuid

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from framing import FRAME_AUDIO, FRAME_JSON, read_frame, write_frame  # noqa: E402
from tts_text import speech_chunks  # noqa: E402
from latest_speech import LatestSpeech  # noqa: E402

MAX_TTS_TEXT_CHARS = 4_000
WORKER_EPOCH = str(uuid.uuid4())
_write_lock = threading.Lock()
# Model/G2P dependencies print progress to stdout on first synthesis. Keep
# framed protocol on a dedicated descriptor so those bytes cannot corrupt it.
_protocol = os.fdopen(os.dup(sys.stdout.fileno()), "wb", buffering=0)
os.dup2(sys.stderr.fileno(), sys.stdout.fileno())


def emit_json(payload: dict):
    with _write_lock:
        write_frame(_protocol, FRAME_JSON, json.dumps(payload).encode("utf-8"))


def emit_audio(pcm_bytes: bytes):
    with _write_lock:
        write_frame(_protocol, FRAME_AUDIO, pcm_bytes)


class _Cancelled(Exception):
    pass


def load_model():
    from mlx_audio.tts.utils import load_model as _load

    repo = os.environ.get("FLOW_TTS_MODEL", "mlx-community/Kokoro-82M-8bit")
    return _load(repo)


def synthesize(model, text: str, voice: str, is_cancelled, publish):
    # Kokoro yields one playable segment at a time. Preserve sentence text and
    # let the existing player schedule consecutive PCM buffers without gaps.
    segmented = "\n".join(speech_chunks(text))
    for result in model.generate(text=segmented, voice=voice, speed=1.0, stream=False):
        if is_cancelled():
            raise _Cancelled()
        pcm16 = (np.clip(np.asarray(result.audio), -1.0, 1.0) * 32767.0).astype(np.int16)
        if not publish(pcm16.tobytes()):
            raise _Cancelled()


def main():
    started = time.monotonic()
    voice = os.environ.get("FLOW_TTS_VOICE", "af_heart")
    try:
        model = load_model()
        loaded = time.monotonic()
        # Pay lazy G2P/voice/kernel setup before advertising synthesis readiness.
        # This feed-forward probe is discarded and never enters audio output or
        # a conversation. Consume the generator to finish allocator cleanup.
        for result in model.generate(text="Ready.", voice=voice, speed=1.0, stream=False):
            np.asarray(result.audio)
    except Exception as exc:  # noqa: BLE001
        emit_json({"type": "tts.error", "message": f"model initialization failed: {exc}"})
        sys.exit(1)
    emit_json({"type": "worker.ready", "workerEpoch": WORKER_EPOCH,
               "startup": {"modelLoadMs": (loaded - started) * 1000,
                           "synthesisWarmupMs": (time.monotonic() - loaded) * 1000,
                           "totalMs": (time.monotonic() - started) * 1000, "synthesisWarmed": True}})

    queue = LatestSpeech()

    def consume():
        # One persistent inference thread. The stdin/control thread never waits
        # for inference, and replacement/cancellation cannot accumulate jobs.
        while (request := queue.take()) is not None:
            synthesis_started = time.monotonic()
            chunk_index = 0

            def event(kind, **metadata):
                emit_json({"type": kind, "id": request.generation,
                           "requestId": request.request_id, "sessionId": request.session_id,
                           "workerEpoch": WORKER_EPOCH, "atMs": time.monotonic() * 1000, **metadata})

            def publish(pcm):
                nonlocal chunk_index
                generated_ms = (time.monotonic() - synthesis_started) * 1000
                def output():
                    event("tts.chunkGenerated", chunkIndex=chunk_index, samples=len(pcm) // 2,
                          durationMs=generated_ms, requestToSamplesMs=(time.monotonic() - request.received_at) * 1000,
                          synthesisQueueDepth=int(queue.pending is not None))
                    emit_audio(pcm)
                emitted = queue.publish(request, output)
                chunk_index += int(emitted)
                return emitted

            if not queue.publish(request, lambda: event("tts.start", synthesisQueueDepth=0,
                queueWaitMs=(synthesis_started - request.received_at) * 1000)):
                continue
            try:
                synthesize(model, request.text, voice, lambda: not queue.current(request), publish)
            except _Cancelled:
                event("tts.cancelled")
                continue
            except Exception as exc:  # noqa: BLE001
                event("tts.error", message=str(exc))
                continue
            queue.publish(request, lambda: event("tts.done"))

    threading.Thread(target=consume, name="kokoro-synthesis", daemon=True).start()

    stdin = sys.stdin.buffer
    while True:
        msg_type, payload = read_frame(stdin)
        if msg_type is None:
            break
        if msg_type != FRAME_JSON:
            continue
        try:
            control = json.loads(payload)
        except json.JSONDecodeError:
            continue
        cmd = control.get("cmd")
        if cmd == "speak":
            text = control.get("text", "")
            if not isinstance(text, str) or not text.strip():
                continue
            if len(text) > MAX_TTS_TEXT_CHARS:
                emit_json({"type": "tts.error", "message": "text too long", "id": control.get("id")})
                continue
            queue.replace(text, control.get("sessionId"), control.get("requestId"))
        elif cmd == "cancel":
            queue.cancel()
    queue.close()


if __name__ == "__main__":
    main()
