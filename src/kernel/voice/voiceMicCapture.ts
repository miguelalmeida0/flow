/**
 * Browser microphone capture + TTS playback, isolated from the WebSocket
 * client and the state machine so each is independently testable. Uses an
 * AudioWorklet (public/voice-pcm-worklet.js) for PCM capture instead of
 * the deprecated ScriptProcessorNode, and a SEPARATE AudioContext for
 * playback so a slow/underrun TTS buffer can never stall microphone
 * capture (and vice versa).
 *
 * Requests browser acoustic echo cancellation. The session additionally
 * rejects transcripts correlated with its own output. Physical AEC
 * effectiveness requires separate device/acoustic measurements.
 */

import { voiceDebug } from "../../features/day-planner/voice/voiceDebug";
import { getRuntimeMode } from "../../app/runtimeMode";
import { hostedMicrophoneBroker, type HostedMicrophoneLease } from "./hostedMicrophoneBroker";
const MIC_SAMPLE_RATE = 24000; // Kyutai STT's expected input rate.
const WORKLET_URL = "/voice-pcm-worklet.js";
const WORKLET_NAME = "voice-pcm-worklet";

export interface VoiceMicCapture {
  stop(): void;
}

export async function startMicCapture(onPcmChunk: (chunk: ArrayBuffer) => void, signal?: AbortSignal): Promise<VoiceMicCapture> {
  if (typeof AudioContext === "undefined" || typeof navigator === "undefined" || !navigator.mediaDevices) {
    throw new Error("Web Audio / getUserMedia unavailable in this environment");
  }
  const audioContext = new AudioContext({ sampleRate: MIC_SAMPLE_RATE });
  let acquiredStream: MediaStream | undefined;
  let hostedLease: HostedMicrophoneLease | undefined;
  try {
  signal?.throwIfAborted();
  if (audioContext.sampleRate !== MIC_SAMPLE_RATE) throw new Error("Unsupported microphone sample rate");
  // Resume a context suspended by browser autoplay policy before capture.
  await audioContext.resume();
  signal?.throwIfAborted();
  await audioContext.audioWorklet.addModule(WORKLET_URL);
  signal?.throwIfAborted();
  if (getRuntimeMode() === "hosted") hostedLease = await hostedMicrophoneBroker.acquire();
  const stream = hostedLease?.stream ?? await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
  });
  acquiredStream = stream;
  signal?.throwIfAborted();
  const source = audioContext.createMediaStreamSource(stream);
  voiceDebug("voice.micLive", { state: audioContext.state, sampleRate: audioContext.sampleRate,
    tracks: stream.getAudioTracks().map(track => ({ readyState: track.readyState, settings: track.getSettings() })) });
  const workletNode = new AudioWorkletNode(audioContext, WORKLET_NAME);
  workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => onPcmChunk(event.data);
  source.connect(workletNode);
  // Capture does not need to be connected to the speaker output. The
  // production microphone graph is intentionally input-only.

  return {
    stop() {
      workletNode.port.onmessage = null;
      workletNode.disconnect();
      source.disconnect();
      if (hostedLease) hostedLease.release();
      else for (const track of stream.getTracks()) track.stop();
      void audioContext.close();
    },
  };
  } catch (error) {
    if (hostedLease) hostedLease.release();
    else for (const track of acquiredStream?.getTracks() ?? []) track.stop();
    void audioContext.close();
    throw error;
  }
}

const TTS_SAMPLE_RATE = 24000; // Kokoro's output rate (see tts_worker.py).

/**
 * Streams PCM16LE chunks from the voice companion straight to the
 * speakers as they arrive — never waits for a complete utterance (Phase 8:
 * "do not wait for a complete waveform"). `cancel()` stops playback
 * immediately for barge-in and discards any chunks still queued.
 */
export class VoiceTtsPlayer {
  private audioContext: AudioContext | null;
  private nextStartTime = 0;
  private activeSources = new Set<AudioBufferSourceNode>();
  private cancelled = false;
  private drained: (() => void) | undefined;
  private playbackId = 0;
  private cancelledSources = new WeakSet<AudioBufferSourceNode>();
  private oddByte: number | undefined;
  private readonly maxQueuedSeconds: number;

