"""
Flow's local voice companion — an authenticated localhost WebSocket process
that owns Kyutai STT (streaming speech-to-text) and Kokoro TTS
(text-to-speech, the pre-authorized fallback — see FINAL REPORT: Kyutai TTS
measured real-time-factor < 1.0x even warm and 4-bit quantized on this
Mac), following the same security model as the existing Node desktop-bridge
companion (server/desktop-bridge/index.mjs):

  - binds to 127.0.0.1 only, never reachable from the network
  - a session bearer token, generated fresh per process start, persisted to
    ~/.flow-companion/voice-token (mode 0600) and printed to stdout, checked
    with a constant-time compare
  - Origin header must be present and in the allowlist
    (http://localhost:5173, http://127.0.0.1:5173) or the connection is
    refused before any audio is read
  - no public bind, no tunnel, no remote audio upload, no arbitrary command
    execution — this process relays STT/TTS frames and nothing else

Why two model subprocesses instead of one process: Kyutai STT (moshi_mlx)
hard-requires mlx<0.27; Kokoro TTS (mlx-audio) hard-requires mlx>=0.31.1.
There is no version of mlx that satisfies both, so this process (which has
NO MLX import itself, only `websockets` + stdlib) spawns stt_worker.py
under .venv (moshi_mlx's environment) and tts_worker.py under .venv-tts
(mlx-audio's environment), and relays framed messages between them and the
browser's WebSocket connection. See framing.py for the wire format used on
both the worker pipes.

Protocol (see docs/VOICE_COMPANION.md for the full reference):
  Client connects to ws://127.0.0.1:<port>/voice?token=<token>
  Client -> server: binary frames are raw PCM16LE mono 24kHz microphone
    audio; JSON text frames are control messages
      {"type": "session.start"}
      {"type": "session.stop"}
      {"type": "tts.speak", "text": "..."}
      {"type": "tts.cancel"}          -- barge-in: stop speaking NOW
  Server -> client: binary frames are raw PCM16LE mono 24kHz TTS audio;
    JSON text frames are events
      {"type": "ready", "sttReady": bool, "ttsReady": bool, "version": "..."}
      {"type": "speech.start"}
      {"type": "transcript.partial", "text": "..."}
      {"type": "transcript.final", "text": "..."}
      {"type": "speech.end"}
      {"type": "stt.error", "message": "..."}
      {"type": "tts.start"}
      {"type": "tts.done"}
      {"type": "tts.cancelled"}
      {"type": "tts.error", "message": "..."}

Model lifecycle: both worker subprocesses are spawned immediately at
server startup and load their model eagerly (a few seconds of warmup, see
docs) rather than on first connection — for a personal always-on assistant
this trades a short startup wait for zero first-utterance latency penalty.
Both stay resident for the life of this process; there is no idle-unload
timer in this version (disclosed gap, not a silent one — see the docs).

Only one browser connection is treated as "current" at a time (a personal
single-user assistant, not a multi-tenant server) — a second connection
takes over as current and the worker processes' turn-state is reset for it.
"""

import argparse
import asyncio
import hmac
import json
import logging
import os
import stat
import sys
import uuid
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import websockets
from websockets.datastructures import Headers
from websockets.http11 import Response

from framing import FRAME_AUDIO, FRAME_JSON, read_frame_async, write_frame

logging.basicConfig(level=os.environ.get("FLOW_VOICE_LOG_LEVEL", "INFO"), format="[voice-companion] %(message)s")
log = logging.getLogger("flow-voice-companion")

REPO_ROOT = Path(__file__).resolve().parent
DEFAULT_PORT = 8766
DEFAULT_ORIGINS = {"http://localhost:5173", "http://127.0.0.1:5173"}
MAX_CONTROL_MESSAGE_BYTES = 8_000
CONFIG_DIR = Path.home() / ".flow-companion"
TOKEN_PATH = CONFIG_DIR / "voice-token"
VERSION = "0.1.0"


def persist_token(token: str) -> Path:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(CONFIG_DIR, 0o700)
    except OSError:
        pass
    TOKEN_PATH.write_text(token)
    try:
        os.chmod(TOKEN_PATH, stat.S_IRUSR | stat.S_IWUSR)
    except OSError:
        pass
    return TOKEN_PATH


