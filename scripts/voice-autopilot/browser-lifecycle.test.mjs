import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { runLongLivedSamples } from './latency-session.mjs';
import { staleBrowser, launchOwnedBrowser } from './browser-lifecycle.mjs';

for (const samples of [1, 10, 50]) test(`${samples} latency samples launch Chromium once and retain the page`, async t => {
  const page = {}, context = {};
  const close = t.mock.fn(async () => {}), reset = t.mock.fn(async () => {});
  const processes = [{ pid: process.pid, started: 'owner', command: 'node benchmark' }];
  const chromium = { launch: t.mock.fn(async options => {
    assert.equal(options.headless, false);
    for (const signal of ['handleSIGINT', 'handleSIGTERM', 'handleSIGHUP']) assert.equal(options[signal], false);
    processes.push({ pid: 12345, started: 'browser', command: `Chromium ${options.args.join(' ')}` });
    return { contexts: () => [], close };
  }) };
  const seen = [];
  await runLongLivedSamples({ definitions: [{ id: 'wake' }, { id: 'barge-in' }], samples,
    openSession: async () => ({ ...await launchOwnedBrowser(chromium, { headless: false, args: [] }, () => processes), page, context, reset }),
    runSample: async (def, index, session) => {
      assert.equal(session.page, page); assert.equal(session.context, context);
      seen.push([def.id, index]); return { status: 'PASS' };
    }, onResult: async () => {} });
  assert.equal(chromium.launch.mock.callCount(), 1);
  assert.equal(close.mock.callCount(), 1);
  assert.equal(reset.mock.callCount(), samples);
  assert.equal(seen.length, samples);
  assert.deepEqual(seen.map(([id]) => id), Array.from({ length: samples }, (_, i) => i % 2 ? 'barge-in' : 'wake'));
});

for (const failure of ['scenario', 'exception', 'reset', 'report']) test(`${failure} failure closes once without a relaunch`, async t => {
  const close = t.mock.fn(async () => {});
  const launch = t.mock.fn(async () => ({ close, reset: async () => { if (failure === 'reset') throw new Error('reset'); } }));
  const run = () => runLongLivedSamples({ definitions: [{}], samples: 10, openSession: launch,
    runSample: async () => { if (failure === 'exception') throw new Error('exception'); return { status: 'FAIL' }; },
    onResult: async () => { if (failure === 'report') throw new Error('report'); } });
  if (failure === 'scenario') await run(); else await assert.rejects(run, new RegExp(failure));
  assert.equal(launch.mock.callCount(), 1); assert.equal(close.mock.callCount(), 1);
});

test('orphan cleanup requires recorded session, PID, start time and dead owner', () => {
  const session = '12345678-1234-1234-1234-123456789abc';
  const record = { version: 1, workspace: process.cwd(), session, ownerPid: 10, ownerStarted: 'owner-start', browserPid: 20, browserStarted: 'browser-start' };
  const browser = { pid: 20, started: 'browser-start', command: `/Applications/Chromium --flow-voice-lab-session=${session}` };
  assert.equal(staleBrowser(record, [browser]), browser);
  assert.equal(staleBrowser({ ...record, browserPid: undefined, browserStarted: undefined }, [browser]), browser);
  assert.equal(staleBrowser(record, [browser, { pid: 10, started: 'owner-start' }]), undefined);
  for (const changed of [{ pid: 21 }, { started: 'reused-pid' }, { command: '/Applications/Google Chrome' }, { command: `${browser.command} --type=renderer` }]) {
    assert.equal(staleBrowser(record, [{ ...browser, ...changed }]), undefined);
  }
  assert.equal(staleBrowser({ ...record, workspace: '/other-checkout' }, [browser]), undefined);
});

for (const [signal, expectedCode] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129], ['uncaughtException', 1], ['unhandledRejection', 1]]) {
  test(`${signal} waits for owned cleanup before exiting`, { timeout: 5000 }, async t => {
    const source = `
      import { installExitCleanup, launchOwnedBrowser, closeOwnedBrowsers } from ${JSON.stringify(new URL('./browser-lifecycle.mjs', import.meta.url).href)};
      const processes = [{ pid: process.pid, started: 'owner', command: 'node' }];
      const context = { pages: () => [{ close: async () => console.log('PAGE CLOSED') }], close: async () => console.log('CONTEXT CLOSED') };
      await launchOwnedBrowser({ launch: async options => {
        processes.push({ pid: 12345, started: 'browser', command: 'Chromium ' + options.args.join(' ') });
        return { contexts: () => [context], close: async () => {
          await new Promise(resolve => setTimeout(resolve, 25)); console.log('BROWSER CLOSED');
        } };
      } }, { headless: false, args: [] }, () => processes);
      installExitCleanup(async reason => {
        await closeOwnedBrowsers();
        await new Promise(resolve => setTimeout(resolve, 25));
        console.log('SERVICES CLOSED ' + reason);
      });
      // A real Chromium connection keeps the owner alive while the OS delivers
      // a signal; the launch double needs an equivalent active handle.
      setInterval(() => {}, 1000);
      setTimeout(() => {
        if (${JSON.stringify(signal)} === 'uncaughtException') throw new Error('test exception');
        else if (${JSON.stringify(signal)} === 'unhandledRejection') void Promise.reject(new Error('test rejection'));
        else process.kill(process.pid, ${JSON.stringify(signal)});
      }, 0);
    `;
    const child = spawn(process.execPath, ['--input-type=module', '-e', source], { stdio: ['ignore', 'pipe', 'pipe'] });
    t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    assert.equal(code, expectedCode, output);
    assert.match(output, /PAGE CLOSED\nCONTEXT CLOSED\nBROWSER CLOSED\n\[VOICE LAB\] Chromium closed\nSERVICES CLOSED/);
    assert.equal(output.split('[VOICE LAB] Chromium closed').length - 1, 1);
  });
}
