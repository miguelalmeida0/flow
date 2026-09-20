import WebSocket from 'ws';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { wav, metadata } from './wav.mjs';

export async function speech(text, systemVoice) {
  const dir = path.resolve('artifacts/voice-autopilot/speech-cache');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, createHash('sha256').update(`${systemVoice ?? 'Kokoro-af_heart'}:${text}`).digest('hex') + '.wav');
  if (systemVoice && !existsSync(file)) execFileSync('say', ['-v', systemVoice, '-r', '155', '--file-format=WAVE', '--data-format=LEI16@24000', '-o', file, text]);
  if (!existsSync(file)) {
    const token = readFileSync(path.join(homedir(), '.flow-companion/voice-token'), 'utf8').trim();
    const pcm = await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:8766/voice?token=${token}`, { origin: 'http://localhost:5173' });
      const chunks = [];
      const timer = setTimeout(() => { ws.close(); reject(new Error('Local fixture TTS exceeded 30s')); }, 30000);
      ws.on('error', () => { clearTimeout(timer); reject(new Error('Local fixture TTS connection failed')); });
      ws.on('message', (data, binary) => {
        if (binary) { chunks.push(Buffer.from(data)); return; }
        const event = JSON.parse(data.toString());
        if (event.type === 'ready') ws.send(JSON.stringify({ type: 'tts.speak', text }));
        if (event.type === 'tts.error') { clearTimeout(timer); ws.close(); reject(new Error(event.message)); }
        if (event.type === 'tts.done') { clearTimeout(timer); ws.close(); resolve(Buffer.concat(chunks)); }
      });
    });
    if (!pcm.length) throw new Error('Local TTS returned no PCM');
    writeFileSync(file, wav(pcm));
  }
  const bytes = readFileSync(file);
  return { bytes, fixture: { text, model: systemVoice ? 'macOS installed offline speech' : 'mlx-community/Kokoro-82M-8bit', voice: systemVoice ?? 'af_heart', ...metadata(bytes) } };
}
