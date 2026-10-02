"""Onset-relative decoder framing, independent of browser packet phase."""
import numpy as np

BLOCK_SAMPLES = 1920
PREROLL_SAMPLES = 7 * BLOCK_SAMPLES


def align_preroll(chunks, threshold):
    pcm = np.concatenate(chunks)
    voiced = np.flatnonzero(np.abs(pcm) > threshold)
    if not len(voiced):
        return pcm
    onset = int(voiced[0])
    # Retain the existing 560 ms of context before the first above-floor sample.
    # Only older quiet context is omitted. No post-onset sample is removed.
    start = max(0, onset - PREROLL_SAMPLES)
    missing = max(0, PREROLL_SAMPLES - onset)
    return np.pad(pcm[start:], (missing, 0)) if missing else pcm[start:]


class DecoderPcm:
    def __init__(self):
        self.pending = np.empty(0, dtype=np.float32)

    def push(self, chunk):
        pcm = np.concatenate((self.pending, chunk)) if len(self.pending) else chunk
        complete = len(pcm) // BLOCK_SAMPLES * BLOCK_SAMPLES
        self.pending = pcm[complete:]
        for offset in range(0, complete, BLOCK_SAMPLES):
            yield pcm[offset:offset + BLOCK_SAMPLES]

    def finish(self):
        if len(self.pending):
            final = np.pad(self.pending, (0, BLOCK_SAMPLES - len(self.pending)))
            self.pending = np.empty(0, dtype=np.float32)
            yield final
