import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRedisStore } from './store.mjs';
import { createHostedGateway } from './index.mjs';
const url = process.env.FLOW_TEST_REDIS_URL;
if (!url) throw new Error('FLOW_TEST_REDIS_URL required');
let store, gateway, root, base, config, provider, namespace;
const origin='https://flow.example';
beforeEach(async()=>{
 namespace=`flow-test-${randomUUID()}`;
 store=await createRedisStore({url,parentNamespace:namespace,environment:'test'});
 await store.initializeLedger({parentDailyMicros:1000,environmentDailyMicros:1000,identityDailyRequests:100,identityDailyAudioMs:900000,globalVoiceLimit:5,voiceSessionMs:300000});
 root=await mkdtemp(join(tmpdir(),'gateway-'));
 await writeFile(join(root,'index.html'),'<html><head></head><body><script type="module" src="/app.js"></script></body></html>');
 await writeFile(join(root,'app.js'),'export {}');
 config={origin,distDir:root,releaseId:'test-release',inferenceEnabled:true,consentVersion:'v1',sessionTtlMs:60000,requestDeadlineMs:1000,maxOutputTokens:100,interpretCostMicros:10};
 provider={validateRequest:body=>body?.contractVersion==='1'&&typeof body.input==='string'&&Object.keys(body).every(k=>['contractVersion','input'].includes(k))?body:null,run:vi.fn(async()=>({ok:true}))};
 await start();
});
async function start(){ gateway=createHostedGateway({config,store,providers:{interpret:provider}}); await new Promise(r=>gateway.server.listen(0,'127.0.0.1',r)); base=`http://127.0.0.1:${gateway.server.address().port}`; }
afterEach(async()=>{await gateway.shutdown();await store.deleteTestNamespace();await store.close();await rm(root,{recursive:true,force:true});});
async function login(identity='tester') { const invite=await store.issueInvite(identity);const res=await fetch(`${base}/api/session`,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({invite,consentVersion:'v1'})});expect(res.status).toBe(200);return {cookie:res.headers.get('set-cookie').split(';')[0],...(await res.json())}; }
function interpret(session,headers={},body={contractVersion:'1',input:'hello'}){return fetch(`${base}/api/interpret`,{method:'POST',headers:{origin,cookie:session.cookie,'x-flow-csrf':session.csrf,'content-type':'application/json',...headers},body:JSON.stringify(body)});}
it('injects safe hosted runtime before app scripts and serves known deep links',async()=>{for(const path of ['/','/calendar','/journal']){const res=await fetch(base+path);expect(res.status).toBe(200);const html=await res.text();expect(html.indexOf('window.__FLOW_RUNTIME__')).toBeLessThan(html.indexOf('type="module"'));expect(html).toContain('test-release');}expect((await fetch(base+'/api/health')).status).toBe(200);});
it('rejects repository, dotfiles, desktop and unknown API routes and escaped traversal',async()=>{await symlink('/etc/passwd',join(root,'escape.txt'));for(const path of ['/.env','/package.json','/api/nope','/capability','/desktop','/escape.txt','/%2e%2e%2fpackage.json','/unknown']) expect((await fetch(base+path)).status).toBe(404);});
it('serves static typed app when config, provider, or store unavailable',async()=>{await gateway.shutdown();config={...config,inferenceEnabled:false};await start();expect(await (await fetch(base+'/')).text()).toContain('"inferenceEnabled":false');await store.close();expect((await fetch(base+'/api/health')).status).toBe(200);expect((await fetch(base+'/')).status).toBe(200);});
it('uses secure cookie, rejects forged auth/origin/CSRF and does not call provider',async()=>{const s=await login();expect((await interpret(s,{'x-flow-csrf':'forged'})).status).toBe(403);expect((await interpret(s,{origin:'https://evil.example'})).status).toBe(403);expect((await interpret(s,{cookie:'__Host-flow_session=forged'})).status).toBe(401);expect(provider.run).not.toHaveBeenCalled();expect((await interpret(s)).status).toBe(200);});
it('rejects arbitrary prompt/model/schema/url and oversized body',async()=>{const s=await login();for(const key of ['system','model','schema','url','tools'])expect((await interpret(s,{}, {contractVersion:'1',input:'hello',[key]:'bad'})).status).toBe(400);expect((await interpret(s,{}, {contractVersion:'1',input:'x'.repeat(66000)})).status).toBe(413);expect(provider.run).not.toHaveBeenCalled();});
it('logout aborts only owned work; durable kill aborts remaining work',async()=>{const a=await login('a'),b=await login('b');const sa=await gateway.authenticate({headers:{cookie:a.cookie}}),sb=await gateway.authenticate({headers:{cookie:b.cookie}});const wa=await gateway.beginWork(sa,{costMicros:10,requests:1}),wb=await gateway.beginWork(sb,{costMicros:10,requests:1});expect((await fetch(base+'/api/session',{method:'DELETE',headers:{origin,cookie:a.cookie,'x-flow-csrf':a.csrf}})).status).toBe(200);expect(wa.signal.aborted).toBe(true);expect(wb.signal.aborted).toBe(false);await gateway.disable();expect(wb.signal.aborted).toBe(true);expect((await interpret(b)).status).toBe(503);await wa.release();await wb.release();});
it('store loss aborts active work and keeps app available',async()=>{const s=await login();const session=await gateway.authenticate({headers:{cookie:s.cookie}});const work=await gateway.beginWork(session,{costMicros:10,requests:1});await store.close();await new Promise(r=>setTimeout(r,350));expect(work.signal.aborted).toBe(true);expect((await fetch(base+'/')).status).toBe(200);});
it('enforces provider deadline without refunding reserved work',async()=>{provider.run=vi.fn((_,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true})));const s=await login();expect((await interpret(s)).status).toBe(503);expect(provider.run).toHaveBeenCalledOnce();});
it('aborts expired active sessions',async()=>{const invite=await store.issueInvite('short');const {session}=await store.redeem(invite,40,'v1');const work=await gateway.beginWork(session,{costMicros:10,requests:1});await new Promise(r=>setTimeout(r,65));expect(work.signal.aborted).toBe(true);await work.release();});
it('observes remote disable during active work',async()=>{const s=await login();const session=await gateway.authenticate({headers:{cookie:s.cookie}});const work=await gateway.beginWork(session,{costMicros:10,requests:1});await store.disable();await new Promise(r=>setTimeout(r,300));expect(work.signal.aborted).toBe(true);await work.release();});
it('keeps endpoint disabled without provider or positive input/output cost bounds',async()=>{for(const bad of [{maxOutputTokens:0},{interpretCostMicros:0},{origin:'http://flow.example'}]){await gateway.shutdown();config={...config,...bad};await start();expect(await gateway.inferenceReady()).toBe(false);expect((await fetch(base+'/')).status).toBe(200);}await gateway.shutdown();gateway=createHostedGateway({config:{...config,origin},store});await new Promise(r=>gateway.server.listen(0,'127.0.0.1',r));expect(await gateway.inferenceReady()).toBe(false);});
it('escapes bootstrap values so release metadata cannot inject markup',async()=>{await gateway.shutdown();config={...config,releaseId:'</script><script>alert(1)</script>'};await start();const html=await (await fetch(base+'/')).text();expect(html).not.toContain('<script>alert(1)');expect(html).toContain('\\u003c/script');});
it('propagates HTTP disconnect to provider signal',async()=>{let started;const ready=new Promise(r=>started=r);let signal;provider.run=vi.fn((_,options)=>{signal=options.signal;started();return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));});const s=await login();const controller=new AbortController();const response=fetch(base+'/api/interpret',{method:'POST',headers:{origin,cookie:s.cookie,'x-flow-csrf':s.csrf,'content-type':'application/json'},body:JSON.stringify({contractVersion:'1',input:'hi'}),signal:controller.signal}).catch(()=>{});await ready;controller.abort();await response;await new Promise(r=>setTimeout(r,25));expect(signal.aborted).toBe(true);});
it('bounds pending interpretations before body processing and releases slots on cancellation and error',async()=>{
 const signals=[];provider.run=vi.fn((_,{signal})=>{signals.push(signal);return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));});
 const s=await login(),controllers=Array.from({length:8},()=>new AbortController());
 const requests=controllers.map(c=>fetch(base+'/api/interpret',{method:'POST',headers:{origin,cookie:s.cookie,'x-flow-csrf':s.csrf,'content-type':'application/json'},body:JSON.stringify({contractVersion:'1',input:'hello'}),signal:c.signal}).catch(()=>{}));
 try{await vi.waitFor(()=>expect(signals).toHaveLength(8));const before=provider.run.mock.calls.length;expect((await fetch(base+'/api/interpret',{method:'POST',headers:{origin,cookie:s.cookie,'x-flow-csrf':s.csrf,'content-type':'application/json'},body:'not-json'})).status).toBe(429);expect(provider.run).toHaveBeenCalledTimes(before);controllers[0].abort();await vi.waitFor(()=>expect(signals[0].aborted).toBe(true));await new Promise(r=>setTimeout(r,10));expect((await interpret(s,{}, {bad:true})).status).toBe(400);expect((await interpret(s,{}, {bad:true})).status).toBe(400);}
 finally{controllers.forEach(c=>c.abort());await Promise.allSettled(requests);}
});
it('checks stored consent on active work, not only invitation redemption',async()=>{
 const s=await login();const session=await gateway.authenticate({headers:{cookie:s.cookie}});const work=await gateway.beginWork(session,{costMicros:10,requests:1});
 const key=`${store.namespace}:auth:test:session:${session.sessionHash}`;await store.client.set(key,JSON.stringify({...session,consentVersion:'obsolete'}),{PX:60000});
 await vi.waitFor(()=>expect(work.signal.aborted).toBe(true));await expect(gateway.authenticate({headers:{cookie:s.cookie}})).rejects.toThrow('session');await work.release();
});
it('never publishes a result disabled during final store validation',async()=>{
 const original=store.checkReady;let disableDuringValidation=false;
 provider.run=vi.fn(async()=>{disableDuringValidation=true;return {ok:true};});
 store.checkReady=async()=>{await original();if(disableDuringValidation){disableDuringValidation=false;await gateway.disable();}};
 const s=await login();expect((await interpret(s)).status).toBe(503);expect(provider.run).toHaveBeenCalledOnce();
});
it('reserves every valid interpretation/verifier request and no rejected request',async()=>{
 provider.validateRequest=body=>body.version===1&&['interpret','verify'].includes(body.kind)&&Object.keys(body).every(k=>['version','kind'].includes(k))?body:null;
 const s=await login();const reserve=vi.spyOn(store,'reserve');expect((await interpret(s,{}, {version:1,kind:'interpret'})).status).toBe(200);expect((await interpret(s,{}, {version:1,kind:'verify'})).status).toBe(200);expect((await interpret(s,{}, {unexpected:true})).status).toBe(400);expect(reserve).toHaveBeenCalledTimes(2);expect(reserve.mock.calls.every(([request])=>request.costMicros===10&&request.requests===1)).toBe(true);
});