  constructor(options: { maxQueuedSeconds?: number } = {}) {
    this.maxQueuedSeconds = options.maxQueuedSeconds ?? Infinity;
    // A browser/environment without AudioContext (unsupported browser, or
    // any non-browser test environment) degrades to a harmless no-op
    // player rather than throwing — the same "voice unavailable, rest of
    // Flow still works" contract as every other local-voice failure mode
    // (see FINAL REPORT's local-first failure modes).
    this.audioContext = typeof AudioContext !== "undefined" ? new AudioContext({ sampleRate: TTS_SAMPLE_RATE }) : null;
  }

  async unlock(): Promise<void> {
    if (!this.audioContext) throw new Error("Audio playback unavailable");
    await this.audioContext.resume();
  }

  beginUtterance(): void {
    if (!this.audioContext) return;
    this.cancel();
    this.cancelled = false;
    this.drained = undefined;
    this.playbackId += 1;
    void this.audioContext.resume();
    this.nextStartTime = Math.max(this.audioContext.currentTime, this.nextStartTime);
  }

  enqueueChunk(pcm16: ArrayBuffer, onPlayed?: () => void): void {
    if (this.cancelled || !this.audioContext) return;
    const playbackId = this.playbackId;
    voiceDebug("voice.ttsAudioReceived", { playbackId, bytes: pcm16.byteLength });
    let bytes = new Uint8Array(pcm16);
    if (this.oddByte !== undefined) {
      const combined = new Uint8Array(bytes.length + 1);
      combined[0] = this.oddByte; combined.set(bytes, 1); bytes = combined;
      this.oddByte = undefined;
    }
    if (bytes.length % 2) { this.oddByte = bytes[bytes.length - 1]; bytes = bytes.slice(0, -1); }
    if (!bytes.length) return;
    if (Math.max(0, this.nextStartTime - this.audioContext.currentTime) + bytes.length / 48000 > this.maxQueuedSeconds + 0.001) throw new Error("Playback buffer overflow");
    const samples = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const float32 = new Float32Array(bytes.length / 2);
    for (let i = 0; i < float32.length; i += 1) float32[i] = samples.getInt16(i * 2, true) / 32768;
    const buffer = this.audioContext.createBuffer(1, float32.length, TTS_SAMPLE_RATE);
    buffer.copyToChannel(float32, 0);
    voiceDebug("voice.ttsAudioPlayable", { playbackId, samples: float32.length, sampleRate: TTS_SAMPLE_RATE });
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);
    const startAt = Math.max(this.nextStartTime, this.audioContext.currentTime);
    source.start(startAt);
    this.nextStartTime = startAt + buffer.duration;
    this.activeSources.add(source);
    voiceDebug("voice.ttsPlaybackStarted", { playbackId: this.playbackId, durationMs: buffer.duration * 1000, sampleRate: TTS_SAMPLE_RATE, startAt, playbackQueueDepth: this.activeSources.size });
    source.onended = () => {
      voiceDebug("voice.ttsSourceEnded", { playbackId, cancelled: this.cancelledSources.has(source), audioContextTime: this.audioContext?.currentTime });
      this.activeSources.delete(source);
      if (playbackId === this.playbackId && !this.cancelled && !this.cancelledSources.has(source)) onPlayed?.();
      if (playbackId === this.playbackId && !this.activeSources.size && !this.cancelled) this.complete();
    };
  }

  finish(onDone: () => void): void {
    if (this.oddByte !== undefined) { this.cancel(); throw new Error("Incomplete PCM sample"); }
    this.drained = onDone;
    if (!this.activeSources.size) this.complete();
  }

  private complete(): void {
    if (!this.drained) return;
    voiceDebug("voice.ttsPlaybackComplete", { playbackId: this.playbackId });
    const done = this.drained;
    this.drained = undefined;
    done();
  }

  /** Barge-in: stop audible playback immediately and drop anything queued. */
  cancel(): void {
    this.oddByte = undefined;
    if (this.activeSources.size) voiceDebug("voice.ttsPlaybackCancelled", { playbackId: this.playbackId, sources: this.activeSources.size });
    this.drained = undefined;
    this.cancelled = true;
    for (const source of this.activeSources) {
      try {
        this.cancelledSources.add(source);
        source.stop();
      } catch {
        // Already stopped/ended — fine.
      }
    }
    this.activeSources.clear();
    this.nextStartTime = this.audioContext?.currentTime ?? 0;
  }

  close(): void {
    this.cancel();
    void this.audioContext?.close();
  }
}
