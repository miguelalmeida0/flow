import unittest
import numpy as np
from decoder_pcm import DecoderPcm, align_preroll, BLOCK_SAMPLES, PREROLL_SAMPLES


class DecoderPcmTests(unittest.TestCase):
    def test_worklet_phase_does_not_change_decoder_speech(self):
        speech = np.sin(np.arange(4900, dtype=np.float32) / 7) * .1
        speech[0] = .01
        results = []
        for phase in (0, 128, 256, 512, 1024, 1792):
            original = np.concatenate((np.zeros(PREROLL_SAMPLES + phase, np.float32), speech))
            aligned = align_preroll([original], 4 / 32768)
            np.testing.assert_array_equal(aligned[PREROLL_SAMPLES:], speech)
            decoder = DecoderPcm()
            blocks = []
            for offset in range(0, len(aligned), 128):
                blocks.extend(decoder.push(aligned[offset:offset + 128]))
            blocks.extend(decoder.finish())
            results.append(np.concatenate(blocks))
        for result in results[1:]:
            np.testing.assert_array_equal(result, results[0])

    def test_short_preroll_keeps_every_sample(self):
        initial = np.array([0, 0, .02, .03, -.04], np.float32)
        aligned = align_preroll([initial], .001)
        np.testing.assert_array_equal(aligned[-len(initial):], initial)

    def test_final_word_remainder_is_padded_once(self):
        original = np.arange(BLOCK_SAMPLES + 23, dtype=np.float32)
        decoder = DecoderPcm()
        blocks = list(decoder.push(original)) + list(decoder.finish())
        result = np.concatenate(blocks)
        np.testing.assert_array_equal(result[:len(original)], original)
        self.assertTrue(np.all(result[len(original):] == 0))
        self.assertEqual(list(decoder.finish()), [])


if __name__ == "__main__":
    unittest.main()
