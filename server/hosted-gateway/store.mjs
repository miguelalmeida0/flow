import { createClient } from 'redis';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { LEDGER_READY_LUA, REDIS_PROCESS_LUA, RESERVE_LUA, RELEASE_LUA, validateBounds } from './quotas.mjs';

export const hash = value => createHash('sha256').update(value).digest('hex');
const credential = () => randomBytes(32).toString('base64url');
const validName = value => typeof value==='string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);

/** parentNamespace identifies ONE spending authorization across every environment. */
export async function createRedisStore({url,parentNamespace,environment}) {
 if(!url||!validName(parentNamespace)||!validName(environment)) throw new Error('invalid store configuration');
 const client=createClient({url,disableOfflineQueue:true,socket:{connectTimeout:1500,reconnectStrategy:false}});
 client.on('error',()=>{}); // Never log credentials, provider payloads, or Redis URLs.
 await client.connect();
 // Auth is isolated per environment. Spending/voice leases stay in the parent
 // ledger; identically named tester identities conservatively share their caps.
 const key=`${parentNamespace}:ledger`, prefix=`${parentNamespace}:auth:${environment}:`;
 const evalLua=(script,keys,args=[])=>client.eval(script,{keys,arguments:args.map(String)});
 async function checkReady() {
  if (!client.isReady) throw new Error('store unavailable');
  await evalLua(`${LEDGER_READY_LUA}\nreturn 'ok'`, [key]);
 }
 return {
  client, namespace:parentNamespace, environment,
  // Explicit operator action only. An existing ledger is never replaced or reset.
  async initializeLedger(bounds){
   validateBounds(bounds);
   const args=Object.entries({...bounds,[`environmentDailyMicros:${environment}`]:bounds.environmentDailyMicros,version:'1',enabled:'1'}).flat();
   await evalLua(`
     if redis.call('EXISTS', KEYS[1]) == 1 then
       return {err='ledger already initialized'}
     end
     ${REDIS_PROCESS_LUA}
     redis.call('HSET', KEYS[1], unpack(ARGV))
     redis.call('HSET', KEYS[1], 'redisRunId', currentRunId)
     return 1
   `, [key], args);
  },
  async configureEnvironment(limit){if(!Number.isSafeInteger(limit)||limit<=0)throw new Error('invalid sublimit');await evalLua(`if redis.call('HGET',KEYS[1],'version')~='1' then return {err='ledger unavailable'} end if tonumber(ARGV[2])>tonumber(redis.call('HGET',KEYS[1],'parentDailyMicros')) then return {err='invalid sublimit'} end redis.call('HSET',KEYS[1],ARGV[1],ARGV[2]); return 1`,[key],[`environmentDailyMicros:${environment}`,limit]);},
  checkReady,
  async disable(){await evalLua(`if redis.call('HGET',KEYS[1],'version')~='1' then return {err='ledger unavailable'} end redis.call('HSET',KEYS[1],'enabled','0'); return 1`,[key]);},
  async reserve({identity,costMicros,requests=0,audioMs=0,voice=false}){
   if(!validName(identity)||![costMicros,requests,audioMs].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=1e12)||costMicros<=0)throw new Error('invalid reservation');
   const token=randomUUID();
   const timing=JSON.parse(await evalLua(RESERVE_LUA,[key],[environment,identity,costMicros,requests,audioMs,voice?'1':'0',token]));
   return {identity,token,voice,...(voice?{expiresAt:timing.expiresAt,leaseDurationMs:timing.leaseDurationMs}:{})};
  },
  async release(reservation){if(reservation.voice)await evalLua(RELEASE_LUA,[key],[reservation.identity,reservation.token]);},
  async issueInvite(identity,ttlMs=86400000){
   if(!validName(identity)||!Number.isSafeInteger(ttlMs)||ttlMs<1||ttlMs>604800000)throw new Error('invalid invite');
   const invite=credential();
   await evalLua(`local generation=redis.call('INCR',KEYS[1]); redis.call('SET',KEYS[2],cjson.encode({identity=ARGV[1],generation=generation}),'PX',ARGV[2]);return 1`,[`${prefix}identity:${identity}`,`${prefix}invite:${hash(invite)}`],[identity,ttlMs]);
   return invite;
  },
  async rateLimit(clientId){
   const id=hash(clientId);
   await evalLua(`local n=redis.call('INCR',KEYS[1]);if n==1 then redis.call('PEXPIRE',KEYS[1],60000) end local g=redis.call('INCR',KEYS[2]);if g==1 then redis.call('PEXPIRE',KEYS[2],60000) end if n>10 or g>100 then return {err='rate limit'} end return 1`,[`${prefix}rate:${id}`,`${prefix}rate:global`]);
  },
  async redeem(invite,ttlMs,consentVersion){
   if(typeof consentVersion!=='string'||!consentVersion||consentVersion.length>100)throw new Error('invalid consent version');
   const token=credential(),csrf=credential(),sessionHash=hash(token);
   const raw=await evalLua(`local raw=redis.call('GET',KEYS[1]);if not raw then return {err='invalid invite'} end local invite=cjson.decode(raw);local generation=redis.call('GET',ARGV[1]..invite.identity);if tostring(invite.generation)~=generation then return {err='invalid invite'} end local t=redis.call('TIME');local expires=tonumber(t[1])*1000+math.floor(tonumber(t[2])/1000)+tonumber(ARGV[2]);local session={identity=invite.identity,generation=invite.generation,expiresAt=expires,csrf=ARGV[3],sessionHash=ARGV[4],consentVersion=ARGV[5]};redis.call('DEL',KEYS[1]);redis.call('SET',KEYS[2],cjson.encode(session),'PX',ARGV[2]);return cjson.encode(session)`,[`${prefix}invite:${hash(invite)}`,`${prefix}session:${sessionHash}`],[`${prefix}identity:`,ttlMs,csrf,sessionHash,consentVersion]);
   return {token,session:JSON.parse(raw)};
  },
  async getSession(sessionHash,consentVersion){
   const raw=await evalLua(`local raw=redis.call('GET',KEYS[1]);if not raw then return {err='invalid session'} end local s=cjson.decode(raw);local t=redis.call('TIME');local now=tonumber(t[1])*1000+math.floor(tonumber(t[2])/1000);if s.expiresAt<=now or tostring(s.generation)~=redis.call('GET',ARGV[1]..s.identity) then return {err='invalid session'} end return raw`,[`${prefix}session:${sessionHash}`],[`${prefix}identity:`]);
   const session=JSON.parse(raw);
   if(consentVersion!==undefined&&session.consentVersion!==consentVersion)throw new Error('invalid session consent');
   return session;
  },
  async revokeSession(sessionHash){await client.del(`${prefix}session:${sessionHash}`);},
  async close(){if(client.isOpen)await client.close();},
  async deleteTestNamespace(){
   if(!/^flow-test-[a-f0-9-]+$/.test(parentNamespace))throw new Error('test cleanup only');
   // Reconnect only for explicitly scoped test cleanup after store-loss tests.
   if(!client.isOpen)await client.connect();
   for await (const keys of client.scanIterator({MATCH:`${parentNamespace}:*`,COUNT:100})) if(keys.length)await client.del(keys);
  },
 };
}
