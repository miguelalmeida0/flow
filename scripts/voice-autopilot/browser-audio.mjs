// Digital microphone fixture. No transcript, STT, interpreter or kernel mocks.
export function installAudioInput() {
  const Socket = window.WebSocket;
  window.voiceLabOutput = [];
  window.voiceLabInput = [];
  window.voiceLabSockets = [];
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
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    if (!constraints.audio) return native(constraints);
    context ??= new AudioContext({ sampleRate: 24000 });
    destination ??= context.createMediaStreamDestination();
    await context.resume();
    // Each consumer owns its track; Journal recording must not stop STT.
    return destination.stream.clone();
  };
  window.voiceLabPlay = async (bytes, gain = 1) => {
    if (!context) throw new Error('Production microphone has not opened');
    await context.resume();
    const buffer = await context.decodeAudioData(Uint8Array.from(bytes).buffer);
    const source = context.createBufferSource();
    const volume = context.createGain();
    volume.gain.value = gain;
    source.buffer = buffer;
    source.connect(volume).connect(destination);
    source.start();
    return { at: performance.now(), durationMs: buffer.duration * 1000 };
  };
}
