import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {WebSocket} from 'ws';
import {createRedisStore} from './store.mjs';
import {createHostedGateway} from './index.mjs';
import {normalizeConfig} from './config.mjs';
import {encodeVoiceFrame,decodeVoiceFrame} from '../../shared/hosted-voice-protocol.mjs';
const url=process.env.FLOW_TEST_REDIS_URL;
if(!url)throw new Error('FLOW_TEST_REDIS_URL required');
const origin='https://flow.example';
let store,gateway,base,stt,tts,channels,sockets,config;
beforeEach(async()=>{
  channels=[];sockets=[];
  store=await createRedisStore({url,parentNamespace:'flow-test-'+randomUUID(),environment:'voice'});
  await store.initializeLedger({parentDailyMicros:10000000,environmentDailyMicros:10000000,identityDailyRequests:100,identityDailyAudioMs:900000,globalVoiceLimit:5,voiceSessionMs:300000});
  stt={model:'test',version:'test',open:vi.fn(async options=>{const channel={...options,sendAudio:vi.fn(),setInputMode:vi.fn(),close:vi.fn()};channels.push(channel);return channel;})};
  tts={model:'test',open:vi.fn(async()=>({read:async()=>null,close(){}}))};
  config={origin,inferenceEnabled:true,consentVersion:'v1',speechRateVerified:true,sttRateMicrosPerMinute:7700,sttSessionCostMicros:50000,ttsCostMicros:10000};
  gateway=createHostedGateway({config,store,providers:{stt,tts}});
  await new Promise(resolve=>gateway.server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+gateway.server.address().port;
});
afterEach(async()=>{vi.restoreAllMocks();for(const socket of sockets)socket.terminate();await gateway.shutdown();await store.deleteTestNamespace();await store.close();});
async function login(identity=randomUUID()){
  const invite=await store.issueInvite(identity);
  const response=await fetch(base+'/api/session',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({invite,consentVersion:'v1'})});
  return {cookie:response.headers.get('set-cookie').split(';')[0],...await response.json()};
}
async function connect(session,hello=true){
  const socket=new WebSocket(base.replace('http:','ws:')+'/api/voice',{headers:{origin,cookie:session.cookie}});
  sockets.push(socket);const events=[];socket.on('message',(data,binary)=>events.push(binary?decodeVoiceFrame(data):JSON.parse(data)));
  await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
  const epoch=randomUUID();
  if(hello)socket.send(JSON.stringify({type:'hello',version:1,csrf:session.csrf,captureEpoch:epoch,inputMode:'command'}));
  return {socket,events,epoch};
}
async function until(predicate){for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,5));}throw new Error('condition timed out');}
it('speech readiness is separate from reasoning and exposes consent version',async()=>{
  expect(await gateway.inferenceReady()).toBe(false);expect(await gateway.speechReady()).toBe(true);
  const session=await login();expect(session.speechEnabled).toBe(true);expect(session.reasoningEnabled).toBe(false);expect(session.consentVersion).toBe('v1');
});
it('reserves before provider open and rejects a forged first-frame CSRF',async()=>{
  const session=await login(),connection=await connect({...session,csrf:'forged'});
  await until(()=>connection.socket.readyState===3);
  expect(stt.open).not.toHaveBeenCalled();
});
it('does not open providers when quota is exhausted and exposes committed reservation before open',async()=>{
  const original=stt.open;
  stt.open=vi.fn(async options=>{
    const ledger=await store.client.hGetAll(store.namespace+':ledger');
    expect(Object.keys(JSON.parse(ledger.leases))).toHaveLength(1);
    expect(Object.entries(ledger).some(([key,value])=>/^spend:\d+$/.test(key)&&Number(value)===50000)).toBe(true);
    return original(options);
  });
  const first=await connect(await login());await until(()=>first.events.some(e=>e.type==='ready'));
  await store.reserve({identity:'consume-budget',costMicros:9950000});
  const denied=await connect(await login());await until(()=>denied.socket.readyState===3);
  expect(stt.open).toHaveBeenCalledOnce();
});
it('actual auth expiry stops an admitted session and shutdown rejects late callbacks',async()=>{
  const invite=await store.issueInvite('short-lived');const redeemed=await store.redeem(invite,180,'v1');
  const c=await connect({cookie:'__Host-flow_session='+redeemed.token,csrf:redeemed.session.csrf});
  await until(()=>c.events.some(e=>e.type==='ready'));await until(()=>c.socket.readyState===3);
  expect(channels[0].signal.aborted).toBe(true);
  const other=await connect(await login());await until(()=>other.events.some(e=>e.type==='ready'));
  await gateway.shutdown();channels[1].onEvent({type:'transcript.final',utteranceId:'late',text:'late'});
  expect(other.events.some(e=>e.utteranceId?.endsWith(':late'))).toBe(false);
});
it('a short configured Redis lease ends provider work before a successor can overlap it',async()=>{
  await gateway.shutdown();await store.deleteTestNamespace();await store.close();
  store=await createRedisStore({url,parentNamespace:'flow-test-'+randomUUID(),environment:'voice'});
  await store.initializeLedger({parentDailyMicros:10000000,environmentDailyMicros:10000000,identityDailyRequests:100,identityDailyAudioMs:900000,globalVoiceLimit:1,voiceSessionMs:160});
  const original=stt.open;
  stt.open=vi.fn(async options=>{
    for(const prior of channels)expect(prior.signal.aborted).toBe(true);
    return original(options);
  });
  gateway=createHostedGateway({config,store,providers:{stt,tts}});
  await new Promise(resolve=>gateway.server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+gateway.server.address().port;
  const session=await login('one-voice'),first=await connect(session);
  await until(()=>first.events.some(event=>event.type==='ready'));
  const lease=Object.values(JSON.parse(await store.client.hGet(store.namespace+':ledger','leases')))[0];
  expect(channels[0].signal.aborted).toBe(false);
  // Deliberately admit the successor by Redis time, not by waiting for the
  // first socket to close; the old bug would keep that provider running.
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,lease.expires-Date.now())+8));
  expect(channels[0].signal.aborted).toBe(true);
  expect(first.events.find(event=>event.type==='ready').expiresAt).toBeLessThanOrEqual(lease.expires);
  const second=await connect(session);await until(()=>second.events.some(event=>event.type==='ready'));
  expect(stt.open).toHaveBeenCalledTimes(2);expect(channels[1].signal.aborted).toBe(false);
});
it('cancellation discards a provider chunk that resolves after its generation ended',async()=>{
  let resolve;let signal;
  tts.open=vi.fn(async(_text,options)=>{signal=options.signal;return {read:()=>new Promise(r=>resolve=r),close(){}};});
  const c=await connect(await login());await until(()=>c.events.some(e=>e.type==='ready'));
  c.socket.send(JSON.stringify({type:'tts.request',text:'hello',generation:1,captureEpoch:c.epoch}));
  await until(()=>Boolean(resolve));c.socket.send(JSON.stringify({type:'tts.cancel',generation:2,captureEpoch:c.epoch}));
  await until(()=>signal.aborted);resolve(new Uint8Array(3840));await new Promise(r=>setTimeout(r,10));
  expect(c.events.some(e=>e.kind===2)).toBe(false);
});
it('a speech work deadline emits a terminal event and closes a pending provider read',async()=>{
  let expire,signal;
  const nativeTimeout=globalThis.setTimeout;
  vi.spyOn(globalThis,'setTimeout').mockImplementation((callback,ms,...args)=>{
    // Reservation time is deducted from the 30-second work deadline.
    if(ms>=29000&&ms<=30000)expire=()=>callback(...args);
    return nativeTimeout(callback,ms,...args);
  });
  const close=vi.fn();
  tts.open=vi.fn(async(_text,options)=>{
    signal=options.signal;
    return {read:()=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true})),close};
  });
  const c=await connect(await login());await until(()=>c.events.some(e=>e.type==='ready'));
  c.socket.send(JSON.stringify({type:'tts.request',text:'deadline proof',generation:1,captureEpoch:c.epoch}));
  await until(()=>c.events.some(e=>e.type==='tts.start'));
  expect(expire).toBeTypeOf('function');expire();
  await until(()=>c.events.some(e=>e.type==='tts.error'));
  expect(signal.aborted).toBe(true);expect(close).toHaveBeenCalled();
  expect(c.events.filter(e=>e.type==='tts.error')).toHaveLength(1);
  expect(c.events.some(e=>e.type==='tts.done')).toBe(false);
});
it('isolates two identities, accepts framed PCM, and releases on stop',async()=>{
  const a=await connect(await login()),b=await connect(await login());
  await until(()=>channels.length===2&&a.events.some(e=>e.type==='ready')&&b.events.some(e=>e.type==='ready'));
  a.socket.send(encodeVoiceFrame({kind:1,epoch:a.epoch,generation:0,sequence:1,data:new ArrayBuffer(100)}));
  await until(()=>channels[0].sendAudio.mock.calls.length===1);
  expect(channels[1].sendAudio).not.toHaveBeenCalled();
  channels[0].onEvent({type:'transcript.final',text:'a only',utteranceId:'1'});
  await until(()=>a.events.some(e=>e.type==='transcript.final'));
  expect(b.events.some(e=>e.type==='transcript.final')).toBe(false);
  a.socket.send(JSON.stringify({type:'stop',captureEpoch:a.epoch}));
  await until(()=>channels[0].signal.aborted);expect(channels[1].signal.aborted).toBe(false);
});
it('plays a six-second stream through credit and pauses provider reads when stalled',async()=>{
  let reads=0;const close=vi.fn();
  tts.open=vi.fn(async()=>({read:async()=>++reads<=75?new Uint8Array(3840):null,close}));
  const c=await connect(await login());await until(()=>c.events.some(e=>e.type==='ready'));
  c.socket.send(JSON.stringify({type:'tts.request',text:'A bounded long response.',generation:1,captureEpoch:c.epoch}));
  await until(()=>c.events.filter(e=>e.kind===2).length===12);
  const stoppedReads=reads;await new Promise(r=>setTimeout(r,30));expect(reads).toBe(stoppedReads);expect(reads).toBeLessThan(15);
  let acked=0;
  for(let i=0;i<100&&!c.events.some(e=>e.type==='tts.done');i++){
    const frames=c.events.filter(e=>e.kind===2);const last=frames.at(-1)?.sequence;
    if(last&&last>acked){acked=last;c.socket.send(JSON.stringify({type:'tts.played',captureEpoch:c.epoch,generation:1,sequence:last}));}
    await new Promise(r=>setTimeout(r,5));
  }
  expect(c.events.filter(e=>e.kind===2)).toHaveLength(75);expect(c.events.some(e=>e.type==='tts.done')).toBe(true);expect(close).toHaveBeenCalled();
  expect(c.events.some(e=>e.type==='tts.error')).toBe(false);
});
it('kill cancels pending speech and prevents late provider transcripts',async()=>{
  const c=await connect(await login());await until(()=>channels.length===1&&c.events.some(e=>e.type==='ready'));
  await gateway.disable();await until(()=>c.socket.readyState===3);
  channels[0].onEvent({type:'transcript.final',utteranceId:'late',text:'late'});
  expect(c.events.some(e=>e.utteranceId?.endsWith(':late'))).toBe(false);
});
it('rejects unsafe cost bounds',()=>{
  for(const change of [{ttsCostMicros:8999},{sttSessionCostMicros:38499},{sttRateMicrosPerMinute:7600},{speechRateVerified:false}])expect(normalizeConfig({...config,...change}).speechConfigured).toBe(false);
});
it('bounds upgraded pre-hello sockets and releases their slots',async()=>{
  const session=await login();const open=[];
  for(let i=0;i<16;i++)open.push(await connect(session,false));
  await expect(connect(session,false)).rejects.toThrow();
  open[0].socket.close();await until(()=>open[0].socket.readyState===3);
  await expect(connect(session,false)).resolves.toBeDefined();
  expect(stt.open).not.toHaveBeenCalled();
});
