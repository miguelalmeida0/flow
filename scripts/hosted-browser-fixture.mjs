// Isolated synthetic-provider qualification server. Never packaged for runtime.
import { createServer } from 'node:https';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createHostedGateway } from '../server/hosted-gateway/index.mjs';
import { createRedisStore } from '../server/hosted-gateway/store.mjs';

const port = Number(process.env.FLOW_HTTPS_FIXTURE_PORT ?? 5443), origin = `https://127.0.0.1:${port}`;
const directory = resolve('artifacts/hosted-release/https-fixture'); mkdirSync(directory,{recursive:true});
execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',`${directory}/key.pem`,'-out',`${directory}/cert.pem`,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1,DNS:localhost'],{stdio:'ignore'});
// One second of repeating 440Hz PCM is a declared synthetic microphone input.
const rate=48000,samples=rate*2,wav=Buffer.alloc(44+samples*2);
wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples*2,40);
for(let i=0;i<samples;i++)wav.writeInt16LE(Math.round(Math.sin(2*Math.PI*440*i/rate)*6000),44+i*2);
writeFileSync(`${directory}/microphone.wav`,wav);
const store=await createRedisStore({url:process.env.FLOW_TEST_REDIS_URL,parentNamespace:`flow-test-${randomUUID()}`,environment:'https'});
await store.initializeLedger({parentDailyMicros:10000000,environmentDailyMicros:10000000,identityDailyRequests:100,identityDailyAudioMs:900000,globalVoiceLimit:5,voiceSessionMs:300000});
const state={opens:0,pcmFrames:0,pcmBytes:0,nonzeroSamples:0,closed:0,ttsRequests:0,modelRequests:0,modelAborted:0};
const channels=[];
let modelMode='proposal', pendingModel, suppressNextInitial=false;
const modelResult=()=>({ok:true,response:{model:'gpt-4.1-mini-2025-04-14',content:JSON.stringify({kind:'plan',summary:'Create reviewed note',conditions:[],steps:[{capabilityId:'journal.create',args:{title:'Reviewed note'}}]})}});
const providers={
  interpret:{validateRequest:body=>body,run:async(body,{signal})=>{
    state.modelRequests++;
    if(body.kind==='verify')return {ok:true,response:{model:'gpt-4.1-mini-2025-04-14',content:JSON.stringify({verdict:'accept'})}};
    if(modelMode==='delayed')return new Promise(resolveModel=>{pendingModel=()=>resolveModel(modelResult());signal.addEventListener('abort',()=>{state.modelAborted++;},{once:true});});
    return modelResult();
  }},
  stt:{open:async options=>{
    state.opens++;let sent=suppressNextInitial,closed=false;suppressNextInitial=false;
    const channel={...options,frames:0,isClosed:()=>closed};channels.push(channel);
    options.signal.addEventListener('abort',()=>{if(!closed){closed=true;state.closed++;}},{once:true});
    return {sendAudio(data){
      if(closed)throw new Error('PCM after close');
      channel.frames++;const bytes=Buffer.from(data);state.pcmFrames++;state.pcmBytes+=bytes.length;
      for(let i=0;i+1<bytes.length;i+=2)if(bytes.readInt16LE(i)!==0)state.nonzeroSamples++;
      if(!sent&&state.pcmFrames>=4){sent=true;const utteranceId=randomUUID();options.onEvent({type:'speech.start',utteranceId});options.onEvent({type:'transcript.final',utteranceId,text:'Remember I prefer quiet afternoons'});}
    },setInputMode(){},close(){if(!closed){closed=true;state.closed++;}}};
  }},
  tts:{open:async()=>{state.ttsRequests++;let done=false;return {read:async()=>{if(done)return null;done=true;return new Uint8Array(3840);},close(){}};}},
};
const gateway=createHostedGateway({store,providers,config:{origin,releaseId:'synthetic-https-fixture',inferenceEnabled:true,consentVersion:'https-fixture-v1',speechRateVerified:true,sttRateMicrosPerMinute:7700,sttSessionCostMicros:50000,ttsCostMicros:10000,maxOutputTokens:1024,interpretCostMicros:10000}});
await new Promise(resolveListen=>gateway.server.listen(0,'127.0.0.1',resolveListen));
const server=createServer({key:readFileSync(`${directory}/key.pem`),cert:readFileSync(`${directory}/cert.pem`)},async(req,res)=>{
  if(req.url==='/__fixture/invite'){
    const invite=await store.issueInvite(randomUUID());res.setHeader('content-type','application/json');res.end(JSON.stringify({invite}));return;
  }
  if(req.url==='/__fixture/state'){res.setHeader('content-type','application/json');res.end(JSON.stringify({...state,channels:channels.map(channel=>({frames:channel.frames,closed:channel.isClosed()}))}));return;}
  if(req.url==='/__fixture/control'&&req.method==='POST'){
    let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);
    if(body.action==='model')modelMode=body.mode;
    if(body.action==='suppress-next-initial')suppressNextInitial=true;
    if(body.action==='resolve-model'){pendingModel?.();pendingModel=undefined;}
    if(body.action==='expire'){
      const session=await gateway.authenticate(req),key=`${store.namespace}:auth:${store.environment}:session:${session.sessionHash}`;
      await store.client.set(key,JSON.stringify({...session,expiresAt:Date.now()-1}),{PX:1000});
    }
    if(body.action==='outage')channels[body.channel].onEvent({type:'stt.error',message:'Synthetic outage'});
    if(body.action==='transcript'){
      const channel=channels[body.channel];channel.onEvent({type:'speech.start',utteranceId:body.id});channel.onEvent({type:'transcript.final',utteranceId:body.id,text:body.text});
      if(body.duplicate)channel.onEvent({type:'transcript.final',utteranceId:body.id,text:body.text});
    }
    res.setHeader('content-type','application/json');res.end('{}');return;
  }
  gateway.server.emit('request',req,res);
});
server.on('upgrade',(req,socket,head)=>gateway.server.emit('upgrade',req,socket,head));
await new Promise(resolveListen=>server.listen(port,'127.0.0.1',resolveListen));
console.log(`Synthetic HTTPS fixture ready at ${origin}`);
let stopping=false;
async function stop(){if(stopping)return;stopping=true;server.closeAllConnections();await gateway.shutdown();await new Promise(done=>server.close(done));await store.deleteTestNamespace();await store.close();process.exit(0);}
process.on('SIGTERM',()=>void stop());process.on('SIGINT',()=>void stop());
