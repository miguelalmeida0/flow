import asyncio
import json
import unittest
from auth import authenticate


class Socket:
    def __init__(self, message):
        self.message = message

    async def recv(self):
        return self.message


class AuthTests(unittest.IsolatedAsyncioTestCase):
    async def test_accepts_only_exact_token_and_message_type(self):
        self.assertTrue(await authenticate(Socket(json.dumps({'type': 'authenticate', 'token': 'test-token'})), 'test-token'))
        for value in ['wrong', '', None, 123, {'nested': 'test-token'}]:
            self.assertFalse(await authenticate(Socket(json.dumps({'type': 'authenticate', 'token': value})), 'test-token'))
        self.assertFalse(await authenticate(Socket(json.dumps({'type': 'session.start', 'token': 'test-token'})), 'test-token'))

    async def test_rejects_binary_malformed_nonobject_and_oversized_auth(self):
        for raw in [b'PCM', '{', '[]', 'null', '"value"', 'x' * 513, 'é' * 257]:
            self.assertFalse(await authenticate(Socket(raw), 'test-token'))

    async def test_authentication_has_a_deadline(self):
        class Silent:
            async def recv(self):
                await asyncio.sleep(60)
        self.assertFalse(await authenticate(Silent(), 'test-token', timeout=0.01))
