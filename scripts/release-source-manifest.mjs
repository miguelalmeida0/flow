import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const outputRoots = new Set(['node_modules','dist','artifacts','test-results','playwright-report','coverage']);
const outputFiles = new Set(['server/hosted-gateway/generated/model-contract.json','server/hosted-gateway/generated/prompts.mjs','server/hosted-gateway/generated/prompt-inputs.json']);
const digest = value => createHash('sha256').update(value).digest('hex');
export function verifySourceManifest(root, manifest) {
  if (manifest.version !== 1 || !Array.isArray(manifest.files) || !manifest.files.length
    || digest(JSON.stringify(manifest.files)) !== manifest.sourceManifestSha256) throw new Error('Invalid frozen manifest digest/schema');
  const expected = new Set();
  for (const file of manifest.files) {
    if (typeof file.path !== 'string' || !file.path || file.path.startsWith('/') || file.path.split('/').some(part=>part==='..'||!part)
      || expected.has(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isInteger(file.bytes)) throw new Error('Invalid manifest entry');
    expected.add(file.path);
    const path = resolve(root,file.path), stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== file.bytes || digest(readFileSync(path)) !== file.sha256
      || (stat.mode & 0o777) !== Number(file.mode)) throw new Error(`Frozen source mismatch: ${file.path}`);
  }
  function walk(directory, prefix='') {
    for (const entry of readdirSync(directory,{withFileTypes:true})) {
      const path = prefix + entry.name;
      if (!prefix && outputRoots.has(entry.name)) continue;
      if (entry.isDirectory()) walk(resolve(directory,entry.name),path+'/');
      else if (!expected.has(path) && !outputFiles.has(path)) throw new Error(`Unexpected source file: ${path}`);
    }
  }
  walk(root);
  return manifest.sourceManifestSha256;
}
