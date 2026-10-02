import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createStrictSchemas } from '../server/hosted-gateway/model-wire.mjs';

// Registry implementations exist only in this in-memory build-time bundle.
const source = `import {createDefaultRegistry} from './src/kernel/capabilities/index.ts';
import {describeCapabilitiesForModel} from './src/kernel/llm/capabilityModel.ts';
import {buildSystemPrompt} from './src/kernel/llm/promptBuilder.ts';
import {buildVerifierSystemPrompt} from './src/kernel/llm/verifierPrompt.ts';
const capabilities=describeCapabilitiesForModel(createDefaultRegistry('hosted'));
export default {version:1,capabilities,system:buildSystemPrompt(capabilities),verifierSystem:buildVerifierSystemPrompt(capabilities)};`;
const compiled = await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const {default: contract} = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
contract.schemas = createStrictSchemas(contract.capabilities);
const dir = resolve('server/hosted-gateway/generated');
await mkdir(dir,{recursive:true});
await writeFile(resolve(dir,'model-contract.json'),JSON.stringify(contract,null,2)+'\n');
const prompts = await build({stdin:{contents:`export {buildUserPrompt} from './src/kernel/llm/promptBuilder.ts'; export {buildVerifierUserPrompt} from './src/kernel/llm/verifierPrompt.ts';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,metafile:true,logLevel:'silent'});
if(Object.keys(prompts.metafile.inputs).some(name=>/desktop|modelClient|capabilities\//i.test(name)))throw new Error('Hosted prompt bundle imported runtime capabilities');
await writeFile(resolve(dir,'prompts.mjs'),prompts.outputFiles[0].text);
await writeFile(resolve(dir,'prompt-inputs.json'),JSON.stringify(Object.keys(prompts.metafile.inputs).sort(),null,2)+'\n');
console.log(`Generated hosted contract: ${contract.capabilities.length} capabilities; no desktop runtime imports.`);
