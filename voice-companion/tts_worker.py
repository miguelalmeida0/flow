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
import queue

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from framing import FRAME_AUDIO, FRAME_JSON, read_frame, write_frame  # noqa: E402

MAX_TTS_TEXT_CHARS = 4_000
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


def synthesize(model, text: str, voice: str, is_cancelled):
    for result in model.generate(text=text, voice=voice, speed=1.0, stream=False):
        if is_cancelled():
            raise _Cancelled()
        pcm16 = (np.clip(np.asarray(result.audio), -1.0, 1.0) * 32767.0).astype(np.int16)
        emit_audio(pcm16.tobytes())


def main():
    try:
        model = load_model()
    except Exception as exc:  # noqa: BLE001
        emit_json({"type": "tts.error", "message": "Local TTS model failed to load"})
        sys.exit(1)
    emit_json({"type": "worker.ready"})

    voice = os.environ.get("FLOW_TTS_VOICE", "af_heart")
    current_generation = 0
    generation_lock = threading.Lock()
    synthesis_lock = threading.Lock()
    cancel_flag = {"cancelled": False}

    def is_cancelled_for(generation_id):
        with generation_lock:
            return cancel_flag["cancelled"] or generation_id != current_generation

    def run_speak(text, generation_id, session_id):
        def event(kind, **metadata):
            emit_json({"type": kind, "id": generation_id, "sessionId": session_id, **metadata})
        # MLX model state is shared; cancellation invalidates a generation but
        # does not make concurrent model.generate calls safe.
        with synthesis_lock:
            if is_cancelled_for(generation_id):
                return
            event("tts.start")
            try:
                synthesize(model, text, voice, lambda: is_cancelled_for(generation_id))
            except _Cancelled:
                event("tts.cancelled")
                return
            except Exception as exc:  # noqa: BLE001
                event("tts.error", message="Local TTS synthesis failed")
                return
            event("tts.cancelled" if is_cancelled_for(generation_id) else "tts.done")

    pending = queue.Queue(maxsize=1)
    def synthesis_loop():
        while True:
            run_speak(*pending.get())
    threading.Thread(target=synthesis_loop, daemon=True).start()

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
            with generation_lock:
                current_generation += 1
                generation_id = current_generation
                cancel_flag["cancelled"] = False
            try:
                pending.get_nowait()
            except queue.Empty:
                pass
            pending.put_nowait((text, generation_id, control.get("sessionId")))
        elif cmd == "cancel":
            with generation_lock:
                cancel_flag["cancelled"] = True


if __name__ == "__main__":
    main()
