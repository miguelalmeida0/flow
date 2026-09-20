import unittest
from endpoint import Endpoint


class EndpointTests(unittest.TestCase):
    def ready(self, **options):
        endpoint = Endpoint(**options)
        for _ in range(3):
            endpoint.feed(0, 80)
        return endpoint

    def test_short_pauses_and_resumption(self):
        for pause in (200, 500, 900):
            endpoint = self.ready()
            endpoint.feed(.02, 80)
            self.assertNotIn("endpoint.detected", endpoint.feed(0, pause))
            self.assertNotIn("endpoint.detected", endpoint.feed(.02, 80))
            self.assertIn("endpoint.detected", endpoint.feed(0, 960))

    def test_one_endpoint(self):
        endpoint = self.ready()
        endpoint.feed(.02, 80)
        events = []
        for _ in range(20):
            events += endpoint.feed(0, 80)
        self.assertEqual(events.count("endpoint.detected"), 1)

    def test_floor_and_cancel(self):
        endpoint = self.ready()
        for _ in range(100):
            self.assertEqual(endpoint.feed(1 / 32768, 80), [])
        endpoint.feed(.02, 80)
        endpoint.reset()
        self.assertEqual(endpoint.feed(0, 1500), [])

    def test_maximum(self):
        endpoint = self.ready(max_ms=1000)
        endpoint.feed(.02, 80)
        self.assertIn("endpoint.detected", endpoint.feed(.02, 1000))

    def test_measured_background_floor_does_not_hold_speech_open(self):
        endpoint = Endpoint()
        for _ in range(3):
            self.assertEqual(endpoint.feed(.001, 80), [])
        for _ in range(30):
            self.assertEqual(endpoint.feed(.0012, 80), [])
        self.assertIn("speech.start", endpoint.feed(.02, 80))
        self.assertIn("endpoint.detected", endpoint.feed(.0011, 1500))


if __name__ == '__main__':
    unittest.main()
