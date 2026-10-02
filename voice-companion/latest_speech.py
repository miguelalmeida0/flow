"""One running synthesis and at most one pending replacement, never a thread queue."""
from dataclasses import dataclass
from threading import Condition
import time


@dataclass(frozen=True)
class SpeechRequest:
    generation: int
    text: str
    session_id: str | None
    request_id: int | None
    received_at: float


class LatestSpeech:
    def __init__(self):
        self.condition = Condition()
        self.generation = 0
        self.pending = None
        self.closed = False

    def replace(self, text, session_id, request_id):
        with self.condition:
            self.generation += 1
            self.pending = SpeechRequest(self.generation, text, session_id, request_id, time.monotonic())
            self.condition.notify()
            return self.pending

    def cancel(self):
        with self.condition:
            self.generation += 1
            self.pending = None

    def take(self):
        with self.condition:
            self.condition.wait_for(lambda: self.pending is not None or self.closed)
            result, self.pending = self.pending, None
            return result

    def current(self, request):
        with self.condition:
            return not self.closed and request.generation == self.generation

    def publish(self, request, output):
        # Serialize the final current-generation check with cancellation. No
        # model inference runs under this lock, only bounded framed output.
        with self.condition:
            if self.closed or request.generation != self.generation:
                return False
            output()
            return True

    def close(self):
        with self.condition:
            self.closed = True
            self.pending = None
            self.condition.notify_all()
