import unittest
from tts_text import speech_chunks


class SpeechChunksTest(unittest.TestCase):
    def test_first_sentence_is_playable_before_the_rest(self):
        self.assertEqual(list(speech_chunks("Dinner moved to Sunday. Your workout stays clear.")),
                         ["Dinner moved to Sunday.", "Your workout stays clear."])

    def test_names_abbreviations_and_decimal_values_stay_intact(self):
        text = "Dr. Smith owes 3.5 dollars. J. Doe is visiting the U.S. Embassy."
        self.assertEqual(list(speech_chunks(text)),
                         ["Dr. Smith owes 3.5 dollars.", "J. Doe is visiting the U.S. Embassy."])

    def test_no_words_are_dropped_or_rewritten(self):
        text = "Is that right? Yes!\nNext paragraph, with a pause."
        chunks = list(speech_chunks(text))
        self.assertEqual(" ".join(chunks).split(), text.split())
        self.assertEqual(len(chunks), 3)


if __name__ == "__main__":
    unittest.main()
