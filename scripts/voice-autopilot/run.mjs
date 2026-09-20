import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { stack } from './stack.mjs';
import { saveReport } from './report.mjs';
import { definitions, native } from './native.mjs';
import { reactive, reactiveDefinitions } from './reactive.mjs';
import { ownership } from './ownership.mjs';
import { chaos } from './chaos.mjs';
import { calendar } from './calendar.mjs';
const out = path.resolve('artifacts/voice-autopilot', new Date().toISOString().replaceAll(':', '-'));
mkdirSync(out, { recursive: true });
const requested = process.argv.includes('--scenario') ? process.argv[process.argv.indexOf('--scenario') + 1] : null;
const report = { coverage: 'Native browser digital microphone and local models. Real room acoustics NOT MEASURED.', scenarios: [] };
let services;
console.log('FLOW VOICE AUTOPILOT\n────────────────────');
try {
  services = await stack(); report.environment = { status: 'PASS', frontend: 'PASS', desktopBridge: 'PASS', stt: 'PASS', tts: 'PASS', reasoner: services.reasoner, runtime: services.runtime };
  const selected = [...definitions, ...reactiveDefinitions, { id: 'dentist-confirmation', calendar: true }, { id: 'two-tab-ownership', ownership: true }, { id: 'ownership-chaos', chaos: true }].filter(d => !requested || requested.split(',').includes(d.id));
  if (!selected.length) throw new Error(`Unknown scenario: ${requested}`);
  for (const def of selected) {
    const result = await (def.calendar ? calendar : def.chaos ? chaos : def.ownership ? ownership : def.reactive ? reactive : native)(def, services, out);
    report.scenarios.push(result); saveReport(out, report);
    if (result.status !== 'PASS') console.log(`Replay: npm run test:voice:autopilot -- --scenario ${def.id}`);
  }
} catch (error) { report.error = error.message; console.error(`[FAIL] ${error.message}`); }
finally { await services?.stop(); saveReport(out, report); }
console.table(report.scenarios.map(s => ({ scenario: s.id, result: s.status, stage: s.failureStage ?? '' })));
console.log('SAFETY (executed assertions)');
console.table(report.safety);
console.log('TIMING (milliseconds; null means not applicable or not measured)');
console.table(report.scenarios.filter(s => s.events?.length).map(s => ({ scenario: s.id, ...s.latency })));
console.log('WAKE CURVE');
console.table(report.wakeCurve.map(s => ({ db: s.db, result: s.status, transcript: s.transcript, wakeMs: s.latency.wakeMs })));
console.log('COVERAGE\nBrowser digital microphone: MEASURED when its scenarios pass\nHeaded reactive microphone: MEASURED when its scenarios pass\nDevice loopback: NOT MEASURED\nReal-room acoustics: NOT MEASURED');
console.log(`OVERALL: ${report.overall}`);
console.log(`Evidence: ${out}\nHTML: artifacts/voice-autopilot/latest/index.html`);
if (report.error || report.scenarios.some(s => s.status !== 'PASS') || !report.scenarios.length) process.exitCode = 1;
