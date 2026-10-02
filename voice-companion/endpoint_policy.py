"""Read-only endpoint hints. A partial never grants command/proposal authority."""
import re

WORDS = re.compile(r"[a-z']+")
CLOSED = {"confirm", "yes", "no", "wait", "cancel", "never mind", "undo", "undo that", "redo", "redo that"}
INCOMPLETE = {"to", "on", "at", "for", "with", "from", "next", "last", "this", "actually", "uh", "um", "erm", "yeah"}
VIEWS = {"calendar", "journal", "home", "friends", "people", "tasks", "settings"}


class EndpointPolicy:
    def __init__(self, mode="command"):
        self.mode = mode
        self.reset()

    def reset(self):
        self.text = ""
        self.changed_at = 0
        self.boundary = False

    def observe(self, text, audio_ms):
        trimmed = text.strip().casefold()
        if trimmed != self.text:
            self.changed_at = audio_ms
        self.text = trimmed
        self.boundary = bool(text and (text[-1].isspace() or text[-1] in ".!?,;:"))

    def select(self, audio_ms):
        if self.mode == "dictation":
            return "DICTATION", 1760
        words = WORDS.findall(self.text)
        if words[:2] == ["hey", "flow"]:
            words = words[2:]
        elif words[:1] == ["flow"]:
            words = words[1:]
        if not words:
            return "NORMAL_COMMAND", 960
        phrase = " ".join(words)
        stable = self.boundary or audio_ms - self.changed_at >= 160
        if phrase in CLOSED and stable:
            return "CLOSED_REPLY", 240
        if words[-1] in INCOMPLETE or self.text.endswith("..."):
            return "NORMAL_COMMAND_INCOMPLETE", 1760
        if words[0] in {"move", "reschedule", "change"} and not {"to", "at", "on", "for"}.intersection(words):
            return "NORMAL_COMMAND_INCOMPLETE", 1760
        if stable and (phrase in {"go home", "what changed"}
                       or len(words) == 2 and words[0] in {"open", "show"} and words[1] in VIEWS
                       or len(words) == 3 and words[:2] == ["go", "to"] and words[2] in VIEWS):
            return "SHORT_COMMAND", 400
        return "NORMAL_COMMAND", 640
