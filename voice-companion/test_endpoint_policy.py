import unittest
from endpoint import Endpoint
from endpoint_policy import EndpointPolicy


class EndpointPolicyTests(unittest.TestCase):
    def test_pause_matrix_for_incomplete_commands_and_dictation(self):
        for mode, text in [("command", "Move dinner to"), ("command", "Actually..."), ("dictation", "A complete sentence.")]:
            for pause in [200, 350, 500, 750, 1000, 1500]:
                with self.subTest(mode=mode, text=text, pause=pause):
                    policy = EndpointPolicy(mode)
                    policy.observe(text, 800)
                    endpoint = Endpoint(silence_ms=policy.select(880)[1], calibration_ms=0)
                    endpoint.feed(.1, 800)
                    self.assertNotIn("endpoint.detected", endpoint.feed(0, pause))
                    self.assertTrue(endpoint.active)
                    self.assertNotIn("endpoint.detected", endpoint.feed(.1, 80))

    def test_four_profiles_and_appropriate_completion_pauses(self):
        for mode, text, profile, silence in [("command", "Confirm.", "CLOSED_REPLY", 240),
                ("command", "Open Journal.", "SHORT_COMMAND", 400),
                ("command", "Move dinner to Sunday.", "NORMAL_COMMAND", 640),
                ("dictation", "Confirm.", "DICTATION", 1760)]:
            with self.subTest(profile=profile):
                policy = EndpointPolicy(mode)
                policy.observe(text, 800)
                self.assertEqual(policy.select(880), (profile, silence))
                endpoint = Endpoint(silence_ms=silence, calibration_ms=0)
                endpoint.feed(.1, 800)
                self.assertNotIn("endpoint.detected", endpoint.feed(0, silence - 80))
                self.assertIn("endpoint.detected", endpoint.feed(0, 80))

    def test_ambiguous_affirmation_and_revised_partial_are_not_closed_replies(self):
        policy = EndpointPolicy()
        for text in ["Yeah...", "Yes, actually", "Confirmation", "No, keep the other one"]:
            policy.observe(text, 800)
            self.assertNotEqual(policy.select(1000)[0], "CLOSED_REPLY")

    def test_bare_fragment_needs_boundary_or_stability_and_reset_forgets_it(self):
        policy = EndpointPolicy()
        policy.observe("confirm", 800)
        self.assertNotEqual(policy.select(880)[0], "CLOSED_REPLY")
        self.assertEqual(policy.select(960)[0], "CLOSED_REPLY")
        policy.reset()
        self.assertEqual(policy.select(1100), ("NORMAL_COMMAND", 960))

    def test_wake_envelope_does_not_change_endpoint_content_classification(self):
        policy = EndpointPolicy()
        policy.observe("Hey Flow, open Calendar.", 800)
        self.assertEqual(policy.select(880), ("SHORT_COMMAND", 400))


if __name__ == "__main__":
    unittest.main()
