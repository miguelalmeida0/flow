import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { stack } from './stack.mjs';
import { saveReport } from './report.mjs';
import { definitions, native } from './native.mjs';
import { reactive, reactiveDefinitions } from './reactive.mjs';
import { ownership } from './ownership.mjs';
import { chaos } from './chaos.mjs';
import { calendar } from './calendar.mjs';
import { cleanupStaleBrowsers, closeOwnedBrowsers, installExitCleanup } from './browser-lifecycle.mjs';
const out = path.resolve('artifacts/voice-autopilot', new Date().toISOString().replaceAll(':', '-'));
mkdirSync(out, { recursive: true });
const requested = process.argv.includes('--scenario') ? process.argv[process.argv.indexOf('--scenario') + 1] : null;
const report = { coverage: 'Native browser digital microphone and local models. Real room acoustics NOT MEASURED.', scenarios: [] };
if (process.argv.includes('--baseline')) {
  const baseline = JSON.parse(readFileSync(process.argv[process.argv.indexOf('--baseline') + 1], 'utf8'));
  report.latencyBaseline = { scenarios: baseline.scenarios.map(s => ({ id: s.id, status: s.status, latency: s.latency })) };
}
let services, stopStack;
const cleanup = installExitCleanup(async reason => {
  if (reason) report.error = `Certification interrupted: ${reason}`;
  try { await closeOwnedBrowsers(); }
  finally { await stopStack?.(); saveReport(out, report); }
});
console.log('FLOW VOICE AUTOPILOT\n────────────────────');
try {
  await cleanupStaleBrowsers();
  services = await stack({ registerCleanup: stop => { stopStack = stop; } }); report.environment = { status: 'PASS', frontend: 'PASS', desktopBridge: 'PASS', stt: 'PASS', tts: 'PASS', reasoner: services.reasoner, runtime: services.runtime, readiness: services.readiness };
  const canonical = process.argv.includes('--native');
  const selected = [...(canonical ? definitions.filter(d => ['wake-0db', 'add-anita', 'day-query'].includes(d.id)) : definitions), ...reactiveDefinitions, { id: 'dentist-confirmation', calendar: true }, { id: 'two-tab-ownership', ownership: true }, { id: 'ownership-chaos', chaos: true }].filter(d => (!canonical || ['wake-0db', 'add-anita', 'day-query'].includes(d.id)) && (!requested || requested.split(',').includes(d.id)));
  if (!selected.length) throw new Error(`Unknown scenario: ${requested}`);
  for (const def of selected) {
    const result = await (def.calendar ? calendar : def.chaos ? chaos : def.ownership ? ownership : def.reactive ? reactive : native)(def, services, out);
    report.scenarios.push(result); saveReport(out, report);
    if (result.status !== 'PASS') console.log(`Replay: npm run test:voice:autopilot -- --scenario ${def.id}`);
  }
} catch (error) { report.error = error.message; console.error(`[FAIL] ${error.message}`); }
finally { await cleanup.finish(); cleanup.dispose(); }
console.table(report.scenarios.map(s => ({ scenario: s.id, result: s.status, stage: s.failureStage ?? '' })));
console.log('SAFETY (executed assertions)');
console.table(report.safety);
console.log('TIMING (milliseconds; null means not applicable or not measured)');
console.table(report.scenarios.filter(s => s.events?.length).map(s => ({ scenario: s.id, ...s.latency })));
console.log('WAKE CURVE');
console.table(report.wakeCurve.map(s => ({ db: s.db, result: s.status, transcript: s.transcript, wakeMs: s.latency.wakeMs })));
console.log('COVERAGE\nBrowser digital microphone: MEASURED when its scenarios pass\nHeaded reactive microphone: MEASURED when its scenarios pass\nDevice loopback: NOT MEASURED\nReal-room acoustics: NOT MEASURED');
console.log(`OVERALL: ${report.overall}`);
if (process.argv.includes('--native')) console.log(`Native browser microphone certification: ${report.overall}`);
console.log(`Evidence: ${out}\nHTML: artifacts/voice-autopilot/latest/index.html`);
if (report.error || report.scenarios.some(s => s.status !== 'PASS') || !report.scenarios.length) process.exitCode = 1;
