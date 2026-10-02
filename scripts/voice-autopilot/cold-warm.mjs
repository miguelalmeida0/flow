import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { stack } from './stack.mjs';
import { native, definitions, delay } from './native.mjs';
import { saveReport } from './report.mjs';
import { monitorResources } from './resource-profile.mjs';

const option = (key, fallback) => process.argv.includes(key) ? process.argv[process.argv.indexOf(key) + 1] : fallback;
const idleMinutes = option('--idle-minutes', '1,5').split(',').map(Number);
if (idleMinutes.some(n => !Number.isFinite(n) || n < 0 || n > 15)) throw new Error('Idle intervals must be between 0 and 15 minutes');
const out = path.resolve('artifacts/voice-cold-warm', new Date().toISOString().replaceAll(':', '-'));
mkdirSync(out, { recursive: true });
const report = { coverage: 'Real digital microphone; fresh worker processes versus subsequent and idle turns. Browser AudioBuffer readiness, not physical speaker timing. OS filesystem caches are not flushed.',
  expectedScenarios: 10 + idleMinutes.length, scenarios: [], coldWarm: { startup: null, turns: [], idle: [] } };
const stopResources = monitorResources(path.join(out, 'processes.jsonl'));
let services;
const resident = async () => {
  try {
    const data = await fetch('http://127.0.0.1:11434/api/ps', { signal: AbortSignal.timeout(2000) }).then(r => r.json());
    return (data.models ?? []).map(m => ({ model: m.name, sizeBytes: m.size, vramBytes: m.size_vram, expiresAt: m.expires_at }));
  } catch { return []; }
};
const probeReasoner = async () => {
  const at = performance.now();
  try {
    const response = await fetch('http://127.0.0.1:8765/capability', { method: 'POST',
      headers: { Origin: 'http://localhost:5173', Authorization: `Bearer ${services.desktopToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ capability: 'ai.status', args: { liveProbe: true, measurements: true } }), signal: AbortSignal.timeout(15000) });
    const result = await response.json();
    return { elapsedMs: performance.now() - at, passed: response.ok && result.liveProbeOk === true,
      model: result.model, modelLocal: result.liveProbePerformance ?? null };
  } catch (error) { return { elapsedMs: performance.now() - at, passed: false, error: error.message }; }
};
const runTurn = async (label, turn) => {
  const directory = path.join(out, label);
  mkdirSync(directory, { recursive: true });
  const result = await native(definitions.find(d => d.id === 'wake-0db'), services, directory);
  result.id = label;
  result.temperature = turn === 1 ? 'First live utterance in new STT/TTS worker processes; OS caches retained' : 'New browser; same resident STT/TTS workers; fresh utterance state';
  if (result.screenshot) result.screenshot = path.relative(out, path.join(directory, result.screenshot));
  report.scenarios.push(result);
  saveReport(out, report);
  const ready = result.events.find(e => e.state?.type === 'ready');
  return { label, turn, status: result.status, workerStartup: ready?.state.startup ?? null, observedTurns: result.observedTurns };
};

const watchdog = setTimeout(() => { report.error = 'Cold/warm runner exceeded its 45 minute bound'; saveReport(out, report); void Promise.resolve(services?.stop()).finally(() => process.exit(1)); }, 45 * 60 * 1000);
try {
  let voiceRunning = false;
  try { voiceRunning = (await fetch('http://127.0.0.1:8766/health', { signal: AbortSignal.timeout(1000) })).ok; } catch { /* absent is required for worker-cold evidence */ }
  if (voiceRunning) throw new Error('Cold worker measurement requires the existing voice companion to be stopped. This runner will not label a reused worker cold or stop an unowned service.');
  const def = definitions.find(d => d.id === 'wake-0db');
  const fixture = path.resolve('artifacts/voice-autopilot/speech-cache', createHash('sha256').update(`Kokoro-af_heart:${def.text}`).digest('hex') + '.wav');
  if (!existsSync(fixture)) throw new Error('Run the existing autopilot once to cache its fixture, then run cold/warm. Fixture synthesis must not warm the measured TTS worker.');
  // Readability/format check before starting models; no fixture generation here.
  if (readFileSync(fixture).length < 44) throw new Error('Cached microphone fixture is invalid');
  report.coldWarm.reasonerResidentBeforeStartup = await resident();
  services = await stack();
  report.environment = { runtime: services.runtime, readiness: services.readiness, reasoner: services.reasoner };
  report.coldWarm.startup = services.readiness;
  for (let turn = 1; turn <= 10; turn++) {
    const measurement = await runTurn(`turn-${turn}`, turn);
    if ([1, 2, 5, 10].includes(turn)) measurement.reasoner = await probeReasoner();
    report.coldWarm.turns.push(measurement);
    saveReport(out, report);
  }
  for (const minutes of idleMinutes) {
    const at = performance.now();
    console.log(`[IDLE] ${minutes} minutes; STT/TTS processes remain alive, no warming requests`);
    while (performance.now() - at < minutes * 60000) await delay(Math.min(5000, minutes * 60000 - (performance.now() - at)));
    const idleElapsedMs = performance.now() - at;
    const before = await resident();
    const measurement = await runTurn(`idle-${minutes}m`, null);
    report.coldWarm.idle.push({ requestedMinutes: minutes, elapsedMs: idleElapsedMs,
      reasonerResidentBeforeTurn: before, ...measurement, reasoner: await probeReasoner() });
    saveReport(out, report);
  }
  if ([...report.coldWarm.turns, ...report.coldWarm.idle].some(t => t.reasoner?.passed === false)) report.error = 'A measured reasoner probe failed';
} catch (error) { report.error = error.message; console.error(`[FAIL] ${error.message}`); }
finally {
  clearTimeout(watchdog);
  await services?.stop();
  await stopResources();
  saveReport(out, report);
}
console.log(`Result: ${report.overall}\nEvidence: ${out}`);
if (report.overall !== 'PASS') process.exitCode = 1;
