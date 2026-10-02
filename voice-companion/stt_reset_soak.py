"""100-turn real-fixture decoder reset equivalence, separate from mic authority.

Fresh LmGen and transformer caches are required on every turn. This auxiliary
probe compares the entire deterministic token sequence, including silence, to
fresh codec references; it does not claim browser or physical microphone proof.
"""
import argparse
import json
from pathlib import Path
import subprocess
import os
import time
import wave

import numpy as np
from stt_worker import load_model, new_generator


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fixtures", type=Path, nargs="+", required=True)
    parser.add_argument("--turns", type=int, default=100)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--quantize", type=int, choices=[8], help="Isolated optional resource experiment; live workers are unchanged")
    parser.add_argument("--same-precision-reference", action="store_true", help="Also establish fresh references at the candidate precision before testing reset equivalence")
    args = parser.parse_args()
    at = time.perf_counter()
    bundle = load_model()
    report = {"modelLoadMs": (time.perf_counter() - at) * 1000, "expectedTurns": args.turns, "status": "RUNNING", "references": [], "turns": []}
    sequences = []
    for file in args.fixtures:
        with wave.open(str(file)) as f:
            assert (f.getframerate(), f.getnchannels(), f.getsampwidth()) == (24000, 1, 2)
            pcm = np.frombuffer(f.readframes(f.getnframes()), dtype=np.int16).astype(np.float32) / 32768
        voiced = np.flatnonzero(np.abs(pcm) > 4 / 32768)
        assert len(voiced)
        # Same onset-relative 560 ms context, followed by the established quiet
        # endpoint and complete drain. All original voiced samples are retained.
        pcm = np.pad(pcm[voiced[0]:voiced[-1] + 1], (13440, 23040 + 1920 * bundle["drain_blocks"]))
        sequences.append(np.pad(pcm, (0, -len(pcm) % 1920)))

    def decode(index, fresh):
        at = time.perf_counter()
        cpu = time.process_time()
        gen = new_generator(bundle, fresh_codec=fresh)
        setup = (time.perf_counter() - at) * 1000
        tokens = []
        encode_ms, generation_ms = [], []
        for block in sequences[index].reshape(-1, 1920):
            frame_at = time.perf_counter()
            codes = bundle["audio_tokenizer"].encode_step(block[None, None, :])
            encoded_at = time.perf_counter()
            array = bundle["mx"].array(codes).transpose(0, 2, 1)[:, :, :bundle["other_codebooks"]]
            tokens.append(int(gen.step(array[0])[0].item()))
            encode_ms.append((encoded_at - frame_at) * 1000)
            generation_ms.append((time.perf_counter() - encoded_at) * 1000)
        return {"fixture": str(args.fixtures[index]), "setupMs": setup, "totalMs": (time.perf_counter() - at) * 1000,
                "cpuMs": (time.process_time() - cpu) * 1000, "tokens": tokens,
                "encodeMs": encode_ms, "generationMs": generation_ms,
                "text": "".join(bundle["text_tokenizer"].id_to_piece(t).replace("▁", " ") for t in tokens if t not in (0, 3)).strip(),
                "rssKiB": int(subprocess.check_output(["ps", "-o", "rss=", "-p", str(os.getpid())])),
                "mlxActiveBytes": bundle["mx"].get_active_memory(), "mlxCacheBytes": bundle["mx"].get_cache_memory()}

    for index in range(len(sequences)):
        report["references"].append(decode(index, True))
    if args.quantize:
        import mlx.nn as nn
        at = time.perf_counter()
        before_bytes = bundle["mx"].get_active_memory()
        nn.quantize(bundle["model"], bits=args.quantize, group_size=64)
        bundle["mx"].eval(bundle["model"].parameters())
        bundle["model"].warmup()
        bundle["mx"].clear_cache()
        report["quantizationExperiment"] = {"bits": args.quantize, "groupSize": 64,
            "constructionMs": (time.perf_counter() - at) * 1000, "beforeActiveBytes": before_bytes,
            "afterActiveBytes": bundle["mx"].get_active_memory()}
        if args.same_precision_reference:
            report["originalPrecisionReferences"] = report["references"]
            report["references"] = [decode(index, True) for index in range(len(sequences))]
    for turn in range(args.turns):
        index = turn % len(sequences)
        try:
            row = decode(index, False)
        except Exception as error:
            report.update(status="FAIL", error=str(error), failedTurn=turn + 1, failures=report.get("failures", 0) + 1)
            args.output.write_text(json.dumps(report, indent=2))
            raise
        row["matchesFresh"] = row["tokens"] == report["references"][index]["tokens"]
        row["matchesFreshText"] = row["text"] == report["references"][index]["text"]
        report["turns"].append(row)
        report["failures"] = sum(not t["matchesFresh"] for t in report["turns"])
        args.output.write_text(json.dumps(report, indent=2))
        print(json.dumps({"turn": turn + 1, "matchesFresh": row["matchesFresh"], "setupMs": row["setupMs"], "text": row["text"]}), flush=True)
    report["status"] = "FAIL" if report["failures"] else "PASS"
    args.output.write_text(json.dumps(report, indent=2))
    if report["failures"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
