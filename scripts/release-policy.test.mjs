import test from 'node:test';
import assert from 'node:assert/strict';
import { gates, micChecks, verdict, assertDeployable } from './release-policy.mjs';
function fixture() {
  const m = { gitSha: 'a'.repeat(40), artifactHash: 'b'.repeat(64), dirty: false,
    dependencyLockHash:'c'.repeat(64), node:'v22.23.2', buildTimestamp:'2026-10-01T12:00:00Z',
    results: Object.fromEntries(gates.map(k => [k, {status: 'PASS'}])) };
  m.physicalMicrophone = {status: 'PASS', gitSha:m.gitSha, artifactHash:m.artifactHash,
    tester:'Human', mac:'Mac', microphone:'Physical built-in', browser:'Chrome', origin:'http://127.0.0.1:4188/flow/',
    testedAt:'2026-10-01T12:00:00Z', checks:Object.fromEntries(micChecks.map(k=>[k,'PASS']))};
  return m;
}
test('every individual required gate fails closed for missing, failed and skipped results', () => {
  for (const gate of gates) for (const status of ['FAIL','NOT RUN','SKIPPED',undefined]) {
    const m=fixture(); m.results[gate]={status}; assert.equal(verdict(m),'BLOCKED',gate);
  }
});
test('unsupported Node and missing artifact provenance cannot authorize release', () => {
  for(const [key,value] of [['node','v20.0.0'],['node',undefined],['dependencyLockHash',''],['buildTimestamp','invalid'],['artifactHash','not-a-hash']]){
    const m=fixture();m[key]=value;assert.equal(verdict(m),'BLOCKED',key);
  }
});
test('digital microphone and incomplete human checklist cannot authorize release', () => {
  for (const key of micChecks) { const m=fixture(); m.physicalMicrophone.checks[key]='NOT PERFORMED'; assert.equal(verdict(m),'READY FOR HUMAN MIC GATE'); }
  const m=fixture(); m.physicalMicrophone.status='DIGITAL PASS'; assert.throws(()=>assertDeployable(m,m.gitSha,m.artifactHash));
});
test('evidence must match both exact commit and artifact, with a clean tree', () => {
  const m=fixture(); assert.doesNotThrow(()=>assertDeployable(m,m.gitSha,m.artifactHash));
  assert.throws(()=>assertDeployable(m,'c'.repeat(40),m.artifactHash));
  assert.throws(()=>assertDeployable(m,m.gitSha,'d'.repeat(64)));
  m.dirty=true; assert.equal(verdict(m),'BLOCKED');
});
