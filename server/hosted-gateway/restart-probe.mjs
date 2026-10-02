// Two-phase local integration probe. A human/coordinator restarts Redis between
// phases; this script never restarts a service or resets a shared database.
// FLOW_TEST_REDIS_URL=redis://127.0.0.1:6381 node .../restart-probe.mjs prepare ARTIFACT.json
// FLOW_TEST_REDIS_URL=redis://127.0.0.1:6381 node .../restart-probe.mjs verify ARTIFACT.json
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createHostedGateway } from './index.mjs';
import { createRedisStore } from './store.mjs';

const [phase, artifactArgument] = process.argv.slice(2);
const url = process.env.FLOW_TEST_REDIS_URL;
assert(url && ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname),
  'FLOW_TEST_REDIS_URL must identify a local test Redis');
assert(['prepare', 'verify'].includes(phase) && artifactArgument,
  'Expected prepare|verify ARTIFACT.json');
const artifactPath = resolve(artifactArgument);
const bounds = {
  parentDailyMicros: 100,
  environmentDailyMicros: 100,
  identityDailyRequests: 100,
  identityDailyAudioMs: 900000,
  globalVoiceLimit: 5,
  voiceSessionMs: 300000,
};
const currentRunId = async client => {
  const info = await client.info('server');
  const runId = /run_id:([a-f0-9]{40})/.exec(info)?.[1];
  assert(runId, 'Redis must expose its actual run_id');
  return runId;
};
const ledgerSnapshot = async (store, key) => Object.fromEntries(
  Object.entries(await store.client.hGetAll(key)),
);

if (phase === 'prepare') {
  const namespace = `flow-test-${randomUUID()}`;
  const store = await createRedisStore({ url, parentNamespace: namespace, environment: 'restart-probe' });
  try {
    await store.initializeLedger(bounds);
    await store.reserve({ identity: 'tester', costMicros: 40, requests: 1 });
    await store.checkReady();
    const runIdBefore = await currentRunId(store.client);
    const ledgerBefore = await ledgerSnapshot(store, `${namespace}:ledger`);
    assert.equal(ledgerBefore.redisRunId, runIdBefore);
    assert(Object.keys(ledgerBefore).some(key => /^spend:\d+$/.test(key) && ledgerBefore[key] === '40'));
    // Ensure the existing ledger survives the coordinated restart. No FLUSH or
    // CONFIG changes: SAVE persists Redis's current local test data unchanged.
    await store.client.sendCommand(['SAVE']);
    await mkdir(dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, JSON.stringify({
      status: 'ready-for-coordinated-restart', namespace, runIdBefore, ledgerBefore,
    }, null, 2) + '\n', { flag: 'wx' });
    process.stdout.write(JSON.stringify({ status: 'ready-for-coordinated-restart', namespace, artifactPath }) + '\n');
  } catch (error) {
    await store.deleteTestNamespace();
    throw error;
  } finally {
    await store.close();
  }
} else {
  const state = JSON.parse(await readFile(artifactPath, 'utf8'));
  assert.equal(state.status, 'ready-for-coordinated-restart');
  assert(/^flow-test-[a-f0-9-]+$/.test(state.namespace), 'Only this probe test namespace is permitted');
  const store = await createRedisStore({ url, parentNamespace: state.namespace, environment: 'restart-probe' });
  let gateway;
  let distDir;
  try {
    const runIdAfter = await currentRunId(store.client);
    assert.notEqual(runIdAfter, state.runIdBefore, 'Actual Redis process must have restarted');
    const ledgerAfter = await ledgerSnapshot(store, `${state.namespace}:ledger`);
    assert.deepEqual(ledgerAfter, state.ledgerBefore, 'Ledger and charged counters must survive the restart');
    await assert.rejects(store.checkReady(), /ledger reconciliation required/);
    await assert.rejects(store.reserve({ identity: 'tester', costMicros: 1, requests: 1 }), /ledger reconciliation required/);
    await assert.rejects(store.initializeLedger(bounds), /already initialized/);

    distDir = await mkdtemp(join(tmpdir(), 'flow-redis-restart-'));
    await writeFile(join(distDir, 'index.html'), '<html><head></head><body>Typed application fixture</body></html>');
    let providerCalls = 0;
    const origin = 'https://flow.example';
    gateway = createHostedGateway({
      config: {
        origin, distDir, releaseId: 'redis-restart-probe', inferenceEnabled: true,
        consentVersion: 'v1', sessionTtlMs: 60000, requestDeadlineMs: 1000,
        maxInputBytes: 12000, maxOutputTokens: 100, interpretCostMicros: 1,
      },
      store,
      providers: { interpret: {
        validateRequest: body => body,
        run: async () => { providerCalls += 1; return { ok: true }; },
      } },
    });
    await new Promise(resolveListen => gateway.server.listen(0, '127.0.0.1', resolveListen));
    const base = `http://127.0.0.1:${gateway.server.address().port}`;
    const staticResponse = await fetch(base + '/journal');
    assert.equal(staticResponse.status, 200);
    assert.match(await staticResponse.text(), /"inferenceEnabled":false/);
    const health = await (await fetch(base + '/api/health')).json();
    assert.equal(health.applicationReady, true);
    assert.equal(health.inferenceEnabled, false);

    const invite = await store.issueInvite('tester');
    const login = await fetch(base + '/api/session', {
      method: 'POST', headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ invite, consentVersion: 'v1' }),
    });
    assert.equal(login.status, 200, 'Authentication may remain available');
    const session = await login.json();
    const interpretation = await fetch(base + '/api/interpret', {
      method: 'POST',
      headers: {
        origin, 'content-type': 'application/json', 'x-flow-csrf': session.csrf,
        cookie: login.headers.get('set-cookie').split(';')[0],
      },
      body: JSON.stringify({ contractVersion: '1', input: 'hello' }),
    });
    assert.equal(interpretation.status, 503);
    assert.equal(providerCalls, 0);
    assert.deepEqual(await ledgerSnapshot(store, `${state.namespace}:ledger`), state.ledgerBefore);
    await writeFile(artifactPath, JSON.stringify({
      ...state, status: 'passed', runIdAfter, ledgerAfter, providerCalls,
      checks: ['actual Redis process changed', 'ledger and counters retained',
        'readiness refused', 'reservation refused', 'reinitialization refused',
        'static deep link served', 'authentication available', 'interpretation refused'],
    }, null, 2) + '\n');
    process.stdout.write(JSON.stringify({ status: 'passed', artifactPath, providerCalls }) + '\n');
  } finally {
    await gateway?.shutdown();
    if (distDir) await rm(distDir, { recursive: true, force: true });
    await store.deleteTestNamespace();
    await store.close();
  }
}
