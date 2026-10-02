import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRelease, validateCorpus } from './ci-release-gate.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const hash = 'a'.repeat(64);
function fixture() {
  return { candidate: hash, currentCandidate: hash, runId: 'test-run', required: { unit: ['a', 'a', 'b'] }, requiredChecks:['build'], exceptions: [],
    checks: [{name:'build',exitCode:0,complete:true,candidate:hash,runId:'test-run'}],
    suites: [{ name:'unit', candidate:hash, runId:'test-run', complete:true, exitCode:0, errors:[], inventory:['a','a','b'], results:[{id:'a',status:'passed',retry:0,repeat:0},{id:'a',status:'passed',retry:0,repeat:0},{id:'b',status:'passed',retry:0,repeat:0}] }] };
}
test('accepts only complete matching evidence',()=>assert.equal(validateRelease(fixture()).pass,true));
test('new failure cannot hide behind fixing an old identity',()=>{const x=fixture();x.exceptions=[{suite:'unit',id:'a',cause:'old',owner:'team',expires:'2999-01-01',critical:false}];x.suites[0].results[2].status='failed';x.suites[0].exitCode=1;assert.equal(validateRelease(x).pass,false);});
test('candidate collection cannot erase a required test',()=>{const x=fixture();x.suites[0].inventory.pop();x.suites[0].results.pop();assert.match(validateRelease(x).errors.join(' '),/required/);});
test('multiplicity is preserved for duplicate truncated titles',()=>{const x=fixture();x.suites[0].inventory.splice(0,1);x.suites[0].results.splice(0,1);assert.equal(validateRelease(x).pass,false);});
for(const mutate of [x=>x.suites=[],x=>x.required={},x=>x.suites[0].inventory=[],x=>x.suites[0].results=[],x=>x.suites[0].complete=false,x=>x.suites[0].errors=['hook failure'],x=>x.suites[0].exitCode=1,x=>x.currentCandidate='b'.repeat(64),x=>x.suites[0].runId='old',x=>x.suites[0].results[0].status='skipped',x=>x.suites[0].results[0].status='todo',x=>x.suites[0].results[0].retry=1,x=>x.checks[0].complete=false]) {
  test(`rejects incomplete or invalid evidence ${String(mutate)}`,()=>{const x=fixture();mutate(x);assert.equal(validateRelease(x).pass,false);});
}
test('exceptions never silently turn on',()=>{const x=fixture();x.exceptions=[{suite:'unit',id:'b',cause:'debt',owner:'team',expires:'2999-01-01',critical:false}];assert.equal(validateRelease(x).pass,false);});
test('deleted required command cannot be replaced by an arbitrary check',()=>{const x=fixture();x.checks[0].name='arbitrary';assert.equal(validateRelease(x).pass,false);});
test('malformed baseline and duplicate command receipts fail closed',()=>{for(const mutate of [x=>x.required.unit=[''],x=>x.required.unit=[null],x=>x.requiredChecks=[],x=>x.checks.push(x.checks[0])]){const x=fixture();mutate(x);assert.equal(validateRelease(x).pass,false);}});
test('actual Vitest configured retry passes runner but is rejected by strict gate',()=>{
  mkdirSync('node_modules/.tmp',{recursive:true});
  const directory=mkdtempSync(resolve('node_modules/.tmp/retry-proof-')),path=`${directory}/telemetry.json`;
  execFileSync(resolve('node_modules/.bin/vitest'),['run','--config','scripts/fixtures/retry-proof.config.mjs','--retry=0','--reporter=./scripts/vitest-release-reporter.mjs'],{stdio:'pipe',env:{...process.env,TMPDIR:resolve('node_modules/.tmp'),FLOW_VITEST_RECEIPT:path,FLOW_RELEASE_RUN_ID:'test-run',FLOW_RELEASE_CANDIDATE:hash}});
  const telemetry=JSON.parse(readFileSync(path,'utf8'));
  assert.equal(telemetry.complete,true);assert.equal(telemetry.results[0].status,'passed');assert.equal(telemetry.results[0].retry,1);
  const x=fixture();x.required.unit=telemetry.results.map(row=>row.id);x.suites[0]={name:'unit',exitCode:0,inventory:x.required.unit,...telemetry};
  assert.equal(validateRelease(x).pass,false);
});
test('actual collected nested test identities match required policy and preserve duplicate multiplicity',async()=>{
  const {testIdentity,vitestInventory}=await import('./release-report-adapters.mjs');
  mkdirSync('node_modules/.tmp',{recursive:true});
  const directory=mkdtempSync(resolve('node_modules/.tmp/identity-proof-')),path=`${directory}/telemetry.json`;
  const config=['--config','scripts/fixtures/identity-proof.config.mjs'];
  const collected=execFileSync(resolve('node_modules/.bin/vitest'),['list',...config,'--json'],{encoding:'utf8',env:{...process.env,TMPDIR:resolve('node_modules/.tmp')}});
  execFileSync(resolve('node_modules/.bin/vitest'),['run',...config,'--retry=0','--reporter=./scripts/vitest-release-reporter.mjs'],{stdio:'pipe',env:{...process.env,TMPDIR:resolve('node_modules/.tmp'),FLOW_VITEST_RECEIPT:path,FLOW_RELEASE_RUN_ID:'test-run',FLOW_RELEASE_CANDIDATE:hash}});
  const id=testIdentity('scripts/fixtures/identity-proof.test.mjs','gate identity parent > preserves the nested identity');
  const inventory=vitestInventory(JSON.parse(collected),process.cwd());
  assert.deepEqual(inventory,[id,id]);
  const telemetry=JSON.parse(readFileSync(path,'utf8')),x=fixture();
  x.required.unit=[id,id];x.suites[0]={name:'unit',exitCode:0,inventory,...telemetry};
  assert.equal(validateRelease(x).pass,true);
  x.suites[0].inventory.pop();x.suites[0].results.pop();
  assert.equal(validateRelease(x).pass,false);
});
test('old complete corpus cannot qualify a new candidate/run',()=>{
  const corpus={candidate:hash,runId:'old',manifest:['a'],expected:1,cases:1,passed:1,complete:true,failed:0,skipped:0,missing:0};
  assert.equal(validateCorpus(corpus,hash,'new'),false);
  assert.equal(validateCorpus({...corpus,runId:'new'},hash,'new'),true);
  assert.equal(validateCorpus({...corpus,runId:'new',manifest:[]},hash,'new'),false);
});