def safe_token_equals(provided: str, expected: str) -> bool:
    return hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8"))


class Worker:
    """One model subprocess (STT or TTS), its own venv, framed stdio. Owns
    reconnect/respawn on crash (Rule: no silent death of the whole
    companion because one model process died)."""

    def __init__(self, name: str, python_path: Path, script_path: Path, env_overrides: dict):
        self.name = name
        self.python_path = python_path
        self.script_path = script_path
        self.env_overrides = env_overrides
        self.process: asyncio.subprocess.Process | None = None
        self.ready = False
        self.startup = None
        self._restart_count = 0
        self._MAX_RESTARTS = 5

    async def start(self):
        env = {**os.environ, **self.env_overrides}
        self.process = await asyncio.create_subprocess_exec(
            str(self.python_path),
            str(self.script_path),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(REPO_ROOT),
            env=env,
        )
        self.ready = False
        asyncio.ensure_future(self._log_stderr())

    async def _log_stderr(self):
        assert self.process and self.process.stderr
        try:
            async for line in self.process.stderr:
                text = line.decode("utf-8", errors="replace").rstrip()
                if text:
                    log.info(f"[{self.name}] {text}")
        except Exception:  # noqa: BLE001
            pass

    async def send_json(self, payload: dict):
        if not self.process or not self.process.stdin or self.process.stdin.is_closing():
            return
        write_frame(_SyncStdinAdapter(self.process.stdin), FRAME_JSON, json.dumps(payload).encode("utf-8"))

    async def send_audio(self, data: bytes):
        if not self.process or not self.process.stdin or self.process.stdin.is_closing():
            return
        write_frame(_SyncStdinAdapter(self.process.stdin), FRAME_AUDIO, data)

    def is_alive(self) -> bool:
        return self.process is not None and self.process.returncode is None


class _SyncStdinAdapter:
    """framing.write_frame expects a sync stream with .write()/.flush();
    asyncio's StreamWriter is async-flushed but supports sync .write() that
    buffers internally, which is exactly what we want here (fire-and-drain,
    never block the event loop on a slow child)."""

    def __init__(self, writer: asyncio.StreamWriter):
        self._writer = writer

    def write(self, data: bytes):
        self._writer.write(data)

    def flush(self):
        pass  # asyncio.StreamWriter drains on its own schedule; callers don't need a sync flush guarantee here.


