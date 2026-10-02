import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

function counts(values) {
  const result = new Map();
  for (const value of values) result.set(value, (result.get(value) ?? 0) + 1);
  return result;
}
function contains(actual, required) {
  const available = counts(actual);
  return [...counts(required)].every(([id, count]) => (available.get(id) ?? 0) >= count);
}

/** Policy is an independently reviewed required-test baseline, never the
 * results of this execution. No exception has been approved for this release. */
export function validateRelease(input) {
  const errors = [];
  const fail = message => errors.push(message);
  if (!input || !/^[a-f0-9]{64}$/.test(input.candidate ?? '') || input.candidate !== input.currentCandidate) fail('candidate identity missing or changed');
  if (!input?.runId) fail('run identity missing');
  if (!input?.required || !Object.keys(input.required).length) fail('required baseline missing');
  for (const [name, ids] of Object.entries(input?.required ?? {})) if (!name || !Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string' || !id.trim())) fail(`invalid required policy: ${name}`);
  const requiredChecks = input?.requiredChecks;
  if (!Array.isArray(requiredChecks) || !requiredChecks.length || requiredChecks.some(name => typeof name !== 'string' || !name.trim()) || new Set(requiredChecks).size !== requiredChecks.length) fail('required command policy invalid');
  if (!Array.isArray(input?.exceptions) || input.exceptions.length) fail('unapproved exception policy');
  const checks = input?.checks;
  if (!Array.isArray(checks) || !checks.length) fail('command receipts missing');
  const checkNames = (checks ?? []).map(check => check.name);
  if (new Set(checkNames).size !== checkNames.length || !Array.isArray(requiredChecks) || !contains(checkNames, requiredChecks) || !contains(requiredChecks, checkNames)) fail('required command receipts differ');
  for (const check of checks ?? []) {
    if (!check.name || check.complete !== true || check.exitCode !== 0 || check.candidate !== input.candidate || check.runId !== input.runId) fail(`command failed or incomplete: ${check.name}`);
  }
  const suites = input?.suites;
  if (!Array.isArray(suites) || !suites.length) fail('suite reports missing');
  const names = (suites ?? []).map(suite => suite.name);
  if (new Set(names).size !== names.length) fail('duplicate suite report');
  for (const name of Object.keys(input?.required ?? {})) if (!names.includes(name)) fail(`required suite missing: ${name}`);
  for (const suite of suites ?? []) {
    const prefix = suite.name ?? 'unnamed';
    if (suite.candidate !== input.candidate || suite.runId !== input.runId) fail(`${prefix}: stale or foreign report`);
    if (suite.complete !== true || suite.exitCode !== 0 || !Array.isArray(suite.errors) || suite.errors.length) fail(`${prefix}: failed, unfinished or errored run`);
    if (!Array.isArray(suite.inventory) || !suite.inventory.length || suite.inventory.some(id => typeof id !== 'string' || !id)) { fail(`${prefix}: invalid/empty inventory`); continue; }
    const required = input.required?.[suite.name];
    if (!Array.isArray(required) || !required.length || !contains(suite.inventory, required)) fail(`${prefix}: required test disappeared or multiplicity decreased`);
    if (!Array.isArray(suite.results) || !suite.results.length) { fail(`${prefix}: empty results`); continue; }
    const actual = suite.results.map(result => result.id);
    if (actual.length !== suite.inventory.length || !contains(actual, suite.inventory) || !contains(suite.inventory, actual)) fail(`${prefix}: inventory/result identities differ`);
    const occurrences = new Map();
    for (const result of suite.results) {
      const occurrence = (occurrences.get(result.id) ?? 0) + 1; occurrences.set(result.id, occurrence);
      if (result.status !== 'passed' || result.retry !== 0 || result.repeat !== 0) fail(`${prefix}: ${result.id} [${occurrence}] ${result.status}, retry=${result.retry}, repeat=${result.repeat}`);
    }
  }
  return { pass: errors.length === 0, errors };
}

export function validateCorpus(corpus, candidate, runId) {
  return Boolean(corpus && corpus.candidate===candidate && corpus.runId===runId && corpus.complete===true && corpus.failed===0 && corpus.skipped===0 && corpus.missing===0 && Array.isArray(corpus.manifest) && corpus.manifest.length>0 && corpus.expected===corpus.manifest.length && corpus.cases===corpus.expected && corpus.passed===corpus.expected && new Set(corpus.manifest).size===corpus.expected);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let result;
  try { result = validateRelease(JSON.parse(readFileSync(process.argv[2], 'utf8'))); }
  catch (error) { result = { pass: false, errors: [`missing or invalid evidence: ${error.message}`] }; }
  if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.pass ? 0 : 1;
}