test("frozen source rejects changed, missing, extra and mode drift", async()=>{
 const {verifySourceManifest}=await import("./release-source-manifest.mjs");
 const {writeFileSync,chmodSync,unlinkSync}=await import("node:fs");
 const {createHash}=await import("node:crypto");
 const dir=mkdtempSync(resolve("node_modules/.tmp/manifest-proof-"));
 const sha=value=>createHash("sha256").update(value).digest("hex");
 const path=`${dir}/source.ts`;writeFileSync(path,"original");chmodSync(path,0o644);
 const files=[{path:"source.ts",sha256:sha("original"),bytes:8,mode:0o644}];
 const manifest={version:1,files,sourceManifestSha256:sha(JSON.stringify(files))};
 assert.equal(verifySourceManifest(dir,manifest),manifest.sourceManifestSha256);
 writeFileSync(`${dir}/extra.ts`,"extra");assert.throws(()=>verifySourceManifest(dir,manifest),/Unexpected/);unlinkSync(`${dir}/extra.ts`);
 chmodSync(path,0o755);assert.throws(()=>verifySourceManifest(dir,manifest),/mismatch/);chmodSync(path,0o644);
 writeFileSync(path,"modified");assert.throws(()=>verifySourceManifest(dir,manifest),/mismatch/);
 unlinkSync(path);assert.throws(()=>verifySourceManifest(dir,manifest));
});

test("Playwright repetition configuration must explicitly be one",async()=>{
 const {playwrightResults}=await import("./release-report-adapters.mjs");
 const report={config:{projects:[{id:"chromium",repeatEach:1}]},errors:[],suites:[{title:"x.spec.ts",file:"x.spec.ts",specs:[{file:"x.spec.ts",title:"case",tests:[{projectId:"chromium",projectName:"chromium",expectedStatus:"passed",results:[{status:"passed",retry:0}]}]}]}]};
 assert.equal(playwrightResults(report).results[0].repeat,0);
 report.config.projects[0].repeatEach=2;assert.equal(playwrightResults(report).results[0].repeat,undefined);
});
