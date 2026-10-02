"""Real fixture PCM equivalence/soak for the codec; not the microphone benchmark."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import resource
import os
import subprocess
import sys
import time
import wave

import numpy as np
import rustymimi


def distribution(values):
    values = sorted(values)
    return {"min": values[0], "p50": values[math.ceil(len(values) * .5) - 1],
            "p95": values[math.ceil(len(values) * .95) - 1], "max": values[-1], "n": len(values)}


def pcm_blocks(file):
    with wave.open(str(file)) as f:
        assert (f.getframerate(), f.getnchannels(), f.getsampwidth()) == (24000, 1, 2)
        pcm = np.frombuffer(f.readframes(f.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    pcm = np.pad(pcm, (0, (-len(pcm)) % 1920))
    return [pcm[i:i + 1920][None, None, :] for i in range(0, len(pcm), 1920)]


def encode(codec, blocks):
    output = []
    for block in blocks:
        tokens = codec.encode_step(block)
        if tokens is not None:
            output.append(np.asarray(tokens).copy())
    return np.concatenate(output, axis=-1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--weights", type=Path, required=True)
    parser.add_argument("--fixtures", type=Path, nargs="+", required=True)
    parser.add_argument("--turns", type=int, default=100)
    parser.add_argument("--reset-method", choices=["reset", "reset_complete", "reset_complete_v2"], default="reset_complete_v2")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--baseline", type=Path)
    args = parser.parse_args()
    if args.turns < 2:
        parser.error("At least two turns required")
    fixtures = [pcm_blocks(f) for f in args.fixtures]
    construction = []
    expected = []
    report = {"coverage": "Offline real fixture PCM through native Mimi codec; not microphone latency", "resetMethod": args.reset_method,
              "fixtures": [hashlib.sha256(f.read_bytes()).hexdigest() for f in args.fixtures], "turns": [], "failures": 0, "freshTokenDigests": []}
    started = time.perf_counter()
    cpu = time.process_time()
    for blocks in fixtures:
        at = time.perf_counter()
        codec = rustymimi.Tokenizer(str(args.weights), num_codebooks=32)
        construction.append((time.perf_counter() - at) * 1000)
        expected.append(encode(codec, blocks))
        report["freshTokenDigests"].append(hashlib.sha256(expected[-1].tobytes()).hexdigest())
        del codec
    if args.baseline:
        baseline = json.loads(args.baseline.read_text())
        if baseline["fixtures"] != report["fixtures"]:
            raise ValueError("Baseline fixture identities differ")
        report["matchesOriginalFresh"] = baseline["freshTokenDigests"] == report["freshTokenDigests"]
        report["failures"] += int(not report["matchesOriginalFresh"])
    codec = rustymimi.Tokenizer(str(args.weights), num_codebooks=32)
    reset = getattr(codec, args.reset_method)
    for turn in range(args.turns):
        index = turn % len(fixtures)
        at = time.perf_counter()
        reset()
        setup = (time.perf_counter() - at) * 1000
        at = time.perf_counter()
        actual = encode(codec, fixtures[index])
        encode_ms = (time.perf_counter() - at) * 1000
        rss = int(subprocess.check_output(["ps", "-o", "rss=", "-p", str(os.getpid())], text=True).strip()) * 1024
        matches = np.array_equal(actual, expected[index])
        report["failures"] += int(not matches)
        report["turns"].append({"turn": turn + 1, "fixture": index, "resetMs": setup,
                                "encodeMs": encode_ms, "matchesFresh": matches, "rssBytes": rss,
                                "tokenDigest": hashlib.sha256(actual.tobytes()).hexdigest(),
                                "maxRssBytes": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * (1 if sys.platform == "darwin" else 1024)})
        args.output.write_text(json.dumps(report, indent=2))
        print(f"turn {turn + 1}: {'PASS' if matches else 'FAIL'} reset={setup:.3f}ms", flush=True)
    report.update(constructionMs=distribution(construction), resetMs=distribution([t["resetMs"] for t in report["turns"]]),
                  encodeMs=distribution([t["encodeMs"] for t in report["turns"]]),
                  elapsedMs=(time.perf_counter() - started) * 1000, cpuMs=(time.process_time() - cpu) * 1000)
    args.output.write_text(json.dumps(report, indent=2))
    return int(report["failures"] != 0)


if __name__ == "__main__":
    sys.exit(main())
