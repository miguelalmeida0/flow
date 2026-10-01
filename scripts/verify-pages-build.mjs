import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { hashArtifact } from './release-policy.mjs';
const html=readFileSync('dist/index.html','utf8');
const paths=[...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m=>m[1]).filter(v=>!v.startsWith('http')&&!v.startsWith('data:'));
assert(paths.some(v=>v.startsWith('/flow/assets/')&&v.endsWith('.js')));
assert(paths.some(v=>v.startsWith('/flow/assets/')&&v.endsWith('.css')));
for(const url of paths) { assert(url.startsWith('/flow/'),url); assert(existsSync('dist/'+url.slice(6)),url); }
assert(existsSync('dist/voice-pcm-worklet.js'));
assert(existsSync('dist/404.html'));
if(process.env.FLOW_PREBUILT_ARTIFACT_HASH) assert.equal(hashArtifact('dist'),process.env.FLOW_PREBUILT_ARTIFACT_HASH);
console.log('PASS: /flow/ assets, worklet, SPA fallback and immutable artifact hash');
