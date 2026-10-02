import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAuth, httpError } from './auth.mjs';
import { normalizeConfig, readConfig } from './config.mjs';
import { createRedisStore } from './store.mjs';
import { attachHostedVoice } from './voice.mjs';
import { createDeepgramStt } from './providers/deepgram-stt.mjs';
import { createOpenAiTts } from './providers/openai-tts.mjs';
import { createOpenAiModel } from './providers/openai-model.mjs';
import { loadModelContract } from './model-contract.mjs';

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2','.woff':'font/woff','.mp4':'video/mp4','.webm':'video/webm','.wav':'audio/wav','.txt':'text/plain; charset=utf-8'};
const ROUTE=/^\/(?:home|today|calendar|now|focus|weather-outfit|good-to-know|journal|atmosphere|memories|capture|inbox|commitments|friends|people|outcomes|plans)?\/?$/;
const NESTED_ROUTE=/^\/(?:outcomes|plans)\/[\w-]+\/?$|^\/(?:people|friends)\/(?:person|group)\/[\w-]+(?:\/note\/[\w-]+)?\/?$/;
const timeout=(promise,ms=1500)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(httpError(503,'store timeout')),ms);})]).finally(()=>clearTimeout(timer));};

function json(res,status,body,headers={}){if(!res.destroyed&&!res.writableEnded){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers});res.end(JSON.stringify(body));}}
async function bodyJson(req){
 if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))throw httpError(415,'JSON required');
 if(Number(req.headers['content-length'])>65536)throw httpError(413,'body too large');
 let length=0;const chunks=[];
 for await(const chunk of req){length+=chunk.length;if(length>65536)throw httpError(413,'body too large');chunks.push(chunk);}
 try{const value=JSON.parse(Buffer.concat(chunks).toString());if(!value||Array.isArray(value)||typeof value!=='object')throw new Error();return value;}catch{throw httpError(400,'invalid JSON');}
}

