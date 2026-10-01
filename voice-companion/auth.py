"""Bounded first-message authentication; no credentials in request URLs."""
import asyncio
import hmac
import json


async def authenticate(ws, expected_token, timeout=3):
    try:
        raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
        if not isinstance(raw, str) or len(raw.encode('utf-8')) > 512:
            return False
        payload = json.loads(raw)
        if not isinstance(payload, dict) or payload.get('type') != 'authenticate':
            return False
        provided = payload.get('token')
        return isinstance(provided, str) and hmac.compare_digest(provided.encode(), expected_token.encode())
    except (ValueError, TimeoutError):
        return False
