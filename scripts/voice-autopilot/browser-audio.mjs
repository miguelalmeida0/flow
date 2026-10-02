// Digital microphone fixture. No transcript, STT, interpreter or kernel mocks.
export function installAudioInput() {
  const Socket = window.WebSocket;
  window.voiceLabOutput = [];
  window.voiceLabInput = [];
  window.voiceLabSockets = [];
  window.voiceLabEndedInputs = [];
  let inputId = 0;
  window.WebSocket = class extends Socket {
    send(data) {
      if (data instanceof ArrayBuffer) window.voiceLabInput.push(Array.from(new Uint8Array(data)));
      return super.send(data);
    }
    constructor(...args) {
      super(...args);
      window.voiceLabSockets.push(this);
      this.addEventListener('message', event => {
        if (event.data instanceof ArrayBuffer) window.voiceLabOutput = window.voiceLabOutput.concat(Array.from(new Uint8Array(event.data)));
        else { try { if (JSON.parse(event.data).type === 'tts.start') window.voiceLabOutput = []; } catch { /* non-voice message */ } }
      });
    }
  };
  const native = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  let context;
  let destination;
  const identity = crypto.randomUUID();
  window.voiceLabActiveInputs = 0;
  window.voiceLabIdentity = () => ({ id: identity, sampleRate: context?.sampleRate, state: context?.state,
    streamId: destination?.stream.id, tracks: destination?.stream.getTracks().map(track => ({ id: track.id, state: track.readyState })) });
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    if (!constraints.audio) return native(constraints);
    context ??= new AudioContext({ sampleRate: 24000 });
    destination ??= context.createMediaStreamDestination();
    await context.resume();
    // Each consumer owns its track; Journal recording must not stop STT.
    return destination.stream.clone();
  };
  window.voiceLabPlay = async (bytes, gain = 1, requestedStartAt) => {
    if (!context) throw new Error('Production microphone has not opened');
    await context.resume();
    const buffer = await context.decodeAudioData(Uint8Array.from(bytes).buffer);
    const source = context.createBufferSource();
    const volume = context.createGain();
    volume.gain.value = gain;
    source.buffer = buffer;
    const id = ++inputId;
    window.voiceLabActiveInputs++;
    source.onended = () => { window.voiceLabActiveInputs--; window.voiceLabEndedInputs.push(id); source.disconnect(); volume.disconnect(); };
    source.connect(volume).connect(destination);
    const now = performance.now();
    const waitMs = Math.max(0, (requestedStartAt ?? now) - now);
    source.start(context.currentTime + waitMs / 1000);
    return { id, at: now + waitMs, requestedAt: now, durationMs: buffer.duration * 1000 };
  };
}
