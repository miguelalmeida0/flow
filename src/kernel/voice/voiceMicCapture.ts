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
const MIC_SAMPLE_RATE = 24000; // Kyutai STT's expected input rate.
const WORKLET_URL = "/voice-pcm-worklet.js";
const WORKLET_NAME = "voice-pcm-worklet";

export interface VoiceMicCapture {
  stop(): void;
}

export async function startMicCapture(onPcmChunk: (chunk: ArrayBuffer) => void): Promise<VoiceMicCapture> {
  if (typeof AudioContext === "undefined" || typeof navigator === "undefined" || !navigator.mediaDevices) {
    throw new Error("Web Audio / getUserMedia unavailable in this environment");
  }
  const audioContext = new AudioContext({ sampleRate: MIC_SAMPLE_RATE });
  // Resume a context suspended by browser autoplay policy before capture.
  await audioContext.resume();
  await audioContext.audioWorklet.addModule(WORKLET_URL);
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
  });
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
      for (const track of stream.getTracks()) track.stop();
      void audioContext.close();
    },
  };
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

  constructor() {
    // A browser/environment without AudioContext (unsupported browser, or
    // any non-browser test environment) degrades to a harmless no-op
    // player rather than throwing — the same "voice unavailable, rest of
    // Flow still works" contract as every other local-voice failure mode
    // (see FINAL REPORT's local-first failure modes).
    this.audioContext = typeof AudioContext !== "undefined" ? new AudioContext({ sampleRate: TTS_SAMPLE_RATE }) : null;
  }

  beginUtterance(): void {
    if (!this.audioContext) return;
    this.cancelled = false;
    this.drained = undefined;
    this.playbackId += 1;
    void this.audioContext.resume();
    this.nextStartTime = Math.max(this.audioContext.currentTime, this.nextStartTime);
  }

  enqueueChunk(pcm16: ArrayBuffer): void {
    if (this.cancelled || !this.audioContext) return;
    const int16 = new Int16Array(pcm16);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i += 1) float32[i] = int16[i]! / 32768;
    const buffer = this.audioContext.createBuffer(1, float32.length, TTS_SAMPLE_RATE);
    buffer.copyToChannel(float32, 0);
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);
    const startAt = Math.max(this.nextStartTime, this.audioContext.currentTime);
    source.start(startAt);
    this.nextStartTime = startAt + buffer.duration;
    this.activeSources.add(source);
    voiceDebug("voice.ttsPlaybackStarted", { playbackId: this.playbackId, durationMs: buffer.duration * 1000, sampleRate: TTS_SAMPLE_RATE, startAt });
    source.onended = () => {
      this.activeSources.delete(source);
      if (!this.activeSources.size && !this.cancelled) this.complete();
    };
  }

  finish(onDone: () => void): void {
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
    if (this.activeSources.size) voiceDebug("voice.ttsPlaybackCancelled", { playbackId: this.playbackId, sources: this.activeSources.size });
    this.drained = undefined;
    this.cancelled = true;
    for (const source of this.activeSources) {
      try {
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
