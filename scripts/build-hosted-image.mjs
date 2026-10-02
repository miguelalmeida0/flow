import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmod, lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASE_IMAGE = 'node:22-bookworm-slim@sha256:25330af3531fb5e23318554a0aa911125b6e91b1b777edf7655501d207c067a2';
const sha = value => createHash('sha256').update(value).digest('hex');
const forbiddenDirectory = /^(?:\.git|\.agents|\.codex|\.aws|\.cache|\.tmp|\.recovery|\.artifacts|artifacts|node_modules|dist|build|coverage|playwright-report|test-results|\.venv|__pycache__)(?:\/|$)/;
const allowedRoot = /^(?:(?:src|shared|public|scripts|server|e2e|docs|\.github)\/|(?:package(?:-lock)?\.json|index\.html|Dockerfile\.hosted|\.dockerignore|\.gitignore|\.env\.hosted\.example|render\.yaml|README\.md|tsconfig(?:\.[\w-]+)?\.json|(?:vite|vitest(?:\.[\w-]+)?|playwright(?:\.[\w-]+)?)\.config\.ts|eslint\.config\.js)$)/;
export function permittedPath(path) {
  if (typeof path !== 'string' || !path || path.includes('\\') || path.includes('\0') || path.startsWith('/') || path.split('/').some(p => p === '..' || p === '.' || !p)) return false;
  const companionSource = /^voice-companion\/[\w.-]+\.(?:py|toml|md|txt|c|cpp|h|sh)$/.test(path);
  if ((!allowedRoot.test(path) && !companionSource) || forbiddenDirectory.test(path)) return false;
  if (path.split('/').some(p => /^(?:node_modules|\.venv|__pycache__|\.aws|\.git|\.codex|\.agents)$/.test(p))) return false;
  if (path.split('/').some(p => /^(?:\.npmrc|\.netrc|\.pypirc)(?:[._-].*)?$|^id_(?:rsa|ed25519)(?:[._-].*)?$/i.test(p))) return false;
  if (path !== '.env.hosted.example' && path.split('/').some(p => /^\.env(?:\.|$)/.test(p))) return false;
  return !/\.(?:pem|key|p12|pfx|jks|db|sqlite\d*|log|zip|tar(?:\.gz)?|safetensors|gguf|pt|pth)$/.test(path) && !path.startsWith('server/hosted-gateway/generated/') && path !== 'server/hosted-gateway/restart-probe.mjs';
}
export async function inspectFile(root, path) {
  if (!permittedPath(path)) throw new Error(`Rejected candidate path: ${path}`);
  const canonicalRoot = await realpath(root), full = resolve(canonicalRoot, path);
  if (await realpath(full) !== full) throw new Error(`Symlink rejected: ${path}`);
  const stat = await lstat(full);
  if (!stat.isFile()) throw new Error(`Regular file required: ${path}`);
  const bytes = await readFile(full);
  return { path, sha256: sha(bytes), bytes: bytes.length, mode: stat.mode & 0o111 ? 0o755 : 0o644 };
}
export function validateInventory(inventory) {
  if (inventory?.version !== 1 || !Array.isArray(inventory.files) || !inventory.files.length) throw new Error('Invalid reviewed inventory');
  let previous = '';
  for (const entry of inventory.files) {
    if (!permittedPath(entry.path) || entry.path <= previous || !/^[a-f0-9]{64}$/.test(entry.sha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || ![0o644,0o755].includes(entry.mode)) throw new Error('Invalid or unsorted inventory entry');
    previous = entry.path;
  }
  return inventory;
}
function git(root, args) { return execFileSync('git', ['-C',root,...args], {encoding:'utf8',maxBuffer:32*1024*1024}); }
async function inventory(root) {
  const paths = [...new Set(git(root,['ls-files','--cached','--others','--exclude-standard','-z']).split('\0').filter(permittedPath))].sort();
  const files = [];
  for (const path of paths) {
    // Deleted tracked files are absent from the reviewed working-tree candidate.
    try { files.push(await inspectFile(root,path)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (!files.some(file=>file.path==='.env.hosted.example')) throw new Error('Missing .env.hosted.example; integrate the final .gitignore exception first');
  return {version:1,head:git(root,['rev-parse','HEAD']).trim(),branch:git(root,['branch','--show-current']).trim(),files};
}
export async function freeze(root, destination, reviewed) {
  validateInventory(reviewed);
  const current = await inventory(root);
  if (JSON.stringify(current) !== JSON.stringify(reviewed)) throw new Error('Working tree changed or review inventory does not match');
  // Exclusive directory creation refuses accidental reuse or overwrite.
  await mkdir(destination);
  const context = resolve(destination,'context'); await mkdir(context);
  for (const entry of reviewed.files) {
    const data = await readFile(resolve(root,entry.path));
    if (sha(data) !== entry.sha256) throw new Error(`Source changed during freeze: ${entry.path}`);
    const target = resolve(context,entry.path); await mkdir(dirname(target),{recursive:true});
    await writeFile(target,data,{flag:'wx',mode:entry.mode}); await chmod(target,entry.mode);
  }
  if (JSON.stringify(await inventory(root)) !== JSON.stringify(reviewed)) throw new Error('Source changed during freeze; discard this incomplete candidate');
  const manifest = {...reviewed,sourceManifestSha256:sha(JSON.stringify(reviewed.files)),baseImage:BASE_IMAGE,platform:'linux/amd64'};
  await writeFile(resolve(destination,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
  return manifest;
}
async function filesUnder(root, prefix='') {
  const paths=[];
  for (const entry of await readdir(resolve(root,prefix),{withFileTypes:true})) {
    const path=prefix?`${prefix}/${entry.name}`:entry.name;
    if(entry.isDirectory()) paths.push(...await filesUnder(root,path));
    else paths.push(path);
  }
  return paths.sort();
}
export async function verifyCandidate(destination) {
  const manifest=validateInventory(JSON.parse(await readFile(resolve(destination,'manifest.json'),'utf8')));
  if(manifest.baseImage!==BASE_IMAGE || manifest.platform!=='linux/amd64' || manifest.sourceManifestSha256!==sha(JSON.stringify(manifest.files))) throw new Error('Candidate manifest identity mismatch');
  const context=resolve(destination,'context');
  if(JSON.stringify(await filesUnder(context))!==JSON.stringify(manifest.files.map(file=>file.path)))throw new Error('Candidate file set changed');
  for(const entry of manifest.files)if(JSON.stringify(await inspectFile(context,entry.path))!==JSON.stringify(entry))throw new Error(`Candidate changed: ${entry.path}`);
  return manifest;
}
async function main() {
  const [command,...args]=process.argv.slice(2),options={};
  for(let i=0;i<args.length;i+=2){if(!['--candidate','--reviewed','--source'].includes(args[i])||!args[i+1]||options[args[i]])throw new Error('Invalid arguments');options[args[i]]=args[i+1];}
  const root=await realpath(resolve(options['--source']||process.cwd()));
  if(command==='inventory'){process.stdout.write(JSON.stringify(await inventory(root),null,2)+'\n');return;}
  const id=options['--candidate'];
  if(!/^[a-z0-9][a-z0-9-]{0,79}$/.test(id||''))throw new Error('Explicit candidate ID required');
  const parent=resolve(root,'artifacts/hosted-release/candidates'),destination=resolve(parent,id);
  if(command==='prepare'){
    if(!options['--reviewed'])throw new Error('Reviewed inventory file required');
    await mkdir(parent,{recursive:true});
    const reviewed=JSON.parse(await readFile(resolve(options['--reviewed']),'utf8'));
    await freeze(root,destination,reviewed);
  }else if(command==='verify')await verifyCandidate(destination);
  else if(command==='qualification-copy'){
    const manifest=await verifyCandidate(destination),qualification=resolve(destination,'qualification');
    await mkdir(qualification);
    for(const entry of manifest.files){
      const data=await readFile(resolve(destination,'context',entry.path));
      if(sha(data)!==entry.sha256)throw new Error('Candidate changed while copying qualification source');
      const target=resolve(qualification,entry.path);await mkdir(dirname(target),{recursive:true});
      await writeFile(target,data,{flag:'wx',mode:entry.mode});await chmod(target,entry.mode);
    }
    await verifyCandidate(destination);
    process.stdout.write(`Qualification copy: ${qualification}\nSource manifest: ${resolve(destination,'manifest.json')}\n`);
  }
  else if(command==='build'){
    const manifest=await verifyCandidate(destination);
    const imageRef=`flow-hosted:${id}`;
    const receiptPath=resolve(destination,'build-receipt.json');
    const receipt={status:'building',candidate:id,startedAt:new Date().toISOString(),sourceManifestSha256:manifest.sourceManifestSha256,baseImage:BASE_IMAGE,platform:'linux/amd64',lockfileSha256:manifest.files.find(file=>file.path==='package-lock.json')?.sha256,dockerfileSha256:manifest.files.find(file=>file.path==='Dockerfile.hosted')?.sha256};
    // One attempt per candidate. A failed attempt requires a fresh candidate ID,
    // so no old successful receipt can survive and masquerade as this build.
    await writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
    try {
    // No secrets, registry credentials, SSH mounts, push, or cloud calls are accepted.
    execFileSync('docker',['buildx','build','--platform','linux/amd64','--file',resolve(destination,'context/Dockerfile.hosted'),'--build-arg',`FLOW_RELEASE_ID=${id}`,'--metadata-file',resolve(destination,'build-metadata.json'),'--iidfile',resolve(destination,'image-id'),'--tag',imageRef,'--load',resolve(destination,'context')],{stdio:'inherit'});
    const builtImageId=(await readFile(resolve(destination,'image-id'),'utf8')).trim();
    if(!/^sha256:[a-f0-9]{64}$/.test(builtImageId))throw new Error('Invalid recorded build image ID');
    const [image]=JSON.parse(execFileSync('docker',['image','inspect',builtImageId],{encoding:'utf8'}));
    if(image?.Id!==builtImageId)throw new Error('Recorded build image ID does not match inspected image');
    if(image.Os!=='linux'||image.Architecture!=='amd64'||image.Config.User!=='node')throw new Error('Unexpected image platform or user');
    if(!image.Config.Env.includes(`FLOW_RELEASE_ID=${id}`)||image.Config.Labels?.['org.opencontainers.image.version']!==id)throw new Error('Image release identity mismatch');
    const hashProgram="const fs=require('node:fs'),crypto=require('node:crypto');const files=['server/hosted-gateway/generated/model-contract.json','server/hosted-gateway/generated/prompts.mjs'];console.log(JSON.stringify(Object.fromEntries(files.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]))));";
    const generatedSha256=JSON.parse(execFileSync('docker',['run','--rm','--platform','linux/amd64','--network','none','--read-only','--user','node','--cap-drop','ALL','--security-opt','no-new-privileges',image.Id,'node','-e',hashProgram],{encoding:'utf8'}));
    await verifyCandidate(destination);
    Object.assign(receipt,{status:'built-unqualified',completedAt:new Date().toISOString(),imageId:image.Id,imageRef,user:image.Config.User,releaseId:id,generatedSha256});
    await writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n');
    } catch(error) {
      await writeFile(receiptPath,JSON.stringify({...receipt,status:'failed',failedAt:new Date().toISOString()},null,2)+'\n');
      throw error;
    }
  }else throw new Error('Expected inventory, prepare, verify, qualification-copy, or build');
  process.stdout.write(`${command}: ${relative(root,destination).split(sep).join('/')}\n`);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{process.stderr.write(`${error.message}\n`);process.exitCode=1;});
