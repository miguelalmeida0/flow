"""Tiny length-prefixed framing shared by server.py and the two model
workers (stt_worker.py, tts_worker.py), which run in separate venvs (see
docs/VOICE_COMPANION.md's "Why two virtual environments") and talk to the
server over plain stdio pipes. Every frame is a 1-byte type tag ('J' for a
JSON control/event message, 'A' for raw PCM16LE audio bytes) followed by a
4-byte big-endian length and the payload. Stdlib only — no third-party
dependency is shared across both venvs, so this file is the one thing
that's `cp`'d, not imported, into whichever venv needs it isn't
necessary since it has zero dependencies and works under any Python.
"""
import struct

FRAME_JSON = b"J"
FRAME_AUDIO = b"A"
MAX_FRAME_BYTES = 8_000_000  # Bounded: a single frame is never allowed to be unbounded.


def write_frame(stream, msg_type: bytes, payload: bytes) -> None:
    if len(payload) > MAX_FRAME_BYTES:
        raise ValueError(f"frame too large: {len(payload)} bytes")
    stream.write(msg_type)
    stream.write(struct.pack(">I", len(payload)))
    stream.write(payload)
    stream.flush()


def read_frame(stream):
    """Blocking read of one frame from a buffered binary stream. Returns
    (msg_type, payload) or (None, None) at EOF."""
    header = stream.read(1)
    if not header:
        return None, None
    length_bytes = stream.read(4)
    if len(length_bytes) < 4:
        return None, None
    (length,) = struct.unpack(">I", length_bytes)
    if length > MAX_FRAME_BYTES:
        raise ValueError(f"frame too large: {length} bytes")
    payload = bytearray()
    while len(payload) < length:
        chunk = stream.read(length - len(payload))
        if not chunk:
            break
        payload.extend(chunk)
    return header, bytes(payload)


async def read_frame_async(stream_reader):
    """Async variant for asyncio.StreamReader (used by server.py reading a
    worker subprocess's stdout)."""
    header = await stream_reader.readexactly(1)
    length_bytes = await stream_reader.readexactly(4)
    (length,) = struct.unpack(">I", length_bytes)
    if length > MAX_FRAME_BYTES:
        raise ValueError(f"frame too large: {length} bytes")
    payload = await stream_reader.readexactly(length) if length else b""
    return header, payload
