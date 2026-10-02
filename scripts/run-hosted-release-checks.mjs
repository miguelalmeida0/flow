import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateRelease, validateCorpus } from './ci-release-gate.mjs';
import { vitestInventory, vitestResults, playwrightResults } from './release-report-adapters.mjs';
import { verifySourceManifest } from './release-source-manifest.mjs';

const root = process.cwd(), runId = randomUUID();
const output = resolve(process.env.FLOW_RELEASE_EVIDENCE_DIR ?? 'artifacts/hosted-release/checks', runId);
mkdirSync(output, { recursive: true });
const policy = JSON.parse(readFileSync('docs/quality/hosted-required-tests.json', 'utf8'));
const frozenManifest = process.env.FLOW_RELEASE_SOURCE_MANIFEST
  ? JSON.parse(readFileSync(process.env.FLOW_RELEASE_SOURCE_MANIFEST,'utf8')) : undefined;
function candidateHash() {
  if (frozenManifest) return verifySourceManifest(root,frozenManifest);
  const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  const hash = createHash('sha256');
  for (const file of [...new Set(files)].sort()) {
    if (/^(artifacts|test-results|dist|playwright-report)\//.test(file) || !existsSync(file)) continue;
    hash.update(file + '\0').update(readFileSync(file)).update('\0');
  }
  return hash.digest('hex');
}
const candidate = candidateHash(), checks = [], suites = [];
writeFileSync(`${output}/candidate.json`, JSON.stringify({candidate,runId,runtime:{node:process.version,platform:process.platform,arch:process.arch,execPath:process.execPath},policySha256:createHash('sha256').update(JSON.stringify(policy)).digest('hex')},null,2));
async function run(name, executable, args, extraEnv = {}) {
  const receipt = { name, candidate, runId, complete: false, exitCode: null };
  checks.push(receipt);
  const receiptPath = `${output}/${name}-receipt.json`, logPath = `${output}/${name}.log`;
  writeFileSync(receiptPath, JSON.stringify(receipt,null,2));
  writeFileSync(logPath, '');
  try {
    receipt.exitCode = await new Promise(resolveRun => {
      const child = spawn(executable, args, { cwd: root, env: {...process.env,TMPDIR:resolve('node_modules/.tmp'),...extraEnv}, stdio:['ignore','pipe','pipe'] });
      child.stdout.on('data', chunk => appendFileSync(logPath,chunk)); child.stderr.on('data', chunk => appendFileSync(logPath,chunk));
      child.once('error', error => { appendFileSync(logPath,error.message); resolveRun(1); });
      child.once('close', code => resolveRun(code ?? 1));
    });
    receipt.complete = true;
  } finally { writeFileSync(receiptPath, JSON.stringify(receipt,null,2)); }
  console.log(`${name}: ${receipt.exitCode === 0 ? 'PASS' : 'FAIL'}`);
  return receipt.exitCode;
}
const bin = name => resolve(`node_modules/.bin/${name}`);
const parse = path => JSON.parse(readFileSync(path, 'utf8'));
await run('gate-tests','node',['--test','scripts/ci-release-gate.test.mjs']);
await run('packaging-tests','node',['--test','scripts/build-hosted-image.test.mjs']);
await run('lint','npm',['run','lint']);
await run('build','npm',['run','build']);
await run('types',bin('tsc'),['-b']);
await run('audit-production','npm',['audit','--omit=dev','--audit-level=moderate','--json']);
await run('audit-development','npm',['audit','--audit-level=high','--json']);
for (const [name, config] of [['unit',[]],['server',['--config','vitest.server.config.ts']]]) {
  const inventoryPath = `${output}/${name}-inventory.json`, reportPath = `${output}/${name}.json`;
  await run(`${name}-collect`,bin('vitest'),['list',...config,`--json=${inventoryPath}`]);
  const telemetryPath = `${output}/${name}-telemetry.json`;
  const exitCode = await run(name,bin('vitest'),['run',...config,'--maxWorkers=1','--retry=0','--reporter=json','--reporter=./scripts/vitest-release-reporter.mjs',`--outputFile=${reportPath}`],{FLOW_VITEST_RECEIPT:telemetryPath,FLOW_RELEASE_RUN_ID:runId,FLOW_RELEASE_CANDIDATE:candidate,FLOW_CORPUS_EVIDENCE_DIR:output});
  try {
    const telemetry=parse(telemetryPath), raw=vitestResults(parse(reportPath),root);
    suites.push({name,...telemetry,exitCode,inventory:vitestInventory(parse(inventoryPath),root),errors:[...telemetry.errors,...raw.errors]});
  }
  catch (error) { suites.push({name,candidate,runId,complete:false,exitCode,errors:[error.message]}); }
}
for (const [name, config] of [['browser','playwright.config.ts'],['hosted-browser','playwright.hosted.config.ts']]) {
  const inventoryPath = `${output}/${name}-inventory.json`, reportPath = `${output}/${name}.json`;
  const browserEnv = {FLOW_RELEASE_QA:'1',FLOW_E2E_PORT:process.env.FLOW_E2E_PORT ?? '5318'};
  await run(`${name}-collect`,bin('playwright'),['test',`--config=${config}`,'--list','--reporter=json'],{...browserEnv,PLAYWRIGHT_JSON_OUTPUT_FILE:inventoryPath});
  const exitCode = await run(name,bin('playwright'),['test',`--config=${config}`,'--workers=1','--retries=0','--reporter=json',`--output=${output}/${name}-results`],{...browserEnv,PLAYWRIGHT_JSON_OUTPUT_FILE:reportPath});
  try { suites.push({name,candidate,runId,complete:true,exitCode,inventory:playwrightResults(parse(inventoryPath)).results.map(row=>row.id),...playwrightResults(parse(reportPath))}); }
  catch (error) { suites.push({name,candidate,runId,complete:false,exitCode,errors:[error.message]}); }
}
const input = {candidate,currentCandidate:candidateHash(),runId,required:policy.required,requiredChecks:policy.requiredChecks,exceptions:policy.exceptions,checks,suites};
const verdict = validateRelease(input);
try { const corpus=parse(`${output}/production-pipeline-report.json`); if(!validateCorpus(corpus,candidate,runId))verdict.errors.push('corpus evidence foreign, incomplete or failed'); }
catch { verdict.errors.push('corpus evidence absent'); }
verdict.pass = verdict.errors.length === 0;
writeFileSync(`${output}/gate-input.json`,JSON.stringify(input,null,2));
writeFileSync(`${output}/gate-result.json`,JSON.stringify(verdict,null,2));
console.log(JSON.stringify({pass:verdict.pass,errors:verdict.errors.length,evidence:output}));
process.exitCode=verdict.pass?0:1;