export function createHostedGateway({config:input={},store,providers={}}={}){
 const config=normalizeConfig(input),auth=createAuth({config,store}),works=new Set();
 let closed=false,locallyDisabled=false,polling=false,interpretationSlots=0;
 const adapter=providers.interpret;
 async function inferenceReady(){if(closed||locallyDisabled||!config.inferenceConfigured||!store||typeof adapter?.validateRequest!=='function'||typeof adapter?.run!=='function')return false;try{await timeout(store.checkReady());return true;}catch{return false;}}
 async function speechReady(){if(closed||locallyDisabled||!config.speechConfigured||!store||!providers.stt?.open||!providers.tts?.open)return false;try{await timeout(store.checkReady());return true;}catch{return false;}}
 async function publicFeatures(){const reasoning=await inferenceReady(),speech=await speechReady();return {inferenceEnabled:reasoning||speech,reasoningEnabled:reasoning,speechEnabled:speech,consentVersion:config.consentVersion||null};}
 function abortAll(reason){for(const work of works)work.abort(reason);}
 async function beginWork(session,{costMicros,requests=0,audioMs=0,voice=false,deadlineMs=config.requestDeadlineMs}={}){
  if(closed||locallyDisabled||!config.accessConfigured||!store)throw httpError(503,'inference unavailable');
  if(!Number.isSafeInteger(deadlineMs)||deadlineMs<=0||deadlineMs>(voice?300000:30000))throw httpError(400,'invalid deadline');
  await timeout(store.getSession(session.sessionHash,config.consentVersion));
  let reservation;
  const reservationStartedAt=Date.now();
  try{reservation=await timeout(store.reserve({identity:session.identity,costMicros,requests,audioMs,voice}));}catch(e){throw httpError(/quota|voice .*busy/.test(e.message)?429:503,'inference unavailable');}
  const controller=new AbortController();let released=false;
  // Anchor returned Redis duration before the reservation round trip as well
  // as using its absolute expiry. Clock skew or a delayed response may shorten
  // our work, but can never extend it beyond the shared lease.
  const expiresAt=Math.min(session.expiresAt,reservationStartedAt+deadlineMs,
    voice?reservation.expiresAt:Infinity,voice?reservationStartedAt+reservation.leaseDurationMs:Infinity);
  const work={session,expiresAt,signal:controller.signal,abort:(reason='cancelled')=>controller.abort(httpError(503,reason)),release:async()=>{if(released)return;released=true;clearTimeout(timer);works.delete(work);try{await timeout(store.release(reservation));}catch{/* A lease can expire; spend is never refunded. */}}};
  const timer=setTimeout(()=>work.abort('deadline'),Math.max(0,expiresAt-Date.now()));timer.unref();works.add(work);
  // Covers disable/logout races that occur while the atomic reservation is pending.
  try{if(closed||locallyDisabled||!Number.isFinite(expiresAt))throw new Error();await timeout(store.checkReady());await timeout(store.getSession(session.sessionHash,config.consentVersion));if(work.signal.aborted||Date.now()>=expiresAt)throw new Error();}catch{work.abort('authorization unavailable');await work.release();throw httpError(503,'inference unavailable');}
  return work;
 }
 const lifecycle=setInterval(async()=>{
  if(polling||!works.size)return;polling=true;
  try{await timeout(store.checkReady());await Promise.all([...works].map(async work=>{try{await timeout(store.getSession(work.session.sessionHash,config.consentVersion));}catch{work.abort('session unavailable');}}));}catch{abortAll('store unavailable');}finally{polling=false;}
 },200);lifecycle.unref();

 async function serveStatic(req,res,path){
  if(!['GET','HEAD'].includes(req.method))throw httpError(404,'not found');
  if(path.includes('\\')||path.includes('\0')||path.split('/').some(p=>p.startsWith('.')))throw httpError(404,'not found');
  const route=ROUTE.test(path)||NESTED_ROUTE.test(path);
  const relative=route?'index.html':path.replace(/^\//,'');
  // Assets must have a known browser type; never expose source, maps, or root manifests.
  if(!route&&(relative==='package.json'||!MIME[extname(relative)]||relative.endsWith('.map')))throw httpError(404,'not found');
  let root,file;try{root=await realpath(config.distDir);file=await realpath(resolve(root,relative));if(!file.startsWith(root+sep)||!(await stat(file)).isFile())throw new Error();}catch{throw httpError(404,'not found');}
  let content=await readFile(file);
  if(route||extname(file)==='.html'){
   // Escape all HTML-sensitive characters, including release IDs supplied by operators.
   const runtime=JSON.stringify({mode:'hosted',...await publicFeatures(),releaseId:config.releaseId}).replace(/[<>&\u2028\u2029]/g,c=>`\\u${c.charCodeAt(0).toString(16).padStart(4,'0')}`);
   const html=content.toString();const injection=`<script>window.__FLOW_RUNTIME__=${runtime};</script>`;
   content=Buffer.from(/<head(?:\s[^>]*)?>/i.test(html)?html.replace(/<head(?:\s[^>]*)?>/i,match=>match+injection):injection+html);
  }
  res.writeHead(200,{'content-type':MIME[extname(file)]||'application/octet-stream','cache-control':extname(file)==='.html'?'no-store':'public, max-age=300','x-content-type-options':'nosniff','referrer-policy':'same-origin','content-length':content.length});res.end(req.method==='HEAD'?undefined:content);
 }

 const server=createServer(async(req,res)=>{
  const requestTimer=setTimeout(()=>{json(res,408,{error:'request timeout'});req.destroy();},35000);requestTimer.unref();
  res.once('close',()=>clearTimeout(requestTimer));
  try{
   const rawPath=(req.url||'/').split('?')[0];let path;try{path=decodeURIComponent(rawPath);}catch{throw httpError(404,'not found');}
   if(path==='/api/health'&&req.method==='GET'){
    let applicationReady=false;try{applicationReady=(await stat(resolve(config.distDir,'index.html'))).isFile();}catch{/* static app not built */}
    return json(res,applicationReady?200:503,{applicationReady,...await publicFeatures(),releaseId:config.releaseId});
   }
   if(path==='/api/session'){
    if(req.method==='GET'){
     try{const session=await auth.authenticate(req);return json(res,200,{authenticated:true,csrf:session.csrf,expiresAt:session.expiresAt,...await publicFeatures()});}catch(e){if(e.status===401)return json(res,200,{authenticated:false,...await publicFeatures()});throw e;}
    }
    if(req.method==='POST'){
     auth.assertOrigin(req);const body=await bodyJson(req);let result;
     try{result=await timeout(auth.redeem(body,req.socket.remoteAddress||'unknown'));}catch(e){if(e.status)throw e;throw httpError(e.message.includes('rate')?429:e.message.includes('invite')?401:503,'access unavailable');}
     return json(res,200,{authenticated:true,csrf:result.session.csrf,expiresAt:result.session.expiresAt,...await publicFeatures()},{'set-cookie':result.cookie});
    }
    if(req.method==='DELETE'){
     const session=await timeout(auth.authenticate(req,{csrf:true}));await timeout(auth.logout(session));for(const work of works)if(work.session.sessionHash===session.sessionHash)work.abort('logout');return json(res,200,{authenticated:false},{'set-cookie':auth.clearCookie});
    }
   }
   if(path==='/api/interpret'&&req.method==='POST'){
    if(interpretationSlots>=8)throw httpError(429,'reasoning busy');
    interpretationSlots+=1;
    try{
    const session=await timeout(auth.authenticate(req,{csrf:true}));
    if(!await inferenceReady())throw httpError(503,'inference unavailable');
    const body=await bodyJson(req);
    if(Buffer.byteLength(JSON.stringify(body))>config.maxInputBytes)throw httpError(413,'input too large');
    let validated;try{validated=adapter.validateRequest(body);}catch{throw httpError(400,'invalid interpretation request');}
    if(!validated||typeof validated.then==='function')throw httpError(400,'invalid interpretation request');
    const work=await beginWork(session,{costMicros:config.interpretCostMicros,requests:1});
    const disconnect=()=>work.abort('disconnected');res.once('close',disconnect);
    try{
     if(req.aborted||res.destroyed)work.abort('disconnected');
     const result=await Promise.race([Promise.resolve().then(()=>{if(work.signal.aborted)throw work.signal.reason;return adapter.run(validated,{signal:work.signal,session:{identity:session.identity},maxOutputTokens:config.maxOutputTokens});}),new Promise((_,reject)=>{if(work.signal.aborted)reject(work.signal.reason);else work.signal.addEventListener('abort',()=>reject(work.signal.reason),{once:true});})]);
     if(work.signal.aborted)throw work.signal.reason;
     await timeout(store.getSession(session.sessionHash,config.consentVersion));await timeout(store.checkReady());
     if(work.signal.aborted)throw work.signal.reason;
     const encoded=JSON.stringify(result);if(Buffer.byteLength(encoded)>65536)throw httpError(502,'provider output too large');
     return json(res,200,result);
    }finally{res.off('close',disconnect);work.abort('completed');await work.release();}
    }finally{interpretationSlots-=1;}
   }
   if(path.startsWith('/api/')||path==='/voice'||path==='/capability'||path.startsWith('/desktop'))throw httpError(404,'not found');
   return await serveStatic(req,res,path);
  }catch(e){json(res,e.status||503,{error:e.status&&e.status<500?e.message:'service unavailable'});}finally{clearTimeout(requestTimer);}
 });
 server.requestTimeout=35000;server.headersTimeout=10000;server.keepAliveTimeout=5000;server.maxHeadersCount=50;
 const voice=attachHostedVoice({server,config,authenticate:(req,options)=>timeout(auth.authenticate(req,options)),beginWork,speechReady,providers});
 return {server,config,authenticate:(req,options)=>timeout(auth.authenticate(req,options)),beginWork,inferenceReady,speechReady,
  async disable(){locallyDisabled=true;abortAll('inference disabled');if(store)await timeout(store.disable());},
  async shutdown(){if(closed)return;closed=true;voice.close();abortAll('shutdown');clearInterval(lifecycle);await Promise.all([...works].map(w=>w.release()));await new Promise(resolveClose=>{server.close(resolveClose);server.closeAllConnections();});},
 };
}

// Executable entry point stays useful in degraded mode. Provider wiring is explicit.
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 const config=readConfig();let store;
 try{store=await createRedisStore({url:config.redisUrl,parentNamespace:config.parentNamespace,environment:config.environment});}catch{/* Static typed app still starts. */}
 const providers={stt:createDeepgramStt({apiKey:process.env.DEEPGRAM_API_KEY}),tts:createOpenAiTts({apiKey:process.env.OPENAI_API_KEY})};
 try{providers.interpret=createOpenAiModel({apiKey:process.env.OPENAI_API_KEY,contract:await loadModelContract(),maxInputTokens:config.maxInputTokens,maxOutputTokens:config.maxOutputTokens,costMicros:config.interpretCostMicros});}catch{/* Missing contract keeps reasoning disabled; speech and typed use remain independent. */}
 const gateway=createHostedGateway({config,store,providers});
 gateway.server.listen(config.port,'0.0.0.0');
 for(const signal of ['SIGTERM','SIGINT'])process.once(signal,async()=>{await gateway.shutdown();await store?.close();});
}
