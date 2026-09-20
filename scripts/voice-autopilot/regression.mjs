import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const [currentPath, baselinePath, outputPath = 'artifacts/voice-autopilot/regression-delta.json'] = process.argv.slice(2);
if (!currentPath) throw new Error('Usage: node scripts/voice-autopilot/regression.mjs <current.json> [baseline.json] [output.json]');
function identities(file) {
  const report = JSON.parse(readFileSync(file));
  return report.testResults.flatMap(suite => suite.assertionResults.map(test => ({
    file: path.relative(process.cwd(), suite.name).replace(/^artifacts\/voice-autopilot\/head-baseline\//, ''), name: test.fullName, status: test.status,
  })));
}
let current = [];
for (const file of currentPath.split(',')) {
  const replay = identities(file), suites = new Set(replay.map(t => t.file));
  current = [...current.filter(t => !suites.has(t.file)), ...replay];
}
const key = test => `${test.file} :: ${test.name}`;
const failed = tests => new Set(tests.filter(t => t.status === 'failed').map(key));
const currentFailed = failed(current);
let result = { status: 'BASELINE_UNAVAILABLE', currentFailures: [...currentFailed], new: null, fixed: null, unchanged: null,
  limitation: 'The pre-repair baseline was deleted by a concurrent cleanup. Equal counts cannot establish a regression delta.' };
if (baselinePath && existsSync(baselinePath)) {
  const baseline = identities(baselinePath), baselineFailed = failed(baseline);
  const executed = new Set(current.filter(t => t.status === 'passed' || t.status === 'failed').map(key));
  result = { status: 'COMPARED_EXACT_IDENTITIES',
    new: [...currentFailed].filter(id => !baselineFailed.has(id)),
    fixed: [...baselineFailed].filter(id => executed.has(id) && !currentFailed.has(id)),
    unchanged: [...baselineFailed].filter(id => currentFailed.has(id)),
    noLongerExecuted: [...baselineFailed].filter(id => !executed.has(id)) };
}
result.provenance = { currentReports: currentPath.split(','), baselineReport: baselinePath ?? null,
  baselineKind: baselinePath?.includes('head-baseline') ? 'Isolated clean HEAD 69beaf4; original dirty-tree baseline was deleted by concurrent cleanup' : 'supplied report',
  comparisonKey: 'test file + full test name', failedOccurrences: current.filter(t => t.status === 'failed').length };
writeFileSync(outputPath, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
