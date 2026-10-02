/** Shared browser/gateway framing. No credentials or provider configuration. */
export const VOICE_VERSION = 1;
export const FRAME_HEADER_BYTES = 32;
export const PCM_WINDOW_BYTES = 48000;
export const PCM_FRAME_BYTES = 3840;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function encodeVoiceFrame({kind, epoch, generation, sequence, data}) {
  if (!UUID_PATTERN.test(epoch) || ![1,2].includes(kind) || !Number.isSafeInteger(generation) || generation < 0 || generation > 0xffffffff || !Number.isSafeInteger(sequence) || sequence < 1 || sequence > 0xffffffff) throw new Error('invalid frame');
  const pcm = new Uint8Array(data);
  if (!pcm.length || pcm.length > PCM_FRAME_BYTES || pcm.length % 2) throw new Error('invalid PCM');
  const frame = new Uint8Array(FRAME_HEADER_BYTES + pcm.length);
  const view = new DataView(frame.buffer);
  view.setUint32(0, 0x464c4f57); view.setUint8(4, VOICE_VERSION); view.setUint8(5,kind);
  const hex = epoch.replaceAll('-','');
  for (let i=0;i<16;i++) frame[8+i]=parseInt(hex.slice(i*2,i*2+2),16);
  view.setUint32(24,generation); view.setUint32(28,sequence); frame.set(pcm,FRAME_HEADER_BYTES);
  return frame.buffer;
}
export function decodeVoiceFrame(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.length <= FRAME_HEADER_BYTES || bytes.length > FRAME_HEADER_BYTES + PCM_FRAME_BYTES || bytes.length % 2) throw new Error('invalid frame size');
  const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if (view.getUint32(0)!==0x464c4f57 || view.getUint8(4)!==VOICE_VERSION || ![1,2].includes(view.getUint8(5)) || view.getUint16(6)!==0) throw new Error('invalid frame header');
  const hex = Array.from(bytes.slice(8,24), b=>b.toString(16).padStart(2,'0')).join('');
  const epoch = [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
  return {kind:view.getUint8(5),epoch,generation:view.getUint32(24),sequence:view.getUint32(28),data:bytes.slice(FRAME_HEADER_BYTES).buffer};
}
