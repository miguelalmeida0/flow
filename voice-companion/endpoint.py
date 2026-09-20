"""PCM-time utterance endpoint; model-independent and shared by live capture/tests."""
from collections import deque
import math


class Endpoint:
    def __init__(self, silence_ms=960, max_ms=120000, calibration_ms=240):
        self.silence_ms = silence_ms
        self.max_ms = max_ms
        self.clock_ms = 0
        self.noise = deque([1 / 32768], maxlen=25)
        self.active = False
        self.quiet_ms = 0
        self.started_ms = 0
        self.last_speech_ms = 0
        # Capture starts before listening; learn three native 80ms blocks of
        # device noise rather than assuming every real microphone is digital zero.
        self.calibration_ms = calibration_ms

    @property
    def threshold(self):
        # Estimate the quiet floor; require 12 dB separation and at least
        # four PCM16 quantization levels. Quiet calibration is frozen in speech.
        return max(4 / 32768, sorted(self.noise)[len(self.noise) // 2] * 4)

    def reset(self):
        self.active = False
        self.quiet_ms = 0

    def feed(self, rms, duration_ms):
        self.clock_ms += duration_ms
        events = []
        if self.clock_ms <= self.calibration_ms:
            if math.isfinite(rms) and rms >= 0:
                self.noise.append(rms)
            return events
        voiced = math.isfinite(rms) and rms > self.threshold
        if not self.active:
            if not voiced:
                self.noise.append(rms)
                return events
            self.active = True
            self.started_ms = self.clock_ms - duration_ms
            events.append("speech.start")
        if voiced:
            self.last_speech_ms = self.clock_ms
            self.quiet_ms = 0
        else:
            if not self.quiet_ms:
                events.append("audio.silenceStart")
            self.quiet_ms += duration_ms
        if self.quiet_ms >= self.silence_ms or self.clock_ms - self.started_ms >= self.max_ms:
            events.append("endpoint.detected")
            self.reset()
        return events
