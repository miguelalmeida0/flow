import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** Protocol/control-plane faults are intentionally separate from acoustic E2E. */
export async function chaos(def, _services, out) {
  console.log(`[RUN] ${def.id}: production hook / kernel fault injection`);
  const file = path.join(out, 'chaos-tests.json'); const start = Date.now();
  const files = ['src/features/voice/useKyutaiVoiceSession.test.tsx', 'src/kernel/voice/voiceCompanionClient.test.ts', 'src/kernel/voice/voiceSessionMachine.test.ts', 'src/kernel/__tests__/idempotency.test.ts', 'src/kernel/__tests__/moveAlternatives.test.ts', 'src/kernel/__tests__/productionBridge.test.ts', 'src/app/FlowConversationalSupersession.test.tsx'];
  const code = await new Promise(resolve => {
    const child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--maxWorkers=1', ...files, '--reporter=json', `--outputFile=${file}`], { env: { ...process.env, TMPDIR: path.resolve('node_modules/.tmp') }, stdio: 'ignore' });
    child.on('error', () => resolve(1)); child.on('exit', resolve);
  });
  let identities = [];
  try { const report = JSON.parse(readFileSync(file)); identities = report.testResults.flatMap(t => t.assertionResults.map(a => ({ file: path.relative(process.cwd(), t.name), name: a.fullName, status: a.status, failures: a.failureMessages }))); } catch { /* report failure remains FAIL */ }
  const status = code === 0 && identities.length && identities.every(t => t.status === 'passed') ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${def.id}: ${identities.filter(t => t.status === 'passed').length}/${identities.length} exact test identities`);
  return { id: def.id, lane: 'C — protocol and kernel fault injection', status, identities, durationMs: Date.now() - start };
}
