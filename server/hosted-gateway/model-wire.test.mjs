import { expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createStrictSchemas, decodeProviderOutput, validateHostedRequest } from './model-wire.mjs';
import { loadModelContract } from './model-contract.mjs';
const contract=await loadModelContract();
const empty={kind:'answer',text:null,sources:[],question:null,choices:[],steps:[],summary:null,conditions:[],capabilityId:null,argsJson:null,explanation:null};
const decode=value=>decodeProviderOutput(JSON.stringify(value),'interpret',contract.capabilities);
it('round-trips all strict interpretation kinds without weakening internal args',()=>{
 expect(decode({...empty,text:'Hello'})).toEqual({kind:'answer',text:'Hello',sources:[]});
 expect(decode({...empty,kind:'clarify',question:'Which one?',choices:['Dinner']})).toEqual({kind:'clarify',question:'Which one?',choices:['Dinner']});
 expect(decode({...empty,kind:'plan',summary:'Move dinner',steps:[{capabilityId:'calendar.move',argsJson:'{"eventId":{"$ref":"selected"},"startMinutes":1080}'}]}).steps[0].args).toEqual({eventId:{$ref:'selected'},startMinutes:1080});
 const read=contract.capabilities.find(c=>!c.mutates);
 expect(decode({...empty,kind:'lookup',capabilityId:read.id,argsJson:'{}'})).toEqual({kind:'lookup',capabilityId:read.id,args:{}});
 expect(decode({...empty,kind:'unavailable',explanation:'Unavailable'})).toEqual({kind:'unavailable',explanation:'Unavailable'});
});
it('rejects malformed arguments, unknown keys/capabilities and inconsistent fields',()=>{
 for(const frame of [{...empty,text:'hi',extra:true},{...empty,text:'hi',question:'Which?'},...[null,'[]','null','{','{"a":{"b":{"c":{"d":{"e":1}}}}}'].map(argsJson=>({...empty,kind:'plan',summary:'x',steps:[{capabilityId:'calendar.move',argsJson}]})),{...empty,kind:'plan',summary:'x',steps:[{capabilityId:'desktop.openFile',argsJson:'{}'}]}])expect(()=>decode(frame)).toThrow();
});
it('round-trips verifier verdicts and rejects accept with unresolved issues',()=>{
 const base={verdict:'accept',missingConstraints:[],contradictions:[],unsupportedAssumptions:[],referentProblems:[],temporalProblems:[],clarifyQuestion:null,repairedFrame:null};
 const decode=value=>decodeProviderOutput(JSON.stringify(value),'verify',contract.capabilities);
 expect(decode(base).verdict).toBe('accept');expect(decode({...base,verdict:'clarify',clarifyQuestion:'Which one?'}).verdict).toBe('clarify');
 expect(decode({...base,verdict:'repair',repairedFrame:{...empty,text:'Nothing has changed.'}}).repairedFrame).toEqual({kind:'answer',text:'Nothing has changed.',sources:[]});
 expect(()=>decode({...base,missingConstraints:['Condition unresolved']})).toThrow();expect(()=>decode({...base,repairedFrame:{...empty,text:'oops'}})).toThrow();
});
it('verifies decoded referent plans with the same bounded argument depth as interpretation',()=>{
 const request=output=>({version:1,kind:'verify',rawTranscript:'Move that event to six',interpreterOutputJson:JSON.stringify(output)});
 const plan=decode({...empty,kind:'plan',summary:'Move dinner',steps:[{capabilityId:'calendar.move',argsJson:'{"eventId":{"$ref":"lastMentioned"},"startMinutes":1080}'}]});
 expect(validateHostedRequest(request(plan),contract.capabilities)).toEqual(request(plan));
 const depthFour={a:{b:{c:{d:1}}}};
 const nested=decode({...empty,kind:'plan',summary:'Bounded args',steps:[{capabilityId:'calendar.move',argsJson:JSON.stringify(depthFour)}]});
 expect(validateHostedRequest(request(nested),contract.capabilities)).toEqual(request(nested));
 for(const args of [{a:{b:{c:{d:{e:1}}}}},{text:'a'.repeat(4096)}]){
  expect(()=>validateHostedRequest(request({...plan,steps:[{capabilityId:'calendar.move',args}]}),contract.capabilities)).toThrow();
 }
 expect(()=>validateHostedRequest(request({...plan,steps:[{capabilityId:'desktop.openFile',args:{}}]}),contract.capabilities)).toThrow();
 expect(()=>validateHostedRequest(request({...plan,steps:[]}),contract.capabilities)).toThrow();
 const unicode={kind:'answer',text:'😀'.repeat(4096)};
 expect(()=>validateHostedRequest(request(unicode),contract.capabilities)).toThrow();
});
it('checks lookup schemas, nested fields, referent uniqueness and timestamp normalization',()=>{
 const context={rawTranscript:'Hi',normalizedTranscript:'Hi',todayDateKey:'2026-10-02',nowIso:'2026-10-02T12:00:00Z',recentTurns:[],referents:[],lookups:[],round:1,maxRounds:3};
 const validate=c=>validateHostedRequest({version:1,kind:'interpret',context:c},contract.capabilities);
 expect(validate(context).context).toBe(context);
 for(const patch of [{recentTurns:Array.from({length:5},()=>({transcript:'a',response:'b'}))},{recentTurns:[{transcript:'a',response:'b',system:'bad'}]},{referents:[{key:'selected',kind:'event',label:'A'},{key:'selected',kind:'event',label:'B'}]},{nowIso:'2026-02-30T00:00:00Z'},{round:2,lookups:[{capabilityId:'friends.lookup',args:{unknown:1},resultSummary:'none'}]}])expect(()=>validate({...context,...patch})).toThrow();
});
it('generated strict contract is closed and its runtime graph excludes desktop execution',async()=>{
 expect(contract.schemas).toEqual(createStrictSchemas(contract.capabilities));expect(contract.capabilities.every(c=>!c.id.startsWith('desktop.'))).toBe(true);
 const graph=JSON.parse(await readFile(new URL('./generated/prompt-inputs.json',import.meta.url),'utf8'));expect(graph.every(p=>!/desktop|modelClient|capabilities\//i.test(p))).toBe(true);
 const visit=s=>{if(s.type==='object'){expect(s.additionalProperties).toBe(false);expect(s.required).toEqual(Object.keys(s.properties));}for(const v of Object.values(s))if(v&&typeof v==='object'){if(Array.isArray(v))v.filter(x=>x&&typeof x==='object').forEach(visit);else visit(v);}};visit(contract.schemas.interpret);visit(contract.schemas.verify);
});
