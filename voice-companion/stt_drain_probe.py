"""Paired drain experiment using real fixture PCM and the production decoder.

Auxiliary evidence only: the microphone autopilot must replay a retained policy.
Every candidate sees the same voiced PCM and the same 960 ms endpoint policy.
"""
import argparse
from collections import deque
import json
from pathlib import Path
import time
import wave

import numpy as np
from decoder_pcm import DecoderPcm, align_preroll
from endpoint import Endpoint
from stt_worker import load_model, new_generator, step


def utterances(pcm, silence_ms=960):
    endpoint = Endpoint(silence_ms=silence_ms)
    preroll = deque(maxlen=7)
    chunks = []
    for offset in range(0, len(pcm) - 1919, 1920):
        block = pcm[offset:offset + 1920]
        changes = endpoint.feed(float(np.sqrt(np.mean(block ** 2))), 80)
        if "speech.start" in changes:
            chunks = list(preroll)
        if endpoint.active or "endpoint.detected" in changes:
            chunks.append(block)
        if "endpoint.detected" in changes:
            yield chunks, endpoint.threshold, int((endpoint.clock_ms - endpoint.last_speech_ms) / 80)
            chunks = []
        preroll.append(block)


def decode(bundle, chunks, threshold, quiet, policy):
    gen = new_generator(bundle)
    text = ""
    silent_steps = 0
    frames = 0

    def advance(block):
        nonlocal text, silent_steps, frames
        piece, _ = step(bundle, gen, block)
        frames += 1
        if piece:
            text += piece
            silent_steps = 0
        else:
            silent_steps += 1

    stream = DecoderPcm()
    aligned = align_preroll(chunks, threshold)
    for block in stream.push(aligned):
        advance(block)
    before = text
    started = time.perf_counter()
    for block in stream.finish():
        advance(block)
    count = bundle["drain_blocks"]
    if policy != "full" and text.strip():
        count = 0 if policy == "stable" and quiet >= 7 and silent_steps >= 7 else 7
    for _ in range(count):
        advance(np.zeros(1920, dtype=np.float32))
    retry = False
    # Match the live worker's established bounded empty-short recovery.
    if not text.strip() and len(chunks) <= 50:
        pcm = np.concatenate(chunks)
        voiced = np.flatnonzero(np.abs(pcm) > threshold)
        if len(voiced):
            retry = True
            pcm = pcm[max(0, int(voiced[0]) - 480):]
            pcm = np.pad(pcm, (0, bundle["drain_blocks"] * 1920 + (-len(pcm) % 1920)))
            gen = new_generator(bundle)
            for block in pcm.reshape(-1, 1920):
                advance(block)
    return {"policy": policy, "beforeDrain": before.strip(), "text": text.strip(), "drainBlocks": count,
            "quietBlocks": quiet, "retry": retry, "frames": frames, "drainMs": (time.perf_counter() - started) * 1000}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fixtures", type=Path, nargs="+", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--silence-ms", type=int, default=960)
    parser.add_argument("--baseline", type=Path)
    args = parser.parse_args()
    bundle = load_model()
    baseline = json.loads(args.baseline.read_text()) if args.baseline else None
    report = {"coverage": "Auxiliary real-PCM paired drain experiment, not microphone latency", "silenceMs": args.silence_ms, "turns": [], "failures": 0, "status": "RUNNING"}
    try:
        for file in args.fixtures:
            with wave.open(str(file)) as f:
                assert (f.getframerate(), f.getnchannels(), f.getsampwidth()) == (24000, 1, 2)
                pcm = np.frombuffer(f.readframes(f.getnframes()), dtype=np.int16).astype(np.float32) / 32768
            for index, (chunks, threshold, quiet) in enumerate(utterances(pcm, args.silence_ms)):
                trials = [decode(bundle, chunks, threshold, quiet, policy) for policy in ("full", "seven", "stable")]
                for trial in trials:
                    trial["matchesFullText"] = trial["text"] == trials[0]["text"]
                    if baseline:
                        prior = next((t for t in baseline["turns"] if t["file"] == str(file) and t["utterance"] == index + 1), None)
                        trial["matchesBaselineText"] = prior is not None and trial["text"] == prior["trials"][0]["text"]
                report["failures"] += sum(not t["matchesFullText"] for t in trials)
                report["failures"] += sum(t.get("matchesBaselineText") is False for t in trials)
                report["turns"].append({"file": str(file), "utterance": index + 1, "trials": trials})
                args.output.write_text(json.dumps(report, indent=2))
                print(json.dumps(report["turns"][-1]), flush=True)
        if baseline:
            expected = sum(t["file"] in [str(f) for f in args.fixtures] for t in baseline["turns"])
            if len(report["turns"]) != expected:
                report["failures"] += 1
                report["error"] = f"Utterance count changed: expected {expected}, observed {len(report['turns'])}"
        report["status"] = "FAIL" if report["failures"] or not report["turns"] else "PASS"
    except Exception as error:
        report.update(status="FAIL", error=str(error), failures=report["failures"] + 1)
        raise
    finally:
        args.output.write_text(json.dumps(report, indent=2))
    if report["status"] != "PASS":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
