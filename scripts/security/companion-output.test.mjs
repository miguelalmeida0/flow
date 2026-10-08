import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
test('companion pairing secret stays in a private file, never process output', { timeout: 15000 }, async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'flow-pairing-'));
  const reservation = net.createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  let output = '';
  const child = spawn(process.execPath, ['server/desktop-bridge/index.mjs'], {
    env: { ...process.env, HOME: home, FLOW_COMPANION_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', value => { output += value; });
  child.stderr.on('data', value => { output += value; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit'); child.kill(); await exited;
    }
    await fs.rm(home, { recursive: true, force: true });
  });
  const file = path.join(home, '.flow-companion', 'token');
  let token = '';
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error('Companion exited before pairing');
    try { token = (await fs.readFile(file, 'utf8')).trim(); } catch { /* startup */ }
    if (token && output.includes('listening on')) break;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.ok(token.length >= 32, 'A pairing token must be created');
  assert.equal(output.includes(token), false, 'stdout/stderr must not contain the pairing token');
  assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
  assert.equal((await fs.stat(path.dirname(file))).mode & 0o777, 0o700);
});
