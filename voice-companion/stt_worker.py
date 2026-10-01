"""
STT worker subprocess — runs under .venv (moshi_mlx). Owns Kyutai STT only.
Spawned and supervised by server.py (which itself has no MLX imports and
runs under either venv, since it only needs `websockets`). Talks to the
parent over stdin/stdout using framing.py's length-prefixed protocol —
this is process isolation, not a network boundary; nothing here listens on
a socket or accepts unauthenticated input. Loads the model once at startup
and keeps it resident for the process lifetime (see MODEL LIFECYCLE).

Stdin frames (from server.py):
  J {"cmd": "start"}   -- begin a new listening turn (fresh generator state)
  J {"cmd": "stop"}    -- end the current turn, discard generator state
  A <pcm16le bytes>    -- microphone audio to transcribe (ignored if not listening)

Stdout frames (to server.py):
  J {"type": "worker.ready"}
  J {"type": "speech.end"}
  J {"type": "transcript.partial", "text": "..."}
  J {"type": "transcript.final", "text": "..."}
  J {"type": "stt.error", "message": "..."}
"""
import json
import os
import sys
import time
import math
from collections import deque

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from framing import FRAME_JSON, read_frame, write_frame  # noqa: E402
from endpoint import Endpoint

SAMPLE_RATE = 24000
STT_BLOCK_SAMPLES = 1920  # 80ms at 24kHz — Kyutai's own step size.
MAX_BUFFERED_SAMPLES = 250 * STT_BLOCK_SAMPLES  # ~20s — a bounded ring, never an unbounded queue.


def emit(msg_type_and_payload):
    write_frame(sys.stdout.buffer, FRAME_JSON, json.dumps(msg_type_and_payload).encode("utf-8"))


def load_model():
    import mlx.core as mx
    import rustymimi
    import sentencepiece
    from huggingface_hub import hf_hub_download
    from moshi_mlx import models, utils

    hf_repo = os.environ.get("FLOW_STT_HF_REPO", "kyutai/stt-1b-en_fr-mlx")
    lm_config_path = hf_hub_download(hf_repo, "config.json")
    with open(lm_config_path) as fobj:
        lm_config_dict = json.load(fobj)
    mimi_weights = hf_hub_download(hf_repo, lm_config_dict["mimi_name"])
    moshi_weights = hf_hub_download(hf_repo, lm_config_dict.get("moshi_name", "model.safetensors"))
    tokenizer_path = hf_hub_download(hf_repo, lm_config_dict["tokenizer_name"])

    lm_config = models.LmConfig.from_config_dict(lm_config_dict)
    model = models.Lm(lm_config)
    model.set_dtype(mx.bfloat16)
    model.load_weights(moshi_weights, strict=True)
    text_tokenizer = sentencepiece.SentencePieceProcessor(tokenizer_path)
    generated_codebooks = lm_config.generated_codebooks
    other_codebooks = lm_config.other_codebooks
    mimi_codebooks = max(generated_codebooks, other_codebooks)
    audio_tokenizer = rustymimi.Tokenizer(mimi_weights, num_codebooks=mimi_codebooks)
    model.warmup()
    return {
        "mx": mx,
        "model": model,
        "text_tokenizer": text_tokenizer,
        "audio_tokenizer": audio_tokenizer,
        "new_audio_tokenizer": lambda: rustymimi.Tokenizer(mimi_weights, num_codebooks=mimi_codebooks),
        "other_codebooks": other_codebooks,
        "models": models,
        "utils": utils,
        "drain_blocks": math.ceil((lm_config_dict.get("stt_config", {}).get("audio_delay_seconds", .5) + 1.0) / .08),
    }


def new_generator(bundle):
    # A fresh LmGen per turn — it carries per-turn KV-cache/sampler state,
    # so reusing one across turns would leak the previous utterance into
    # the next transcription.
    utils = bundle["utils"]
    # LmGen does not own the transformer's cache. Both cache and Mimi's
    # streaming codec must reset between utterances (moshi_mlx 0.2.12).
    for cache in bundle["model"].transformer_cache:
        cache.reset()
    # rustymimi 0.4.1 reset() leaves history-dependent encoder tokens in
    # measured repeated-input runs. Recreate its streaming state from the
    # same mmap-backed weights so short replies cannot inherit prior audio.
    bundle["audio_tokenizer"] = bundle["new_audio_tokenizer"]()
    return bundle["models"].LmGen(
        model=bundle["model"],
        max_steps=4096,
        text_sampler=utils.Sampler(top_k=25, temp=0),
        audio_sampler=utils.Sampler(top_k=250, temp=0.8),
        check=False,
    )


def step(bundle, gen, block: np.ndarray):
    mx = bundle["mx"]
    other_audio_tokens = bundle["audio_tokenizer"].encode_step(block[None, None, :])
    other_audio_tokens = mx.array(other_audio_tokens).transpose(0, 2, 1)[:, :, : bundle["other_codebooks"]]
    text_token = gen.step(other_audio_tokens[0])
    text_token = text_token[0].item()
    end_of_turn = False
    piece = None
    if text_token not in (0, 3):
        piece = bundle["text_tokenizer"].id_to_piece(text_token).replace("▁", " ")
    return piece, end_of_turn


