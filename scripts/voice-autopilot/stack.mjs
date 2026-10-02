import { spawn, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
export function servesExactSource(compiled, source) {
  const match = compiled.match(/sourceMappingURL=data:application\/json;base64,([^\s]+)/);
  try { return Boolean(match && JSON.parse(Buffer.from(match[1], 'base64').toString()).sourcesContent?.includes(source)); }
  catch { return false; }
}
async function health(url) { try { const r = await fetch(url, { signal: AbortSignal.timeout(1500) }); return r.ok; } catch { return false; } }
export async function stack({ registerCleanup } = {}) {
  console.log('[START] Local stack');
  const startupAt = performance.now();
  const urls = ['http://localhost:5173', 'http://127.0.0.1:8765/health', 'http://127.0.0.1:8766/health', 'http://127.0.0.1:11434/api/tags'];
  let child;
  let startupReasoner;
  const startupLog = [];
  const stop = async () => {
    if (child && child.exitCode === null) {
      const exited = new Promise(resolve => child.once('close', resolve));
      try { process.kill(-child.pid, 'SIGINT'); } catch { return; }
      await Promise.race([exited, new Promise(resolve => { const timer = setTimeout(resolve, 5000); timer.unref(); })]);
    }
  };
  registerCleanup?.(stop);
  if (!(await Promise.all(urls.map(health))).every(Boolean)) {
    child = spawn(process.execPath, ['scripts/start-flow-local.mjs'], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    for (const stream of [child.stdout, child.stderr]) {
      let pending = '';
      stream.on('data', data => {
        // Redact complete lines: a credential label and its value can arrive
        // in different pipe chunks. Never publish a trailing partial line.
        pending += String(data);
        const lines = pending.split('\n');
        pending = lines.pop();
        for (const line of lines) {
          const marker = '[start-flow-local] reasoner metrics: ';
          if (line.startsWith(marker)) {
            try { startupReasoner = JSON.parse(line.slice(marker.length)); } catch { /* incomplete diagnostic is not a timing */ }
          }
        }
        startupLog.push(...lines.filter(Boolean).map(line => /token|authorization|bearer/i.test(line) ? '[credential diagnostic redacted]' : line.slice(0, 2000)));
        if (startupLog.length > 30) startupLog.splice(0, startupLog.length - 30);
        if (pending.length > 65536) pending = '[oversize diagnostic redacted]';
      });
    }
  }
  try {
    const deadline = performance.now() + 120000;
    let ready = false;
    while (performance.now() < deadline) {
      if ((await Promise.all(urls.map(health))).every(Boolean)) {
        const voice = await fetch(urls[2]).then(r => r.json());
        if (voice.sttReady && voice.ttsReady) { ready = true; break; }
      }
      await delay(1000);
    }
    if (!ready) throw new Error(`Local stack failed readiness within 120s\n${startupLog.join('\n')}`);
    // Healthy does not imply current: a reused Vite process can retain stale
    // transforms after its watcher stops. Fail closed before taking evidence.
    for (const file of ['src/kernel/voice/voiceCompanionClient.ts', 'src/kernel/voice/voiceMicCapture.ts', 'src/features/voice/useKyutaiVoiceSession.ts', 'src/app/FlowEnvironmentProvider.tsx']) {
      const compiled = await fetch(`http://localhost:5173/${file}`, { signal: AbortSignal.timeout(10000) }).then(r => r.text());
      if (!servesExactSource(compiled, readFileSync(path.resolve(file), 'utf8'))) throw new Error(`Frontend serves stale or unverifiable source: ${file}. Restart the development server before benchmarking.`);
    }
    const desktopToken = readFileSync(path.join(homedir(), '.flow-companion/token'), 'utf8').trim();
    const voiceToken = readFileSync(path.join(homedir(), '.flow-companion/voice-token'), 'utf8').trim();
    const reasonerAttempts = [];
    let reasoner;
    do {
      const at = performance.now();
      let passed = false;
      try {
        const response = await fetch('http://127.0.0.1:8765/capability', { method: 'POST', headers: { Origin: 'http://localhost:5173', Authorization: `Bearer ${desktopToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ capability: 'ai.status', args: { liveProbe: true, measurements: true } }), signal: AbortSignal.timeout(Math.max(1, Math.floor(Math.min(15000, deadline - performance.now())))) });
        reasoner = await response.json();
        passed = response.ok && reasoner.liveProbeOk === true;
      } catch { /* A cold model may not yet have completed startup. */ }
      reasonerAttempts.push({ atMs: at - startupAt, durationMs: performance.now() - at, passed });
      if (passed) break;
      if (performance.now() < deadline) await delay(Math.min(1000, deadline - performance.now()));
    } while (performance.now() < deadline);
    if (!reasonerAttempts.at(-1)?.passed) throw new Error(`Selected local reasoner did not pass its live readiness probe within the startup budget (${reasonerAttempts.length} attempts)`);
    console.log('[PASS] Frontend, desktop bridge, STT, TTS, reasoner ready');
    const runtime = JSON.parse(execFileSync(path.resolve('voice-companion/.venv/bin/python'), ['-c', 'import json, importlib.metadata as m; print(json.dumps({p: m.version(p) for p in ["moshi_mlx", "rustymimi", "mlx"]}))'], { encoding: 'utf8' }));
    return { stop, desktopToken, voiceToken, reasoner, runtime, readiness: { durationMs: performance.now() - startupAt, ownedLauncher: Boolean(child), startupReasoner: startupReasoner ?? null, reasonerAttempts } };
  } catch (error) { await stop(); throw error; }
}
