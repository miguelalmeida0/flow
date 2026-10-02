import { readFile } from 'node:fs/promises';
export async function loadModelContract(){
 const contract=JSON.parse(await readFile(new URL('./generated/model-contract.json',import.meta.url),'utf8'));
 const prompts=await import('./generated/prompts.mjs');
 if(contract.version!==1||!Array.isArray(contract.capabilities)||contract.capabilities.some(c=>c.id.startsWith('desktop.')))throw new Error('invalid hosted contract');
 return {...contract,...prompts};
}
