import { validateHostedRequest, decodeProviderOutput, WIRE_INSTRUCTIONS } from '../model-wire.mjs';
export const MODEL='gpt-4.1-mini-2025-04-14';
const ENDPOINT='https://api.openai.com/v1/chat/completions';
const failure=(reason,message)=>({ok:false,reason,message});
async function boundedBody(response,signal){
 if(Number(response.headers.get('content-length'))>65536){await response.body?.cancel();throw new Error('large response');}
 if(!response.body)throw new Error('missing body');const reader=response.body.getReader();let bytes=0;const chunks=[];
 const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
 try{while(true){if(signal.aborted)throw signal.reason;const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>65536)throw new Error('large response');chunks.push(value);}if(signal.aborted)throw signal.reason;return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
 finally{signal.removeEventListener('abort',cancel);await reader.cancel().catch(()=>{});reader.releaseLock();}
}
export function createOpenAiModel({apiKey,contract,maxInputTokens,maxOutputTokens,costMicros,fetchImpl=fetch}={}){
 // UTF-8 bytes conservatively upper-bound text tokens. Include schema and a
 // 1,024-token framing margin before reservation. No cached-input discount.
 if(typeof apiKey!=='string'||!apiKey.trim()||!contract||!Number.isSafeInteger(maxInputTokens)||maxInputTokens<1||maxInputTokens>100000||!Number.isSafeInteger(maxOutputTokens)||maxOutputTokens<1||maxOutputTokens>4096||!Number.isSafeInteger(costMicros)||costMicros<Math.ceil((maxInputTokens*4+maxOutputTokens*16)/10))return undefined;
 return {
  validateRequest(body){
   validateHostedRequest(body,contract.capabilities);
   const schema=contract.schemas[body.kind];
   const system=(body.kind==='interpret'?contract.system:contract.verifierSystem)+'\n\n'+WIRE_INSTRUCTIONS;
   const user=body.kind==='interpret'?contract.buildUserPrompt(body.context):contract.buildVerifierUserPrompt(body);
   const tokens=Buffer.byteLength(system)+Buffer.byteLength(user)+Buffer.byteLength(JSON.stringify(schema))+1024;
   if(tokens>maxInputTokens)throw new Error('model input limit');
   return {kind:body.kind,system,user,schema};
  },
  async run(request,{signal,maxOutputTokens:outputLimit}){
   if(signal.aborted)return failure('cancelled','Cancelled.');
   if(outputLimit!==maxOutputTokens)return failure('unavailable','Cloud reasoning is unavailable. Typed commands still work.');
   const started=Date.now();let received=false;
   try{
    const response=await fetchImpl(ENDPOINT,{method:'POST',redirect:'error',signal,headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,store:false,stream:false,n:1,max_completion_tokens:maxOutputTokens,messages:[{role:'system',content:request.system},{role:'user',content:request.user}],response_format:{type:'json_schema',json_schema:{name:`flow_${request.kind}_v1`,strict:true,schema:request.schema}}})});
    if(!response.ok){await response.body?.cancel();return failure('unavailable','Cloud reasoning is temporarily unavailable. Typed commands still work.');}
    received=true;const body=await boundedBody(response,signal);
    if(!Array.isArray(body.choices)||body.choices.length!==1)return failure('rejected','Flow received an incomplete interpretation. Nothing changed.');
    const choice=body.choices[0];
    if(choice.message?.refusal||choice.finish_reason==='content_filter')return failure('rejected','Flow could not interpret that request. Nothing changed.');
    if(choice.finish_reason!=='stop')return failure('rejected','Flow received an incomplete interpretation. Nothing changed.');
    if(body.model!==MODEL)return failure('rejected','Flow received an unexpected model response. Nothing changed.');
    const content=JSON.stringify(decodeProviderOutput(choice.message?.content,request.kind,contract.capabilities));
    if(signal.aborted)return failure('cancelled','Cancelled.');
    return {ok:true,response:{content,model:MODEL,totalDurationMs:Date.now()-started,loadDurationMs:null,evalCount:null}};
   }catch{return signal.aborted?failure('cancelled','Cancelled.'):failure(received?'rejected':'unavailable',received?'Flow could not obtain a safe interpretation. Nothing changed.':'Cloud reasoning is temporarily unavailable. Typed commands still work.');}
  },
 };
}
