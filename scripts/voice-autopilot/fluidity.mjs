import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { stack } from './stack.mjs';
import { native } from './native.mjs';
import { reactive } from './reactive.mjs';
import { saveReport } from './report.mjs';

const pauses = [200, 350, 500, 750, 1000, 1500];
const cases = [
  ...['Flower.', 'Flowchart.', 'Overflow.', 'The flow is steady.', 'Hey flowers.'].map((text, i) => ({ id: `adversarial-wake-${i + 1}`, group: 'wake', text, negative: true, systemVoice: 'Samantha' })),
  { id: 'hesitation-wake', group: 'natural', text: 'Flow, uh, open calendar.', segments: [{ text: 'Flow.' }, { text: 'Uh.' }, { text: 'Open calendar.' }], pauseMs: 350, route: '/calendar' },
  { id: 'spoken-correction', group: 'natural', text: 'Flow, open Monday, actually Thursday.', segments: [{ text: 'Flow, open Monday.' }, { text: 'Actually Thursday.' }], pauseMs: 350, date: '2026-09-24' },
  ...pauses.map(pauseMs => ({ id: `command-pause-${pauseMs}`, group: 'endpoint', text: 'Flow, open next Thursday.', segments: [{ text: 'Flow, open next' }, { text: 'Thursday.' }], pauseMs, date: '2026-09-24' })),
  ...pauses.map(pauseMs => ({ id: `dictation-pause-${pauseMs}`, group: 'endpoint', reactive: true, behavior: 'journal-dictation', pauseMs })),
  { id: 'pronoun-followup', group: 'natural', reactive: true, behavior: 'journal-delete-undo', deleteText: 'Delete it.' },
  { id: 'hesitant-rejection', group: 'natural', reactive: true, behavior: 'no-barge-in', replyText: 'Yeah... no, keep it.', replySegments: ['Yeah.', 'No, keep it.'], replyPauseMs: 500 },
  ...[-500, -200, -50, 50, 150].map(replyOffsetMs => ({ id: `turn-taking-${replyOffsetMs}`, group: 'turn-taking', reactive: true, behavior: 'confirm-barge-in', replyOffsetMs })),
];
const option = key => process.argv.includes(key) ? process.argv[process.argv.indexOf(key) + 1] : null;
const selected = cases.filter(c => (!option('--group') || c.group === option('--group')) && (!option('--scenario') || option('--scenario').split(',').includes(c.id)));
if (!selected.length) throw new Error('No matching real-audio fluidity scenarios');
const out = path.resolve('artifacts/voice-fluidity', new Date().toISOString().replaceAll(':', '-'));
mkdirSync(out, { recursive: true });
const report = { coverage: 'Additional real digital-microphone fixtures: lexical adversaries, hesitations, correction, pronouns, follow-ups and measured pauses. No transcript injection. Physical acoustics not measured.', expectedScenarios: selected.length, scenarios: [] };
let services;
const watchdog = setTimeout(() => { report.error = 'Fluidity runner exceeded its 45 minute bound'; saveReport(out, report); void Promise.resolve(services?.stop()).finally(() => process.exit(1)); }, 45 * 60 * 1000);
try {
  services = await stack();
  report.environment = { runtime: services.runtime, readiness: services.readiness };
  for (const def of selected) {
    const result = await (def.reactive ? reactive : native)(def, services, out);
    result.pauseMs = def.pauseMs ?? def.replyPauseMs;
    report.scenarios.push(result);
    saveReport(out, report);
  }
} catch (error) { report.error = error.message; console.error(`[FAIL] ${error.message}`); }
finally { clearTimeout(watchdog); await services?.stop(); saveReport(out, report); }
console.log(`Result: ${report.overall}\nEvidence: ${out}`);
if (report.overall !== 'PASS') process.exitCode = 1;
