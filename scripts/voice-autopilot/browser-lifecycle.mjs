import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const directory = path.resolve('artifacts/voice-autopilot/browser-sessions');
const owned = new Set();
export const browserCounts = { launches: 0, closes: 0 };
const processRows = () => execFileSync('ps', ['-axo', 'pid=,lstart=,command='], { encoding: 'utf8' }).split('\n').flatMap(line => {
  const match = line.trim().match(/^(\d+)\s+(.{24})\s+(.*)$/);
  return match ? [{ pid: Number(match[1]), started: match[2], command: match[3] }] : [];
});
export function staleBrowser(record, rows) {
  if (record.version !== 1 || record.workspace !== process.cwd() || !/^[\da-f-]{36}$/.test(record.session)) return undefined;
  if (rows.some(row => row.pid === record.ownerPid && row.started === record.ownerStarted)) return undefined;
  return rows.find(row => (record.browserPid === undefined || row.pid === record.browserPid && row.started === record.browserStarted)
    && /(?:Chromium|chrome)/i.test(row.command) && row.command.split(/\s+/).includes(`--flow-voice-lab-session=${record.session}`)
    && !row.command.includes('--type='));
}
export async function cleanupStaleBrowsers() {
  mkdirSync(directory, { recursive: true });
  const rows = processRows();
  for (const file of readdirSync(directory).filter(f => f.endsWith('.json'))) {
    const filename = path.join(directory, file);
    let record;
    try { record = JSON.parse(readFileSync(filename, 'utf8')); } catch { continue; }
    const stale = staleBrowser(record, rows);
    if (stale) {
      const current = staleBrowser(record, processRows());
      if (current) {
        console.log(`[VOICE LAB] cleaning stale benchmark Chromium pid=${current.pid}`);
        try { process.kill(current.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
        const deadline = Date.now() + 3000;
        while (staleBrowser(record, processRows()) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
        const remaining = staleBrowser(record, processRows());
        if (remaining) {
          try { process.kill(remaining.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
        }
      }
    }
    if (!rows.some(row => row.pid === record.ownerPid && row.started === record.ownerStarted)) unlinkSync(filename);
  }
}

export async function launchOwnedBrowser(chromium, options, inspectProcesses = processRows) {
  const session = randomUUID();
  const owner = inspectProcesses().find(row => row.pid === process.pid);
  if (!owner) throw new Error('Cannot establish benchmark process identity');
  mkdirSync(directory, { recursive: true });
  const filename = path.join(directory, `${session}.json`);
  const record = { version: 1, workspace: process.cwd(), session, ownerPid: owner.pid, ownerStarted: owner.started };
  writeFileSync(filename, JSON.stringify(record));
  let browser;
  try {
    browserCounts.launches++;
    browser = await chromium.launch({ ...options, handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false,
      args: [...options.args, `--flow-voice-lab-session=${session}`] });
    const row = inspectProcesses().find(row => row.command.split(/\s+/).includes(`--flow-voice-lab-session=${session}`) && !row.command.includes('--type='));
    if (!row) throw new Error('Cannot establish benchmark Chromium PID');
    Object.assign(record, { browserPid: row.pid, browserStarted: row.started });
    writeFileSync(filename, JSON.stringify(record));
    console.log(`[VOICE LAB] Chromium started pid=${row.pid}`);
    let closing;
    const close = () => closing ??= (async () => {
      try {
        for (const context of browser.contexts()) {
          for (const page of context.pages()) await page.close().catch(() => {});
          await context.close().catch(() => {});
        }
        await browser.close();
        browserCounts.closes++;
        console.log('[VOICE LAB] Chromium closed');
        unlinkSync(filename);
      } finally { owned.delete(close); }
    })();
    owned.add(close);
    return { browser, close, session, pid: row.pid };
  } catch (error) {
    await browser?.close().catch(() => {});
    if (browser) browserCounts.closes++;
    unlinkSync(filename);
    throw error;
  }
}
export async function closeOwnedBrowsers() {
  const results = await Promise.allSettled([...owned].map(close => close()));
  const failure = results.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
}

export function installExitCleanup(cleanup) {
  let finishing;
  const finish = reason => finishing ??= cleanup(reason);
  const handlers = new Map();
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    const handler = () => { void finish(signal).finally(() => process.exit(signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 129)); };
    process.on(signal, handler); handlers.set(signal, handler);
  }
  for (const signal of ['uncaughtException', 'unhandledRejection']) {
    const handler = error => { console.error(`[FAIL] ${error?.message ?? error}`); void finish(signal).finally(() => process.exit(1)); };
    process.on(signal, handler); handlers.set(signal, handler);
  }
  return { finish, dispose: () => { for (const [name, handler] of handlers) process.off(name, handler); } };
}
