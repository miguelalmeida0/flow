/**
 * AudioWorklet processor: converts the microphone's Float32 render quanta
 * (128 samples each) into PCM16LE and batches them into ~80ms chunks
 * before posting to the main thread — small enough to keep latency low,
 * large enough not to spam postMessage on every 128-sample quantum.
 *
 * Resampling to 24kHz (what Kyutai STT expects) is NOT done here — the
 * AudioContext this worklet is attached to is constructed with
 * {sampleRate: 24000} on the main thread (see voiceMicCapture.ts), so the
 * browser's own (properly anti-aliased) resampler has already done that
 * work before audio ever reaches this processor.
 */
class VoicePcmWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunkSamples = 1920; // 80ms at 24kHz — matches the server's own STT block size.
    this.buffer = new Int16Array(this.chunkSamples);
    this.writeIndex = 0;
  }

  process(inputs) {
    const input = inputs[0];
    const channel = input && input[0];
    if (channel) {
      for (let i = 0; i < channel.length; i += 1) {
        const sample = Math.max(-1, Math.min(1, channel[i]));
        this.buffer[this.writeIndex] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        this.writeIndex += 1;
        if (this.writeIndex >= this.chunkSamples) {
          this.port.postMessage(this.buffer.buffer.slice(0));
          this.writeIndex = 0;
        }
      }
    }
    return true; // keep the processor alive for the life of the node.
  }
}

registerProcessor("voice-pcm-worklet", VoicePcmWorklet);
