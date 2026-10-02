import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { BASE_IMAGE, inspectFile, permittedPath, validateInventory, verifyCandidate } from './build-hosted-image.mjs';

// Keep every test artifact inside this isolated preparation directory.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../artifacts/hosted-release/u8-packaging-tests');
await mkdir(root,{recursive:true});
const sha=value=>createHash('sha256').update(value).digest('hex');
async function fixture(){
  const destination=await mkdtemp(resolve(root,'candidate-'));
  const context=resolve(destination,'context');await mkdir(resolve(context,'src'),{recursive:true});
  await writeFile(resolve(context,'src/example.ts'),'export const value = 1;\n',{mode:0o644});
  const files=[await inspectFile(context,'src/example.ts')];
  const manifest={version:1,files,baseImage:BASE_IMAGE,platform:'linux/amd64',sourceManifestSha256:sha(JSON.stringify(files))};
  await writeFile(resolve(destination,'manifest.json'),JSON.stringify(manifest));
  return {destination,context,manifest};
}
test('accepts reviewed source/template and rejects traversal, secrets and generated output',()=>{
  assert.equal(permittedPath('.env.hosted.example'),true);
  assert.equal(permittedPath('server/desktop-bridge/index.mjs'),true);
  assert.equal(permittedPath('voice-companion/endpoint.py'),true);
  assert.equal(permittedPath('voice-companion/.hf-cache/model.py'),false);
  assert.equal(permittedPath('vite.config.ts'),true);
  assert.equal(permittedPath('server/hosted-gateway/config.mjs'),true);
  for(const path of ['../src/x.ts','/src/x.ts','src/../x.ts','src/.env','src/key.pem','.env.local','server/hosted-gateway/restart-probe.mjs','server/hosted-gateway/generated/prompts.mjs','artifacts/source.ts','src/node_modules/a.js','public/.npmrc','scripts/.netrc','docs/.pypirc','docs/.npmrc.backup','docs/id_rsa','docs/id_ed25519','docs/id_rsa.private','public/id_ed25519-key','scripts/ID_RSA_PRIVATE_KEY','docs/id_ed25519.key.pub'])assert.equal(permittedPath(path),false,path);
});
test('verifies a frozen manifest and rejects changed source bytes',async()=>{
  const {destination,context}=await fixture();await verifyCandidate(destination);
  await writeFile(resolve(context,'src/example.ts'),'changed');
  await assert.rejects(verifyCandidate(destination),/Candidate changed/);
});
test('rejects added unreviewed source',async()=>{
  const {destination,context}=await fixture();await writeFile(resolve(context,'src/unreviewed.ts'),'extra');
  await assert.rejects(verifyCandidate(destination),/file set changed/);
});
test('rejects a different base or platform',async()=>{
  const {destination,manifest}=await fixture();manifest.platform='linux/arm64';
  await writeFile(resolve(destination,'manifest.json'),JSON.stringify(manifest));
  await assert.rejects(verifyCandidate(destination),/identity mismatch/);
});
test('rejects symlinks even when the destination stays inside context',async()=>{
  const {context}=await fixture();await symlink('example.ts',resolve(context,'src/link.ts'));
  await assert.rejects(inspectFile(context,'src/link.ts'),/Symlink rejected/);
});
test('rejects duplicate inventory entries and unexpected permissions',async()=>{
  const {manifest}=await fixture();assert.throws(()=>validateInventory({...manifest,files:[...manifest.files,...manifest.files]}),/inventory entry/);
  assert.throws(()=>validateInventory({...manifest,files:[{...manifest.files[0],mode:0o777}]}),/inventory entry/);
});
test('rejects altered manifest identity',async()=>{
  const {destination}=await fixture();const manifest=JSON.parse(await readFile(resolve(destination,'manifest.json'),'utf8'));
  manifest.sourceManifestSha256='0'.repeat(64);await writeFile(resolve(destination,'manifest.json'),JSON.stringify(manifest));
  await assert.rejects(verifyCandidate(destination),/identity mismatch/);
});
