import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Commands are used only to identify ownership; never retain argv or credentials.
export async function processSample() {
  const started = performance.now();
  const { stdout } = await execute('ps', ['-axo', 'pid,ppid,rss,pcpu,majflt,minflt,comm,args'], { maxBuffer: 8 * 1024 * 1024 });
  const rows = stdout.split('\n').slice(1).map(line => {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+|-)\s+(\d+|-)\s+(.*)$/);
    return m && { pid: +m[1], parent: +m[2], rssKiB: +m[3], cpuPercent: +m[4], majorFaults: m[5] === '-' ? null : +m[5], minorFaults: m[6] === '-' ? null : +m[6], identity: m[7] };
  }).filter(Boolean);
  const roleFor = id => /stt_worker\.py/.test(id) ? 'stt' : /tts_worker\.py/.test(id) ? 'tts'
    : /ollama (serve|runner)/.test(id) ? 'reasoner'
    : /chromium|chrome/i.test(id) ? 'browser'
    : /desktop-bridge/.test(id) ? 'desktop-bridge'
    : /vite\/bin|\.bin\/vite|esbuild/.test(id) ? 'frontend'
    : /server\.py/.test(id) ? 'voice-companion'
    : /rustc|cargo|build_reset_codec|codec_reset_probe|stt_pcm_probe/.test(id) ? 'tooling'
    : undefined;
  const selected = new Map();
  for (const row of rows) {
    const id = row.identity;
    const owned = id.includes(workspace) || /node scripts\/(voice-autopilot|start-flow-local)/.test(id) || /ollama (serve|runner)/.test(id);
    const role = owned ? roleFor(id) ?? 'harness' : undefined;
    if (role) selected.set(row.pid, role);
  }
  let added;
  do {
    added = false;
    for (const row of rows) if (!selected.has(row.pid) && selected.has(row.parent)) {
      selected.set(row.pid, roleFor(row.identity) ?? selected.get(row.parent)); added = true;
    }
  } while (added);
  const processes = rows.filter(row => selected.has(row.pid) && !(row.parent === process.pid && /\bps\s+-/.test(row.identity))).map(({ identity, ...row }) => ({ ...row, role: selected.get(row.pid), threads: null }));
  const runtime = processes.filter(p => !['harness', 'tooling'].includes(p.role));
  if (runtime.length) {
    try {
      const { stdout: threadRows } = await execute('ps', ['-M', '-p', runtime.map(p => p.pid).join(','), '-o', 'pid=']);
      const counts = new Map();
      for (const line of threadRows.split('\n')) {
        // macOS -M retains its default thread columns and appends the requested
        // pid column. The explicit last column is the process identity.
        const pid = Number(line.match(/\s(\d+)\s*$/)?.[1]);
        if (pid) counts.set(pid, (counts.get(pid) ?? 0) + 1);
      }
      for (const p of runtime) p.threads = counts.get(p.pid) ?? null;
    } catch { /* Explicit null if the process exited or counters are unavailable. */ }
  }
  return { atMs: performance.now(), clock: `resource-monitor:${process.pid}`, processes,
    samplingDurationMs: performance.now() - started,
    totalRssKiB: processes.reduce((sum, row) => sum + row.rssKiB, 0),
    runtimeRssKiB: runtime.reduce((sum, row) => sum + row.rssKiB, 0),
    totalCpuPercent: processes.reduce((sum, row) => sum + row.cpuPercent, 0),
    limitations: 'RSS is not unique physical memory or MLX physical footprint. CPU is the OS estimate. Fault counters are OS-reported cumulative values per PID. Ollama may be shared with other clients. Tooling/harness are excluded from runtimeRssKiB.' };
}

export function monitorResources(output) {
  let stopped = false;
  const task = (async () => {
    while (!stopped) {
      const at = performance.now();
      try { appendFileSync(output, `${JSON.stringify(await processSample())}\n`); }
      catch (error) { appendFileSync(output, `${JSON.stringify({ atMs: performance.now(), error: error.code ?? 'sampling failed' })}\n`); }
      if (!stopped) await new Promise(resolve => setTimeout(resolve, Math.max(1, 1000 - (performance.now() - at))));
    }
  })();
  return async () => { stopped = true; await task; };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Provide a JSONL output path');
  const stop = monitorResources(process.argv[2]);
  process.once('SIGINT', () => void stop());
  process.once('SIGTERM', () => void stop());
}
