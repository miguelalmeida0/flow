import unittest
from latest_speech import LatestSpeech


class LatestSpeechTest(unittest.TestCase):
    def test_burst_retains_only_latest_pending_request(self):
        queue = LatestSpeech()
        first = queue.replace("first", "session", 1)
        self.assertEqual(queue.take(), first)
        for i in range(2, 102):
            last = queue.replace(str(i), "session", i)
        self.assertFalse(queue.current(first))
        self.assertEqual(queue.take(), last)
        self.assertIsNone(queue.pending)

    def test_cancel_prevents_late_audio_and_does_not_reappear_on_next_turn(self):
        queue = LatestSpeech()
        old = queue.replace("old", "session", 1)
        queue.cancel()
        output = []
        self.assertFalse(queue.publish(old, lambda: output.append("old")))
        new = queue.replace("new", "session", 2)
        self.assertTrue(queue.publish(new, lambda: output.append("new")))
        self.assertEqual(output, ["new"])
        queue.close()
        self.assertIsNone(queue.take())


if __name__ == "__main__":
    unittest.main()
