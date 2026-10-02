// All spend counters and the initialization marker live in one durable Redis hash.
// No expiry, refund, or boot-time initialization can recreate lost authorizations.
// A process restart can roll back acknowledged writes even if this hash survives.
// Require operator reconciliation whenever Redis has a different process identity.
export const REDIS_PROCESS_LUA = `
local serverInfo = redis.call('INFO', 'server')
local currentRunId = string.match(serverInfo, 'run_id:(%x+)')
if not currentRunId or string.len(currentRunId) ~= 40 then
  return {err='Redis process identity unavailable'}
end
`;

export const LEDGER_READY_LUA = `
local k=KEYS[1]
if redis.call('HGET',k,'version') ~= '1' then return {err='ledger unavailable'} end
if redis.call('HGET',k,'enabled') ~= '1' then return {err='inference disabled'} end
${REDIS_PROCESS_LUA}
if redis.call('HGET', k, 'redisRunId') ~= currentRunId then
  return {err='ledger reconciliation required'}
end
`;

export const RESERVE_LUA = `
${LEDGER_READY_LUA}
local clock=redis.call('TIME')
local now=tonumber(clock[1])*1000+math.floor(tonumber(clock[2])/1000)
local day=math.floor(now/86400000)
local env=ARGV[1]; local identity=ARGV[2]; local cost=tonumber(ARGV[3]); local requests=tonumber(ARGV[4]); local audio=tonumber(ARGV[5])
local p='spend:'..day; local e=p..':'..env; local r='requests:'..day..':'..identity; local a='audio:'..day..':'..identity
local function count(f) return tonumber(redis.call('HGET',k,f) or '0') end
local function limit(f) return tonumber(redis.call('HGET',k,f) or '0') end
if count(p)+cost>limit('parentDailyMicros') or count(e)+cost>limit('environmentDailyMicros:'..env) then return {err='quota spend'} end
if count(r)+requests>limit('identityDailyRequests') or count(a)+audio>limit('identityDailyAudioMs') then return {err='quota identity'} end
local leaseExpires=0
local leaseDuration=0
if ARGV[6]=='1' then
 local leases=redis.call('HGET',k,'leases'); local active={}; local n=0
 if leases then for id,lease in pairs(cjson.decode(leases)) do if lease.expires>now then active[id]=lease; n=n+1 end end end
 if active[identity] then return {err='voice identity busy'} end
 if n>=limit('globalVoiceLimit') then return {err='voice global busy'} end
 leaseDuration=limit('voiceSessionMs')
 leaseExpires=now+leaseDuration
 active[identity]={token=ARGV[7],expires=leaseExpires}
 redis.call('HSET',k,'leases',cjson.encode(active))
end
redis.call('HINCRBY',k,p,cost); redis.call('HINCRBY',k,e,cost); redis.call('HINCRBY',k,r,requests); redis.call('HINCRBY',k,a,audio)
return cjson.encode({expiresAt=leaseExpires,leaseDurationMs=leaseDuration})
`;

export const RELEASE_LUA = `
local raw=redis.call('HGET',KEYS[1],'leases'); if not raw then return 0 end
local leases=cjson.decode(raw); local lease=leases[ARGV[1]]
if lease and lease.token==ARGV[2] then leases[ARGV[1]]=nil; redis.call('HSET',KEYS[1],'leases',cjson.encode(leases)); return 1 end
return 0
`;

export function validateBounds(bounds) {
 const names=['parentDailyMicros','environmentDailyMicros','identityDailyRequests','identityDailyAudioMs','globalVoiceLimit','voiceSessionMs'];
 for (const key of names) if(!Number.isSafeInteger(bounds[key])||bounds[key]<=0||bounds[key]>1e12) throw new Error(`invalid ${key}`);
 if(bounds.environmentDailyMicros>bounds.parentDailyMicros||bounds.globalVoiceLimit>5||bounds.voiceSessionMs>300000) throw new Error('unsafe bounds');
 return bounds;
}
