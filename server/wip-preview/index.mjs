import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.webm': 'video/webm' };

/** A separate, credential-gated static preview. No gateway, database or provider imports. */
export function createWipPreview({ distDir = 'dist', authSha256, commitSha } = {}) {
  if (!/^[a-f0-9]{64}$/.test(authSha256 ?? '')) throw new Error('FLOW_PREVIEW_AUTH_SHA256 is required');
  if (!/^[a-f0-9]{40}$/.test(commitSha ?? '')) throw new Error('A complete preview commit SHA is required');
  const expected = Buffer.from(authSha256, 'hex');
  const rootPath = resolve(distDir);
  const server = createServer(async (req, res) => {
    const headers = {
      'cache-control': 'private, no-store',
      'vary': 'Authorization',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'x-robots-tag': 'noindex, nofollow, noarchive',
      'referrer-policy': 'no-referrer',
      'x-flow-environment': 'wip-preview',
      'x-flow-commit': commitSha,
    };
    const reply = (status, body, extra = {}) => {
      const bytes = Buffer.from(body);
      res.writeHead(status, { ...headers, 'content-type': 'text/plain; charset=utf-8', ...extra, 'content-length': bytes.length });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    };
    try {
      // Liveness reveals no application assets or user data.
      if (req.url === '/healthz' && req.method === 'GET') return reply(200, 'Flow WIP preview');
      const authorization = req.headers.authorization ?? '';
      const encoded = /^Basic ([A-Za-z0-9+/]+={0,2})$/.exec(authorization)?.[1];
      const supplied = createHash('sha256').update(encoded ? Buffer.from(encoded, 'base64') : Buffer.alloc(0)).digest();
      if (!encoded || !timingSafeEqual(expected, supplied)) {
        return reply(401, 'Private Flow WIP preview. Authentication required.', { 'www-authenticate': 'Basic realm="Flow WIP preview", charset="UTF-8"' });
      }
      if (!['GET', 'HEAD'].includes(req.method)) return reply(405, 'Preview is read-only on the server.', { allow: 'GET, HEAD' });
      let path;
      try { path = decodeURIComponent((req.url ?? '/').split('?')[0]); } catch { return reply(404, 'Not found'); }
      if (!path.startsWith('/') || path.includes('\\') || path.includes('\0') || path.split('/').some(part => part.startsWith('.'))) return reply(404, 'Not found');
      if (/^\/(?:api|voice|capability|desktop)(?:\/|$)/.test(path)) return reply(404, 'Cloud and desktop services are unavailable in this preview.');
      if (path === '/robots.txt') return reply(200, 'User-agent: *\nDisallow: /\n');
      const isRoute = !extname(path);
      const relative = isRoute ? 'index.html' : path.slice(1);
      if (!MIME[extname(relative)] || (extname(relative) === '.html' && relative !== 'index.html')) return reply(404, 'Not found');
      let root, file;
      try {
        root = await realpath(rootPath);
        file = await realpath(resolve(root, relative));
        if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) return reply(404, 'Not found');
      } catch { return reply(404, 'Not found'); }
      let content = await readFile(file);
      const nonce = randomBytes(18).toString('base64');
      if (relative === 'index.html') {
        const runtime = JSON.stringify({ mode: 'browser-native', inferenceEnabled: false, releaseId: `wip-${commitSha}` });
        content = Buffer.from(content.toString().replace('<head>', `<head><meta name="robots" content="noindex,nofollow"><meta name="flow-environment" content="wip-preview"><script nonce="${nonce}">window.__FLOW_RUNTIME__=${runtime};</script>`).replace(/<title>[^<]*<\/title>/, '<title>Flow — WIP preview · browser voice</title>'));
      }
      const csp = `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob: data:; connect-src 'self' blob: https://api.open-meteo.com; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`;
      return reply(200, content, { 'content-type': MIME[extname(file)], 'content-security-policy': csp });
    } catch {
      if (!res.headersSent) reply(503, 'Preview temporarily unavailable');
      else res.destroy();
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  server.maxHeadersCount = 40;
  server.on('upgrade', (_req, socket) => { socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n'); });
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const server = createWipPreview({ authSha256: process.env.FLOW_PREVIEW_AUTH_SHA256, commitSha: process.env.RENDER_GIT_COMMIT ?? process.env.FLOW_PREVIEW_COMMIT });
  server.listen(Number(process.env.PORT ?? 3000), '0.0.0.0', () => console.log('Flow WIP preview listening; inference disabled'));
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { server.close(); server.closeAllConnections(); });
}