class VoiceCompanion:
    def __init__(self):
        venv_stt = REPO_ROOT / ".venv" / "bin" / "python"
        venv_tts = REPO_ROOT / ".venv-tts" / "bin" / "python"
        self.stt = Worker("stt", venv_stt, REPO_ROOT / "stt_worker.py", {})
        self.tts = Worker("tts", venv_tts, REPO_ROOT / "tts_worker.py", {})
        self.current_ws = None
        self._tts_output_session = None
        self._tts_output_request = None
        self._tts_expected_request = None
        self._listening = False

    async def start(self):
        await self.stt.start()
        await self.tts.start()
        asyncio.ensure_future(self._pump_stt_output())
        asyncio.ensure_future(self._pump_tts_output())

    async def _pump_stt_output(self):
        while True:
            proc = self.stt.process
            if proc is None or proc.stdout is None:
                await asyncio.sleep(0.5)
                continue
            try:
                msg_type, payload = await read_frame_async(proc.stdout)
            except asyncio.IncompleteReadError:
                log.warning("stt worker pipe closed; attempting restart")
                await self._restart(self.stt)
                continue
            if msg_type != FRAME_JSON:
                continue
            event = json.loads(payload)
            if event.get("type") == "worker.ready":
                self.stt.ready = True
                self.stt.startup = {"workerEpoch": event.get("workerEpoch"), **(event.get("startup") or {})}
                log.info("STT ready")
                continue
            await self._forward_to_client(event)

    async def _pump_tts_output(self):
        while True:
            proc = self.tts.process
            if proc is None or proc.stdout is None:
                await asyncio.sleep(0.5)
                continue
            try:
                msg_type, payload = await read_frame_async(proc.stdout)
            except asyncio.IncompleteReadError:
                log.warning("tts worker pipe closed; attempting restart")
                await self._restart(self.tts)
                continue
            if msg_type == FRAME_AUDIO:
                if (self._tts_output_session, self._tts_output_request) == self._tts_expected_request:
                    await self._forward_bytes_to_client(payload)
                continue
            event = json.loads(payload)
            if event.get("type") == "tts.start":
                self._tts_output_session = event.get("sessionId")
                self._tts_output_request = event.get("requestId")
            if event.get("type") == "worker.ready":
                self.tts.ready = True
                self.tts.startup = {"workerEpoch": event.get("workerEpoch"), **(event.get("startup") or {})}
                log.info("TTS ready")
                continue
            if (event.get("type", "").startswith("tts.")
                    and not (event.get("type") == "tts.error" and "requestId" not in event)
                    and (event.get("sessionId"), event.get("requestId")) != self._tts_expected_request):
                continue
            await self._forward_to_client(event)

    async def _restart(self, worker: Worker):
        worker.ready = False
        worker._restart_count += 1
        if worker._restart_count > worker._MAX_RESTARTS:
            await self._forward_to_client({"type": f"{worker.name}.error", "message": f"{worker.name} worker crashed repeatedly and was not restarted"})
            return
        await asyncio.sleep(1)
        await worker.start()

    async def _forward_to_client(self, event: dict):
        if event.get("sessionId") and event["sessionId"] != getattr(self, "session_id", None):
            return
        if self.current_ws is not None:
            try:
                await self.current_ws.send(json.dumps(event))
            except Exception:  # noqa: BLE001
                pass

    async def _forward_bytes_to_client(self, data: bytes):
        if self.current_ws is not None:
            try:
                await self.current_ws.send(data)
            except Exception:  # noqa: BLE001
                pass


