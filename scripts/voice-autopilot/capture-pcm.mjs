// Used only with the harness's generated digital fixtures. Does not alter PCM.
export function installPcmCapture() {
  const NativeSocket = window.WebSocket;
  const chunks = [];
  let bytes = 0;
  const limit = 24000 * 2 * 120;
  let truncated = false;
  window.WebSocket = class extends NativeSocket {
    send(data) {
      if (data instanceof ArrayBuffer) {
        if (bytes + data.byteLength <= limit) { chunks.push(new Uint8Array(data.slice(0))); bytes += data.byteLength; }
        else truncated = true;
      }
      return super.send(data);
    }
  };
  window.voiceLabCapturedPcm = () => ({ truncated, bytes, chunks: chunks.map(chunk => {
    let text = '';
    for (let i = 0; i < chunk.length; i += 16384) text += String.fromCharCode(...chunk.subarray(i, i + 16384));
    return btoa(text);
  }) });
}
