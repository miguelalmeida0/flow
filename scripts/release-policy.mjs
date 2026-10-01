import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import path from 'node:path';
export const gates = ['install', 'lint', 'unit', 'server', 'releasePolicy', 'python', 'build', 'design', 'e2e', 'qaRelease', 'realModel', 'voiceAutopilot', 'dependencyAudit', 'securityReview'];
export const micChecks = ['wake', 'calendar', 'short', 'ambiguity', 'destructive', 'interruption', 'cancel', 'two-tabs', 'deny', 'recover', 'persistence', 'undo-redo', 'consecutive-turns', 'decoder-reset', 'reconnect'];
export function hashArtifact(root) {
  const hash = createHash('sha256');
  function visit(dir) {
    for (const name of readdirSync(dir).sort()) {
      const file = path.join(dir, name), stat = lstatSync(file);
      if (stat.isSymbolicLink()) throw new Error('Build artifacts must not contain symlinks');
      if (stat.isDirectory()) visit(file);
      else if (stat.isFile()) {
        const bytes = readFileSync(file);
        hash.update(path.relative(root, file).split(path.sep).join('/') + '\0' + bytes.length + '\0');
        hash.update(bytes);
      } else throw new Error('Unsupported artifact entry');
    }
  }
  visit(root); return hash.digest('hex');
}
export function humanMicPassed(mic, manifest) {
  return mic?.status === 'PASS' && mic.gitSha === manifest.gitSha && mic.artifactHash === manifest.artifactHash
    && ['tester', 'mac', 'microphone', 'browser', 'origin'].every(k => typeof mic[k] === 'string' && mic[k].trim())
    && Number.isFinite(Date.parse(mic.testedAt)) && micChecks.every(k => mic.checks?.[k] === 'PASS');
}
export function verdict(manifest) {
  if (manifest.dirty || !/^[a-f0-9]{64}$/.test(manifest.artifactHash || '') || !/^[a-f0-9]{40}$/.test(manifest.gitSha)
    || !/^[a-f0-9]{64}$/.test(manifest.dependencyLockHash || '')
    || !(Number(/^v?(\d+)\./.exec(manifest.node || '')?.[1]) >= 22)
    || !Number.isFinite(Date.parse(manifest.buildTimestamp))
    || !gates.every(k => manifest.results?.[k]?.status === 'PASS')) return 'BLOCKED';
  return humanMicPassed(manifest.physicalMicrophone, manifest) ? 'READY TO DEPLOY' : 'READY FOR HUMAN MIC GATE';
}
export function assertDeployable(manifest, sha, artifactHash) {
  if (manifest.gitSha !== sha || manifest.artifactHash !== artifactHash || verdict(manifest) !== 'READY TO DEPLOY')
    throw new Error('NO-GO: evidence is incomplete, failed, dirty, or belongs to another commit/artifact');
}
