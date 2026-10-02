"""Replay captured digital fixture PCM at the production endpoint/decoder seam.

This isolates packet phase and construction/encode/generation cost. It is an
auxiliary causal probe, never a replacement for the real microphone benchmark.
"""
import argparse
from collections import deque
import json
from pathlib import Path
import time
import wave

import numpy as np
from endpoint import Endpoint
from stt_worker import load_model, new_generator, STT_BLOCK_SAMPLES


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fixtures", type=Path, nargs="+", required=True)
    parser.add_argument("--align", type=int, action="append", help="Experimental onset-relative preroll in milliseconds; repeat for a matrix")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    loaded = time.perf_counter()
    bundle = load_model()
    report = {"modelLoadMs": (time.perf_counter() - loaded) * 1000, "alignMs": args.align, "turns": []}
    for file in args.fixtures:
        with wave.open(str(file)) as f:
            assert (f.getframerate(), f.getnchannels(), f.getsampwidth()) == (24000, 1, 2)
            pcm = np.frombuffer(f.readframes(f.getnframes()), dtype=np.int16).astype(np.float32) / 32768
        endpoint = Endpoint()
        preroll = deque(maxlen=7)
        sequence = []
        for i in range(0, len(pcm) - STT_BLOCK_SAMPLES + 1, STT_BLOCK_SAMPLES):
            block = pcm[i:i + STT_BLOCK_SAMPLES]
            transitions = endpoint.feed(float(np.sqrt(np.mean(block ** 2))), 80)
            if "speech.start" in transitions:
                sequence = list(preroll)
            if endpoint.active or "endpoint.detected" in transitions:
                sequence.append(block)
            else:
                preroll.append(block)
            if "endpoint.detected" not in transitions:
                continue
            for alignment in [None, *(args.align or [])]:
                source = np.concatenate(sequence)
                if alignment is not None:
                    onset = np.flatnonzero(np.abs(source) > endpoint.threshold)[0]
                    lead = alignment * 24
                    source = np.pad(source[max(0, onset - lead):], (max(0, lead - onset), 0))
                source = np.pad(source, (0, (-len(source)) % STT_BLOCK_SAMPLES + bundle["drain_blocks"] * STT_BLOCK_SAMPLES))
                at = time.perf_counter()
                gen = new_generator(bundle)
                result = {"file": str(file), "alignMs": alignment, "setupMs": (time.perf_counter() - at) * 1000, "steps": [], "text": ""}
                for offset in range(0, len(source), STT_BLOCK_SAMPLES):
                    block = source[offset:offset + STT_BLOCK_SAMPLES]
                    at = time.perf_counter()
                    codes = bundle["audio_tokenizer"].encode_step(block[None, None, :])
                    encoded = time.perf_counter()
                    tokens = bundle["mx"].array(codes).transpose(0, 2, 1)[:, :, :bundle["other_codebooks"]]
                    token = gen.step(tokens[0])[0].item()
                    step = {"encodeMs": (encoded - at) * 1000, "generateMs": (time.perf_counter() - encoded) * 1000, "token": token}
                    if token not in (0, 3):
                        result["text"] += bundle["text_tokenizer"].id_to_piece(token).replace("▁", " ")
                    result["steps"].append(step)
                report["turns"].append(result)
                args.output.write_text(json.dumps(report, indent=2))
                print(json.dumps({"file": str(file), "alignMs": alignment, "text": result["text"], "setupMs": result["setupMs"]}), flush=True)
            preroll.clear()
            sequence = []
    args.output.write_text(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
