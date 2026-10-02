import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { stack } from './stack.mjs';
import { native, definitions } from './native.mjs';
import { reactive, reactiveDefinitions } from './reactive.mjs';
import { saveReport } from './report.mjs';
import { monitorResources } from './resource-profile.mjs';
import assert from 'node:assert/strict';
import { prepareLatencyFixtures, openLatencySession, runLongLivedSamples } from './latency-session.mjs';
import { browserCounts, cleanupStaleBrowsers, closeOwnedBrowsers, installExitCleanup } from './browser-lifecycle.mjs';

const option = (name, fallback) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback;
const samples = Number(option('--samples', '10'));
if (!Number.isInteger(samples) || samples < 1 || samples > 1000) throw new Error('--samples must be between 1 and 1000');
const phase = option('--phase', 'after');
if (!['before', 'after'].includes(phase)) throw new Error('--phase must be before or after');
const closedDefinitions = ['confirm', 'yes', 'no', 'wait', 'cancel', 'never mind', 'undo', 'redo'].map(reply => ({
  id: `closed-${reply.replaceAll(' ', '-')}`, measuredReply: reply, behavior: 'confirm-barge-in',
  replyText: ['undo', 'redo'].includes(reply) ? 'Confirm.' : `${reply[0].toUpperCase()}${reply.slice(1)}.`, redoAfterUndo: reply === 'redo',
}));
const groups = { wake: ['wake-0db'], endpoint: ['day-query'], tts: ['day-query'], 'barge-in': ['confirm-barge-in'], 'closed-reply': closedDefinitions.map(d => d.id) };
const selection = option('--scenario', 'all');
const scenarioIds = selection === 'all' ? ['wake-0db', 'day-query', 'confirm-barge-in'] : groups[selection] ?? selection.split(',');
if (scenarioIds.some(id => ![...definitions, ...closedDefinitions, ...reactiveDefinitions].some(d => d.id === id))) throw new Error(`Unknown latency scenario: ${selection}`);
const root = path.resolve('artifacts/voice-latency');
const out = path.join(root, `${new Date().toISOString().replaceAll(':', '-')}-${phase}`);
mkdirSync(out, { recursive: true });
const baselinePath = option('--baseline', path.join(root, 'before.json'));
const report = { coverage: 'Long-lived reactive MediaStream → production AudioWorklet → PCM → real Kyutai STT → Flow. Native getUserMedia certification is separate. No transcript injection. Physical acoustics NOT MEASURED.', phase, samples, selection, expectedScenarios: samples, nativeCertification: 'NOT RUN — separate command', scenarios: [],
  coldWarm: { status: 'UNKNOWN', reason: 'Stack may reuse resident services; browser restart is not model cold start.' },
  latencyBaseline: phase === 'after' && existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath)) : undefined };
const resources = () => {
  try { return { at: new Date().toISOString(), vm: execFileSync('vm_stat', { encoding: 'utf8' }), processes: execFileSync('ps', ['-axo', 'pid,ppid,%cpu,rss,etime,comm'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).split('\n').filter(line => /Python|python|ollama|node|Chromium/.test(line)) }; }
  catch { return { at: new Date().toISOString(), status: 'UNAVAILABLE' }; }
};
const selected = scenarioIds.map(id => [...definitions, ...closedDefinitions, ...reactiveDefinitions].find(d => d.id === id));
if (selected.some(d => d.unavailable)) throw new Error('Service fault injection belongs in certification, not the shared latency session');
let services, stopStack;
const stopResources = monitorResources(path.join(out, 'processes.jsonl'));
const cleanup = installExitCleanup(async reason => {
  if (reason) report.error = `Benchmark interrupted: ${reason}`;
  try { await closeOwnedBrowsers(); }
  finally { await stopStack?.(); await stopResources(); report.browserLifecycle = { ...browserCounts }; saveReport(out, report); }
});
const watchdog = setTimeout(() => {
  report.error = 'Benchmark exceeded 20 minute deadline';
  void cleanup.finish().finally(() => process.exit(1));
}, 20 * 60 * 1000);
try {
  await cleanupStaleBrowsers();
  services = await stack({ registerCleanup: stop => { stopStack = stop; } });
  services.capturePcm = process.argv.includes('--capture-pcm');
  report.environment = { runtime: services.runtime, reasoner: services.reasoner, readiness: services.readiness };
  report.resourcesBefore = resources();
  await prepareLatencyFixtures(selected);
  await runLongLivedSamples({
    definitions: selected, samples,
    openSession: () => openLatencySession(services),
    runSample: async (def, index, session) => {
      const directory = path.join(out, `${index + 1}-${def.id}`);
      mkdirSync(directory, { recursive: true });
      const result = await (def.text ? native : reactive)(def, services, directory, session);
      result.id = `${def.id}/${index + 1}`;
      result.benchmarkScenario = def.id;
      result.trial = index + 1;
      result.microphoneIdentity = session.identity;
      if (result.screenshot) result.screenshot = path.relative(out, path.join(directory, result.screenshot));
      return result;
    },
    onResult: result => { report.scenarios.push(result); saveReport(out, report); },
  });
  assert.equal(browserCounts.launches, 1, 'Latency Chromium launch count');
  assert.equal(browserCounts.closes, 1, 'Latency Chromium close count');
  assert.equal(report.scenarios.length, samples, 'Expected sample count');
  const events = report.scenarios.flatMap(s => s.events);
  const captures = new Set(events.filter(e => e.event === 'voice.micFrameSent').map(e => `${e.state.sessionId}:${e.state.captureId}`));
  const epochs = new Set(events.filter(e => e.state?.type && !e.state.type.startsWith('tts.')).map(e => e.state?.workerEpoch).filter(Boolean));
  const ttsEpochs = new Set(events.filter(e => e.state?.type?.startsWith('tts.')).map(e => e.state.workerEpoch).filter(Boolean));
  assert.equal(captures.size, 1, 'One production microphone capture across all samples');
  assert.equal(epochs.size, 1, 'One real STT worker epoch across all samples');
  if (events.some(e => e.state?.type === 'tts.start')) assert.equal(ttsEpochs.size, 1, 'One real TTS worker epoch across all samples');
  report.resourceReuse = { captureIds: [...captures], sttWorkerEpochs: [...epochs], ttsWorkerEpochs: [...ttsEpochs], pages: 1, contexts: 1 };

} catch (error) { report.error = error.message; console.error(`[FAIL] ${error.message}`); }
finally {
  clearTimeout(watchdog);
  report.resourcesAfter = resources();
  await cleanup.finish();
  cleanup.dispose();
  // Store distributions and original scenario observations; never overwrite
  // a before measurement by an after run.
  writeFileSync(path.join(root, `${phase}${selection === 'all' ? '' : `-${selection}`}.json`), readFileSync(path.join(out, 'report.json')));
}
console.log(`Chromium launches: ${browserCounts.launches}\nChromium closes: ${browserCounts.closes}\nSamples executed: ${report.scenarios.length}/${samples}`);
console.log(`Long-lived reactive digital benchmark: ${report.overall}\nNative browser microphone certification: NOT RUN (separate lane)`);
console.table(report.latencySummary);
console.log(`Result: ${report.overall}\nEvidence: ${out}`);
if (report.overall !== 'PASS') process.exitCode = 1;
