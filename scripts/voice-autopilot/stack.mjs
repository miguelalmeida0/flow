import { spawn, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function health(url) { try { const r = await fetch(url, { signal: AbortSignal.timeout(1500) }); return r.ok; } catch { return false; } }
export async function stack() {
  console.log('[START] Local stack');
  const urls = [process.env.FLOW_VOICE_APP_URL ?? 'http://localhost:5173/', 'http://127.0.0.1:8765/health', 'http://127.0.0.1:8766/health', 'http://127.0.0.1:11434/api/tags'];
  let child;
  const stop = async () => {
    if (child && child.exitCode === null) {
      const exited = new Promise(resolve => child.once('close', resolve));
      try { process.kill(-child.pid, 'SIGINT'); } catch { return; }
      await Promise.race([exited, new Promise(resolve => { const timer = setTimeout(resolve, 5000); timer.unref(); })]);
    }
  };
  if (!(await Promise.all(urls.map(health))).every(Boolean)) {
    child = spawn(process.execPath, ['scripts/start-flow-local.mjs'], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    for (const stream of [child.stdout, child.stderr]) stream.on('data', () => {});
  }
  try {
    const deadline = Date.now() + 120000;
    let ready = false;
    while (Date.now() < deadline) {
      if ((await Promise.all(urls.map(health))).every(Boolean)) {
        const voice = await fetch(urls[2]).then(r => r.json());
        if (voice.sttReady && voice.ttsReady) { ready = true; break; }
      }
      await delay(1000);
    }
    if (!ready) throw new Error('Local stack failed readiness within 120s');
    if (process.env.FLOW_FRONTEND_MODE === 'production') {
      const served = await fetch(urls[0]).then(response => response.text());
      if (served !== readFileSync('dist/index.html', 'utf8')) throw new Error('Frontend is not the exact production artifact; stop the unrelated dev server explicitly');
    }
    const desktopToken = readFileSync(path.join(homedir(), '.flow-companion/token'), 'utf8').trim();
    const voiceToken = readFileSync(path.join(homedir(), '.flow-companion/voice-token'), 'utf8').trim();
    const response = await fetch('http://127.0.0.1:8765/capability', { method: 'POST', headers: { Origin: 'http://localhost:5173', Authorization: `Bearer ${desktopToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ capability: 'ai.status', args: { liveProbe: true } }), signal: AbortSignal.timeout(15000) });
    const reasoner = await response.json();
    if (!response.ok || reasoner.liveProbeOk !== true) throw new Error('Selected local reasoner did not pass its live readiness probe');
    console.log('[PASS] Frontend, desktop bridge, STT, TTS, reasoner ready');
    const runtime = JSON.parse(execFileSync(path.resolve('voice-companion/.venv/bin/python'), ['-c', 'import json, importlib.metadata as m; print(json.dumps({p: m.version(p) for p in ["moshi_mlx", "rustymimi", "mlx"]}))'], { encoding: 'utf8' }));
    return { stop, desktopToken, voiceToken, reasoner, runtime };
  } catch (error) { await stop(); throw error; }
}
