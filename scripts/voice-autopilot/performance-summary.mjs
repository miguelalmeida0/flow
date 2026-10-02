// Aggregate immutable real-run evidence; never manufacture a missing duration.
// Usage: node performance-summary.mjs before.json output.json run/report.json ...
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { distribution, metrics } from './latency.mjs';

const [beforePath, outputPath, ...afterPaths] = process.argv.slice(2);
if (!beforePath || !outputPath || !afterPaths.length) throw new Error('Provide baseline, output, and one or more completed report paths');
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const before = read(beforePath), reports = afterPaths.map(read);
const after = reports.flatMap(r => r.scenarios);
function observations(scenarios, key) {
  const failures = scenarios.filter(s => s.status !== 'PASS');
  return { allObserved: distribution(scenarios.map(s => s.latency?.[key])),
    successfulObserved: distribution(scenarios.filter(s => s.status === 'PASS').map(s => s.latency?.[key])),
    failedObserved: distribution(failures.map(s => s.latency?.[key])),
    scenarioCount: scenarios.length, failureCount: failures.length,
    missingOrNotApplicableCount: scenarios.filter(s => !Number.isFinite(s.latency?.[key])).length };
}
function resources(file) {
  const source = path.join(path.dirname(file), 'processes.jsonl');
  if (!existsSync(source)) return { source, status: 'NOT MEASURED' };
  const rows = readFileSync(source, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  const valid = rows.filter(r => Array.isArray(r.processes));
  const roles = [...new Set(valid.flatMap(r => r.processes.map(p => p.role)))];
  return { source, samples: valid.length, errors: rows.length - valid.length,
    runtimeRssMiB: distribution(valid.map(r => r.runtimeRssKiB / 1024)),
    roles: Object.fromEntries(roles.map(role => [role, {
      rssMiB: distribution(valid.filter(r => r.processes.some(p => p.role === role)).map(r => r.processes.filter(p => p.role === role).reduce((sum, p) => sum + p.rssKiB / 1024, 0))),
      cpuPercent: distribution(valid.filter(r => r.processes.some(p => p.role === role)).map(r => r.processes.filter(p => p.role === role).reduce((sum, p) => sum + p.cpuPercent, 0))),
      threads: distribution(valid.flatMap(r => r.processes.filter(p => p.role === role).map(p => p.threads))),
    }])), limitations: valid[0]?.limitations };
}
const result = {
  baseline: beforePath, runs: afterPaths.map((source, i) => ({ source, overall: reports[i].overall,
    expected: reports[i].expectedScenarios, passed: reports[i].scenarios.filter(s => s.status === 'PASS').length,
    failed: reports[i].scenarios.filter(s => s.status !== 'PASS').map(s => ({ id: s.id, failureStage: s.failureStage, errors: s.errors })) })),
  metrics: Object.fromEntries(Object.entries(metrics).map(([key, label]) => {
    const b = observations(before.scenarios, key), a = observations(after, key);
    const improvement = percentile => b.allObserved[percentile] > 0 && Number.isFinite(a.allObserved[percentile])
      ? 100 * (1 - a.allObserved[percentile] / b.allObserved[percentile]) : null;
    return [key, { label, before: b, after: a, improvementPercent: { p50: improvement('p50'), p95: improvement('p95') } }];
  })),
  resources: afterPaths.map(resources),
  coverage: 'Production digital microphone. Browser playable/source-ended boundaries are not physical speaker measurements. No far-field acoustics measured. Failed observations are retained; missing and not-applicable durations remain explicit.',
};
writeFileSync(outputPath, JSON.stringify(result, null, 2));
console.log(outputPath);