def main():
    try:
        bundle = load_model()
    except Exception as exc:  # noqa: BLE001
        emit({"type": "stt.error", "message": "Local STT model failed to load"})
        sys.exit(1)
    emit({"type": "worker.ready"})

    gen, partial_text, listening = None, "", False
    pcm_buffer = np.zeros((0,), dtype=np.float32)
    endpoint = Endpoint()
    preroll = deque(maxlen=7)
    utterance = 0
    session = None
    utterance_pcm = []

    def event(kind, **metadata):
        emit({"type": kind, "atMs": time.monotonic() * 1000,
              "audioMs": endpoint.clock_ms, "sessionId": session,
              "utteranceId": f"{session}:{utterance}", **metadata})

    def decode(block):
        nonlocal partial_text
        piece, _ = step(bundle, gen, block)
        if piece:
            partial_text += piece
            event("transcript.partial", text=partial_text)

    stdin = sys.stdin.buffer
    while True:
        msg_type, payload = read_frame(stdin)
        if msg_type is None:
            break  # EOF: parent closed the pipe, shut down cleanly.
        if msg_type == FRAME_JSON:
            try:
                control = json.loads(payload)
            except json.JSONDecodeError:
                continue
            cmd = control.get("cmd")
            if cmd == "start":
                session = control.get("sessionId")
                gen = None
                partial_text = ""
                pcm_buffer = np.zeros((0,), dtype=np.float32)
                listening = True
                endpoint = Endpoint()
                preroll.clear()
            elif cmd == "stop":
                # Cancellation/ownership loss never grants execution authority.
                listening, gen, partial_text = False, None, ""
                endpoint.reset()
                preroll.clear()
                event("stt.reset", reason="cancelled")
            continue

        # An audio frame.
        if not listening:
            continue
        chunk = np.frombuffer(payload, dtype=np.int16).astype(np.float32) / 32768.0
        pcm_buffer = np.concatenate([pcm_buffer, chunk])
        if len(pcm_buffer) > MAX_BUFFERED_SAMPLES:
            overflow = len(pcm_buffer) - MAX_BUFFERED_SAMPLES
            pcm_buffer = pcm_buffer[overflow:]
        while len(pcm_buffer) >= STT_BLOCK_SAMPLES:
            block, pcm_buffer = pcm_buffer[:STT_BLOCK_SAMPLES], pcm_buffer[STT_BLOCK_SAMPLES:]
            rms = float(np.sqrt(np.mean(np.square(block))))
            transitions = endpoint.feed(rms, 80)
            if endpoint.clock_ms % 2000 == 0:
                event("audio.frame", samples=STT_BLOCK_SAMPLES, sampleRate=SAMPLE_RATE)
                event("audio.rms", rms=rms, threshold=endpoint.threshold)
            if "speech.start" in transitions:
                utterance += 1
                gen = new_generator(bundle)
                partial_text = ""
                event("speech.start", rms=rms, threshold=endpoint.threshold)
                utterance_pcm = list(preroll)
                for prior in preroll:
                    decode(prior)
                preroll.clear()
            if gen is None:
                preroll.append(block)
                continue
            try:
                utterance_pcm.append(block)
                decode(block)
                for transition in transitions:
                    if transition != "speech.start":
                        event(transition, rms=rms, lastSpeechMs=endpoint.last_speech_ms)
                if "endpoint.detected" in transitions:
                    event("speech.end")
                    started = time.monotonic()
                    quiet_blocks = int((endpoint.clock_ms - endpoint.last_speech_ms) / 80)
                    # Measured short-reply regression: counting endpoint silence
                    # toward the tail yielded empty "Undo" finals at 7 blocks.
                    # Preserve the installed offline decoder's full 19-step tail.
                    drain_blocks = bundle["drain_blocks"]
                    event("stt.flushStart", blocks=drain_blocks, decodedQuietBlocks=quiet_blocks)
                    # Installed run_inference.py pads audio_delay_seconds + 1s.
                    # Step that bounded PCM tail immediately; no fake API or timer.
                    for _ in range(drain_blocks):
                        decode(np.zeros(STT_BLOCK_SAMPLES, dtype=np.float32))
                    # The installed streaming decoder can return no tokens for
                    # short speech at some 80ms frame offsets. More tail does
                    # not recover it (measured through 60 steps). Retry that
                    # same bounded PCM once, aligned to its measured onset.
                    # This grants no authority and never invents a transcript.
                    if not partial_text.strip() and len(utterance_pcm) <= 50:
                        pcm = np.concatenate(utterance_pcm)
                        voiced = np.flatnonzero(np.abs(pcm) > endpoint.threshold)
                        if len(voiced):
                            pcm = pcm[max(0, int(voiced[0]) - SAMPLE_RATE // 50):]
                            pcm = np.pad(pcm, (0, drain_blocks * STT_BLOCK_SAMPLES + (-len(pcm) % STT_BLOCK_SAMPLES)))
                            event("stt.flushRetry", reason="empty-short-utterance", samples=len(pcm))
                            gen = new_generator(bundle)
                            for index in range(0, len(pcm), STT_BLOCK_SAMPLES):
                                decode(pcm[index:index + STT_BLOCK_SAMPLES])
                    event("stt.flushComplete", durationMs=(time.monotonic() - started) * 1000)
                    event("transcript.final", text=partial_text.strip())
                    gen, partial_text = None, ""
                    event("stt.reset", reason="completed")
                # Retain the real quiet tail across decoder reset. A short
                # immediate reply needs the same codec pre-roll as a cold wake;
                # collecting only while gen=None loses the endpoint's silence.
                preroll.append(block)
            except Exception as exc:  # noqa: BLE001
                event("stt.error", message="Local STT inference failed")
                listening = False
                gen = None
                break


if __name__ == "__main__":
    main()
