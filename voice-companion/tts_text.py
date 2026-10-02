"""Natural sentence units; preserve every word and punctuation mark."""
import re

BOUNDARY = re.compile(r"(?<=[.!?])\s+(?=[\"“]?[A-Z0-9])|\n+")
ABBREVIATIONS = {"mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "vs", "etc", "e.g", "i.e"}


def speech_chunks(text):
    start = 0
    for match in BOUNDARY.finditer(text):
        prefix = text[start:match.start()]
        last = prefix.split()[-1] if prefix.split() else ""
        stem = last.rstrip(".").casefold()
        # Initials, dotted abbreviations and titles belong with the next word.
        if "\n" not in match.group() and last.endswith(".") and (
            stem in ABBREVIATIONS or len(stem) == 1 or "." in stem
        ):
            continue
        if prefix.strip():
            yield prefix.strip()
        start = match.end()
    if text[start:].strip():
        yield text[start:].strip()
