const invalid=()=>{throw new Error('invalid model contract');};
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
function object(value,keys,required=keys){if(!plain(value)||Object.keys(value).some(k=>!keys.includes(k))||required.some(k=>!Object.hasOwn(value,k)))invalid();}
function string(value,max,allowEmpty=false){if(typeof value!=='string'||value.length>max||(!allowEmpty&&!value.trim()))invalid();}
function list(value,max,check){if(!Array.isArray(value)||value.length>max)invalid();value.forEach(check);}
function boundedJson(value,depth=0){if(depth>4)invalid();if(value===null||typeof value==='boolean')return;if(typeof value==='number'){if(!Number.isFinite(value))invalid();return;}if(typeof value==='string'){string(value,4096,true);return;}if(Array.isArray(value)){if(value.length>32)invalid();value.forEach(v=>boundedJson(v,depth+1));return;}if(!plain(value)||Object.keys(value).length>32)invalid();for(const [k,v]of Object.entries(value)){if(['__proto__','constructor','prototype'].includes(k))invalid();boundedJson(v,depth+1);}}
function argsObject(value){if(!plain(value)||Buffer.byteLength(JSON.stringify(value))>4096)invalid();boundedJson(value);return value;}
function schemaValue(value,schema){
 if(schema.enum&&!schema.enum.includes(value))invalid();
 if(schema.type==='string'){string(value,schema.maxLength??4096,true);if(value.length<(schema.minLength??0))invalid();}
 else if(schema.type==='integer'||schema.type==='number'){if(typeof value!=='number'||!Number.isFinite(value)||(schema.type==='integer'&&!Number.isInteger(value))||value<(schema.minimum??-Infinity)||value>(schema.maximum??Infinity))invalid();}
 else if(schema.type==='boolean'){if(typeof value!=='boolean')invalid();}
 else if(schema.type==='object'){object(value,Object.keys(schema.properties??{}),schema.required??[]);for(const[k,v]of Object.entries(value))schemaValue(v,schema.properties[k]);}
 else if(schema.type==='array'){list(value,schema.maxItems??32,v=>schemaValue(v,schema.items??{}));}
 else invalid();
}
export function validateHostedRequest(body,capabilities){
 if(body?.kind==='verify'){
  object(body,['version','kind','rawTranscript','interpreterOutputJson']);if(body.version!==1)invalid();string(body.rawTranscript,2000);string(body.interpreterOutputJson,16384);
  const parsed=JSON.parse(body.interpreterOutputJson);if(!plain(parsed)||!['answer','unavailable','plan'].includes(parsed.kind))invalid();
  if(Buffer.byteLength(body.interpreterOutputJson)>16384)invalid();
  if(parsed.kind==='plan'){
   // The plan envelope must not consume the independently bounded args depth.
   boundedJson({...parsed,steps:[]});
   list(parsed.steps,8,step=>{object(step,['capabilityId','args']);if(!capabilities.some(c=>c.id===step.capabilityId))invalid();argsObject(step.args);});
   if(!parsed.steps.length)invalid();
  }else boundedJson(parsed);
  return body;
 }
 object(body,['version','kind','context']);if(body.version!==1||body.kind!=='interpret')invalid();const c=body.context;
 const required=['rawTranscript','normalizedTranscript','todayDateKey','nowIso','recentTurns','referents','lookups','round','maxRounds'];
 object(c,[...required,'activeClarificationQuestion','activeProposalSummary'],required);
 string(c.rawTranscript,2000);string(c.normalizedTranscript,2000);string(c.todayDateKey,10);string(c.nowIso,32);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(c.todayDateKey)||!Number.isFinite(Date.parse(c.todayDateKey))||new Date(c.todayDateKey).toISOString().slice(0,10)!==c.todayDateKey)invalid();
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(c.nowIso)||!Number.isFinite(Date.parse(c.nowIso))||new Date(c.nowIso).toISOString().slice(0,19)!==c.nowIso.slice(0,19))invalid();
 list(c.recentTurns,4,t=>{object(t,['transcript','response']);string(t.transcript,2000,true);string(t.response,2000,true);});
 const keys=new Set();list(c.referents,4,r=>{object(r,['key','label','kind']);if(!['selected','lastMentioned','lastCreated','person'].includes(r.key)||keys.has(r.key))invalid();keys.add(r.key);string(r.label,300);string(r.kind,80);});
 for(const key of ['activeClarificationQuestion','activeProposalSummary'])if(c[key]!==undefined)string(c[key],2000);
 if(!Number.isInteger(c.round)||c.round<1||c.round>3||c.maxRounds!==3)invalid();
 list(c.lookups,Math.min(2,c.round-1),lookup=>{object(lookup,['capabilityId','args','resultSummary']);const cap=capabilities.find(c=>c.id===lookup.capabilityId&&!c.mutates);if(!cap)invalid();argsObject(lookup.args);schemaValue(lookup.args,cap.argsSchema);string(lookup.resultSummary,2000,true);});
 return body;
}