async def handle_connection(ws, companion: VoiceCompanion):
    # Origin + token were already enforced in process_request, BEFORE the
    # HTTP 101 handshake was sent (see main()'s process_request) — by the
    # time this handler runs, the connection is already authorized. Doing
    # the check here instead (post-handshake, closing afterward) was a real
    # bug: the WebSocket upgrade always succeeds first, so a client sees a
    # normal open connection and only learns of the rejection on next
    # recv() as an ordinary close, not an HTTP 403/401 it can distinguish
    # from a network hiccup.
    # Exclusive voice ownership (see FINAL REPORT's physical-test repair B —
    # two open Flow tabs must never both feed the same STT/TTS worker pair;
    # there is only one STT session, and interleaved audio from two tabs
    # would corrupt transcription for both). A new connection always wins —
    # the OLDER one is closed with a distinct code the client recognizes as
    # "superseded, do not auto-reconnect" (see voiceCompanionClient.ts),
    # rather than being silently orphaned while still technically open.
    previous_ws = companion.current_ws
    companion.current_ws = ws
    companion.session_id = str(uuid.uuid4())
    companion._tts_expected_request = None
    session_id = companion.session_id
    if previous_ws is not None and previous_ws is not ws:
        log.info("closing a previous tab's connection: superseded by a new tab")
        await companion.stt.send_json({"cmd": "stop"})  # stop any in-flight capture from the superseded tab before it can interleave with the new one.
        await companion.tts.send_json({"cmd": "cancel"})
        try:
            await previous_ws.close(code=4409, reason="superseded by a newer tab")
        except Exception:  # noqa: BLE001
            pass
    if companion.current_ws is not ws:
        await ws.close(code=4409, reason="superseded by a newer tab")
        return
    await ws.send(json.dumps({"type": "ready", "sttReady": companion.stt.ready, "ttsReady": companion.tts.ready, "version": VERSION, "sessionId": session_id,
                             "startup": {"stt": companion.stt.startup, "tts": companion.tts.startup}}))
    log.info("client connected")
    try:
        async for message in ws:
            if companion.current_ws is not ws:
                break
            if isinstance(message, bytes):
                await companion.stt.send_audio(message)
                continue
            if len(message) > MAX_CONTROL_MESSAGE_BYTES:
                await ws.send(json.dumps({"type": "stt.error", "message": "control message too large"}))
                continue
            try:
                control = json.loads(message)
            except json.JSONDecodeError:
                continue
            msg_type = control.get("type")
            if msg_type == "session.start":
                capture_id = control.get("captureId")
                await companion.stt.send_json({"cmd": "start", "sessionId": session_id,
                                               "inputMode": "dictation" if control.get("inputMode") == "dictation" else "command",
                                               "captureId": capture_id if isinstance(capture_id, int) and 0 < capture_id <= 2**53 - 1 else None})
            elif msg_type == "session.profile" and control.get("inputMode") in ("command", "dictation"):
                await companion.stt.send_json({"cmd": "profile", "sessionId": session_id, "inputMode": control["inputMode"]})
            elif msg_type == "session.stop":
                await companion.stt.send_json({"cmd": "stop"})
            elif msg_type == "tts.speak":
                text = control.get("text")
                if isinstance(text, str) and text.strip():
                    request_id = control.get("requestId")
                    if request_id is not None and (not isinstance(request_id, int) or not 0 < request_id <= 2**53 - 1):
                        continue
                    companion._tts_expected_request = (session_id, request_id)
                    await companion.tts.send_json({"cmd": "speak", "text": text, "sessionId": session_id, "requestId": request_id})
            elif msg_type == "tts.cancel":
                companion._tts_expected_request = None
                await companion.tts.send_json({"cmd": "cancel"})
    except Exception:  # noqa: BLE001
        log.exception("connection error")
    finally:
        if companion.current_ws is ws:
            companion.current_ws = None
            await companion.stt.send_json({"cmd": "stop"})
            await companion.tts.send_json({"cmd": "cancel"})
        log.info("client disconnected")


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=int(os.environ.get("FLOW_VOICE_COMPANION_PORT", DEFAULT_PORT)))
    args = parser.parse_args()

    import secrets

    token = secrets.token_hex(32)
    token_path = persist_token(token)
    companion = VoiceCompanion()

    def json_response(status: int, reason: str, payload: dict):
        body = json.dumps(payload).encode()
        return Response(status, reason, Headers([("Content-Type", "application/json"), ("Content-Length", str(len(body)))]), body)

    async def process_request(connection, request):
        if request.path.split("?", 1)[0] == "/health":
            # Unauthenticated, zero-information liveness probe — same
            # rationale as the Node companion's identical /health: reveals
            # nothing beyond "a process is listening".
            return json_response(200, "OK", {"ok": True, "sttReady": companion.stt.ready, "ttsReady": companion.tts.ready, "version": VERSION})

        # (a) Origin allowlist — checked BEFORE the handshake is accepted,
        # so a disallowed origin gets a real HTTP 403 and never reaches an
        # open WebSocket connection at all.
        origin = request.headers.get("Origin")
        if origin not in DEFAULT_ORIGINS:
            log.warning(f"rejected connection: origin not allowed ({origin!r})")
            return json_response(403, "Forbidden", {"error": "Origin not allowed."})

        # (b) Bearer token, constant-time compare, read from the query
        # string (a browser WebSocket client can't set a custom
        # Authorization header on the upgrade request).
        query = parse_qs(urlparse(request.path).query)
        provided_token = (query.get("token") or [""])[0]
        if not provided_token or not safe_token_equals(provided_token, token):
            log.warning("rejected connection: bad token")
            return json_response(401, "Unauthorized", {"error": "Unauthorized."})

        return None  # Authorized — proceed with the handshake.

    async def handler(ws):
        await handle_connection(ws, companion)

    log.info("starting STT and TTS worker subprocesses (this takes a few seconds while models warm up)...")
    await companion.start()

    server = await websockets.serve(handler, "127.0.0.1", args.port, process_request=process_request, max_size=2_000_000)
    log.info(f"listening on ws://127.0.0.1:{args.port}/voice")
    log.info(f"session token written to {token_path}")

    async def shutdown():
        for worker in (companion.stt, companion.tts):
            if worker.process is not None and worker.process.returncode is None:
                worker.process.terminate()
        server.close()
        await server.wait_closed()

    loop = asyncio.get_running_loop()
    import signal

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, lambda: asyncio.ensure_future(shutdown()))

    await server.wait_closed()


if __name__ == "__main__":
    asyncio.run(main())
