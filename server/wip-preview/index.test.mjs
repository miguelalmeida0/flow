import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createWipPreview } from './index.mjs';

test('preview refuses to boot without credentials and a full commit identity', () => {
  assert.throws(() => createWipPreview(), /AUTH/);
  assert.throws(() => createWipPreview({ authSha256: 'a'.repeat(64) }), /commit/);
});

test('all assets require authentication; browser-native SPA is isolated from APIs and source', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'flow-wip-test-'));
  const distDir = join(temporary, 'dist');
  await mkdir(join(distDir, 'assets'), { recursive: true });
  await writeFile(join(distDir, 'index.html'), '<html><head><title>Flow</title></head><body>Current application</body></html>');
  await writeFile(join(distDir, 'assets', 'app.js'), 'console.log("application")');
  await writeFile(join(temporary, 'secret.js'), 'private');
  await symlink(join(temporary, 'secret.js'), join(distDir, 'assets', 'outside.js'));
  const credentials = 'fixture:only-a-test-password';
  const commitSha = '1'.repeat(40);
  const server = createWipPreview({ distDir, authSha256: createHash('sha256').update(credentials).digest('hex'), commitSha });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const headers = { Authorization: `Basic ${Buffer.from(credentials).toString('base64')}` };
  try {
    for (const path of ['/', '/journal', '/assets/app.js', '/api/session', '/index.html']) {
      const response = await fetch(origin + path);
      assert.equal(response.status, 401, path);
      assert.match(response.headers.get('www-authenticate'), /Flow WIP preview/);
      assert.doesNotMatch(await response.text(), /Current application/);
    }
    assert.equal((await fetch(origin, { headers: { Authorization: 'Basic d3Jvbmc6d3Jvbmc=' } })).status, 401);
    for (const path of ['/', '/journal', '/calendar', '/index.html']) {
      const response = await fetch(origin + path, { headers });
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, /"mode":"browser-native","inferenceEnabled":false/);
      assert.match(html, new RegExp(`wip-${commitSha}`));
      assert.match(html, /WIP preview · browser voice/);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    }
    assert.equal((await fetch(origin + '/assets/app.js', { headers })).status, 200);
    const head = await fetch(origin + '/assets/app.js', { headers, method: 'HEAD' });
    assert.equal(head.status, 200); assert.equal(await head.text(), '');
    for (const path of ['/api/session', '/api/interpret', '/voice', '/capability', '/desktop', '/.env', '/package.json', '/assets/app.js.map', '/assets/outside.js', '/%2e%2e%2fsecret.js', '/%ZZ']) {
      assert.equal((await fetch(origin + path, { headers })).status, 404, path);
    }
    assert.equal((await fetch(origin, { headers, method: 'POST' })).status, 405);
    assert.equal((await fetch(origin + '/healthz')).status, 200);
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await rm(temporary, { recursive: true, force: true });
  }
});