const closed=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const strings={type:'array',items:{type:'string'}};
const nullable={type:['string','null']};
export function createStrictSchemas(capabilities){
 const ids=capabilities.map(c=>c.id),readIds=capabilities.filter(c=>!c.mutates).map(c=>c.id);
 const step=closed({capabilityId:{type:'string',enum:ids},argsJson:{type:'string'}});
 const fields={kind:{type:'string',enum:['answer','clarify','plan','lookup','unavailable']},text:nullable,sources:strings,question:nullable,choices:strings,steps:{type:'array',items:step},summary:nullable,conditions:strings,capabilityId:{type:['string','null'],enum:[...readIds,null]},argsJson:nullable,explanation:nullable};
 const interpretation=closed(fields);
 const repair=closed({...fields,kind:{type:'string',enum:['answer','clarify','plan','unavailable']}});
 return {interpret:interpretation,verify:closed({verdict:{type:'string',enum:['accept','repair','clarify']},missingConstraints:strings,contradictions:strings,unsupportedAssumptions:strings,referentProblems:strings,temporalProblems:strings,clarifyQuestion:nullable,repairedFrame:{anyOf:[repair,{type:'null'}]}})};
}
export const WIRE_INSTRUCTIONS='Provider response format: all schema fields are required. For each capability call, put its argument object in argsJson as a JSON string, replacing the args object shown in examples. Fields unused by the selected kind must be null, or [] for arrays. Never use prose claiming that a mutation has happened; the application must review and commit it.';
const frameKeys=['kind','text','sources','question','choices','steps','summary','conditions','capabilityId','argsJson','explanation'];
function decodeFrame(frame,capabilities,allowLookup=true){
 object(frame,frameKeys);const arrayKeys=['sources','choices','steps','conditions'];
 const allowed={answer:['text','sources'],clarify:['question','choices'],plan:['steps','summary','conditions'],lookup:['capabilityId','argsJson'],unavailable:['explanation']}[frame.kind];
 if(!allowed||(!allowLookup&&frame.kind==='lookup'))invalid();
 for(const key of frameKeys.filter(k=>k!=='kind'&&!allowed.includes(k))){if(arrayKeys.includes(key)){if(!Array.isArray(frame[key])||frame[key].length)invalid();}else if(frame[key]!==null)invalid();}
 const decodeArgs=(id,json,readOnly=false)=>{const cap=capabilities.find(c=>c.id===id&&(!readOnly||!c.mutates));if(!cap)invalid();string(json,4096);return argsObject(JSON.parse(json));};
 const result={kind:frame.kind};
 for(const key of allowed){if(key==='steps'){list(frame.steps,8,s=>{object(s,['capabilityId','argsJson']);decodeArgs(s.capabilityId,s.argsJson);});if(!frame.steps.length)invalid();result.steps=frame.steps.map(s=>({capabilityId:s.capabilityId,args:decodeArgs(s.capabilityId,s.argsJson)}));}
  else if(key==='argsJson')result.args=decodeArgs(frame.capabilityId,frame.argsJson,true);
  else if(arrayKeys.includes(key)){list(frame[key],6,s=>string(s,2000));result[key]=frame[key];}
  else {string(frame[key],2000);result[key]=frame[key];}}
 return result;
}
export function decodeProviderOutput(raw,kind,capabilities){
 string(raw,32768);const value=JSON.parse(raw);
 if(kind==='interpret')return decodeFrame(value,capabilities);
 const issues=['missingConstraints','contradictions','unsupportedAssumptions','referentProblems','temporalProblems'];
 object(value,['verdict',...issues,'clarifyQuestion','repairedFrame']);
 for(const key of issues)list(value[key],6,s=>string(s,300));
 if(!['accept','repair','clarify'].includes(value.verdict))invalid();
 if(value.verdict==='clarify')string(value.clarifyQuestion,300);else if(value.clarifyQuestion!==null)invalid();
 if(value.verdict==='repair')value.repairedFrame=decodeFrame(value.repairedFrame,capabilities,false);else if(value.repairedFrame!==null)invalid();
 // An accept accompanied by unresolved issues is not an acceptance.
 if(value.verdict==='accept'&&issues.some(k=>value[k].length))invalid();
 return value;
}
