import { createHash } from 'node:crypto';
export function readWav(bytes) {
  let format, pcm;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const tag = bytes.toString('ascii', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    if (tag === 'fmt ') format = bytes.subarray(offset + 8, offset + 8 + size);
    if (tag === 'data') pcm = bytes.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + (size % 2);
  }
  if (!format || !pcm || format.readUInt16LE(0) !== 1 || format.readUInt16LE(2) !== 1 || format.readUInt16LE(14) !== 16) throw new Error('Expected PCM16 mono WAV');
  return { pcm, sampleRate: format.readUInt32LE(4) };
}
export function wav(pcm, sampleRate = 24000) {
  const header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(pcm.length + 36, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
export function padWav(bytes, leading = 1, trailing = 2, db = 0) {
  const { pcm, sampleRate } = readWav(bytes);
  const scaled = Buffer.alloc(pcm.length);
  for (let i = 0; i < pcm.length; i += 2) scaled.writeInt16LE(Math.round(pcm.readInt16LE(i) * 10 ** (db / 20)), i);
  return wav(Buffer.concat([Buffer.alloc(Math.round(sampleRate * leading) * 2), scaled, Buffer.alloc(Math.round(sampleRate * trailing) * 2)]), sampleRate);
}
export function metadata(bytes) {
  const { pcm, sampleRate } = readWav(bytes);
  let power = 0, peak = 0;
  for (let i = 0; i < pcm.length; i += 2) { const value = pcm.readInt16LE(i) / 32768; power += value ** 2; peak = Math.max(peak, Math.abs(value)); }
  return { sampleRate, durationMs: pcm.length / 2 / sampleRate * 1000, rms: Math.sqrt(power / (pcm.length / 2)), peak, sha256: createHash('sha256').update(bytes).digest('hex') };
}

/** Remove synthesis padding before composing a measured inter-sentence pause. */
export function trimWav(bytes) {
  const { pcm, sampleRate } = readWav(bytes);
  const frame = Math.round(sampleRate * .02) * 2;
  const voiced = [];
  for (let start = 0; start < pcm.length; start += frame) {
    let power = 0, n = 0;
    for (let i = start; i + 1 < Math.min(start + frame, pcm.length); i += 2) { power += (pcm.readInt16LE(i) / 32768) ** 2; n++; }
    if (Math.sqrt(power / n) > .002) voiced.push(start);
  }
  if (!voiced.length) throw new Error('Speech fixture contains no audible frames');
  return pcm.subarray(Math.max(0, voiced[0] - frame), Math.min(pcm.length, voiced.at(-1) + frame * 2));
}
