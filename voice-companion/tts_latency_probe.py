"""Auxiliary Kokoro causal probe. No playback or acoustic claims.

Each invocation owns a fresh model process. Run candidates sequentially without
the browser benchmark to avoid contaminating either resource distribution.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import resource
import time

import numpy as np


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=["original", "voice-cache", "allocator-cache", "phrases"], required=True)
    parser.add_argument("--samples", type=int, default=10)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    import mlx.core as mx
    from mlx_audio.tts.utils import load_model
    at = time.perf_counter()
    model = load_model(os.environ.get("FLOW_TTS_MODEL", "mlx-community/Kokoro-82M-8bit"))
    report = {"mode": args.mode, "modelLoadMs": (time.perf_counter() - at) * 1000, "turns": []}
    # Bound the allocator explicitly; retained temporary buffers are not KV or
    # conversational state. Voice-cache alone still clears after every segment.
    if args.mode in ("allocator-cache", "phrases"):
        mx.set_cache_limit(128 * 1024 * 1024)
    texts = ["Calendar.", "Here is your day. Dinner is at seven, and your workout is at six.",
             "Deleted that Journal entry. You can undo it."]
    for index in range(args.samples):
        text = texts[index % len(texts)]
        at = time.perf_counter()
        cpu = time.process_time()
        row = {"index": index, "text": text, "coldProcessFirstSynthesis": index == 0, "chunks": []}
        if args.mode == "original":
            audio = (r.audio for r in model.generate(text=text, voice="af_heart", speed=1, stream=False))
        else:
            pipeline = model._get_pipeline("a")
            pattern = r"(?<=[.!?])\s+|\n+" if args.mode == "phrases" else r"\n+"
            audio = (r.audio[0] for r in pipeline(text, voice="af_heart", speed=1, split_pattern=pattern))
        for chunk in audio:
            pcm = (np.clip(np.asarray(chunk), -1, 1) * 32767).astype(np.int16)
            row["chunks"].append({"readyMs": (time.perf_counter() - at) * 1000, "samples": len(pcm), "sha256": hashlib.sha256(pcm.tobytes()).hexdigest()})
            if args.mode == "voice-cache":
                mx.clear_cache()
        row.update(totalMs=(time.perf_counter() - at) * 1000, cpuMs=(time.process_time() - cpu) * 1000,
                   activeBytes=mx.get_active_memory(), cacheBytes=mx.get_cache_memory(), peakBytes=mx.get_peak_memory(),
                   processPeakRssBytes=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)
        report["turns"].append(row)
        args.output.write_text(json.dumps(report, indent=2))
        print(json.dumps({"mode": args.mode, "index": index, "firstMs": row["chunks"][0]["readyMs"], "totalMs": row["totalMs"]}), flush=True)


if __name__ == "__main__":
    main()
