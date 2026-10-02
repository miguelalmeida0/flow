import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createRedisStore } from './store.mjs';
const url = process.env.FLOW_TEST_REDIS_URL;
if (!url) throw new Error('FLOW_TEST_REDIS_URL is required for real Redis quota tests');
const bounds = { parentDailyMicros: 100, environmentDailyMicros: 80, identityDailyRequests: 100, identityDailyAudioMs: 900000, globalVoiceLimit: 5, voiceSessionMs: 300000 };
let stores, ns;
beforeEach(async () => { ns = `flow-test-${randomUUID()}`; stores = await Promise.all(['production','staging'].map(environment => createRedisStore({ url, parentNamespace: ns, environment }))); await stores[0].initializeLedger(bounds); await stores[1].configureEnvironment(bounds.environmentDailyMicros); });
afterEach(async () => { await stores[0].deleteTestNamespace(); await Promise.all(stores.map(s => s.close())); });
const reserve = (store, identity='a', extra={}) => store.reserve({ identity, costMicros: 10, requests: 1, audioMs: 0, ...extra });
describe('durable atomic quota ledger', () => {
 it('shares a parent cap across concurrent environments', async () => { const results = await Promise.allSettled(Array.from({length:40},(_,i)=>reserve(stores[i%2],String(i)))); expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(10); });
 it('enforces environment cap and retains cost after release', async () => { const results = await Promise.allSettled(Array.from({length:20},()=>reserve(stores[0]))); expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(8); for(const r of results) if(r.status==='fulfilled') await stores[0].release(r.value); await expect(reserve(stores[0])).rejects.toThrow('quota'); });
 it('survives reconnect without resetting reservations', async () => { await reserve(stores[0], 'a', {costMicros:80}); await stores[0].close(); stores[0]=await createRedisStore({url,parentNamespace:ns,environment:'production'}); await expect(reserve(stores[0])).rejects.toThrow('quota'); });
 it('fails closed after marker loss and never silently initializes', async () => { await stores[0].client.del(`${ns}:ledger`); await expect(reserve(stores[0])).rejects.toThrow('ledger'); });
 it('limits voice leases globally and by identity, releases only lease', async () => { const a = await reserve(stores[0],'a',{voice:true,costMicros:1}); await expect(reserve(stores[1],'a',{voice:true,costMicros:1})).rejects.toThrow('voice'); for(let i=0;i<4;i++) await reserve(stores[i%2],`v${i}`,{voice:true,costMicros:1}); await expect(reserve(stores[1],'six',{voice:true,costMicros:1})).rejects.toThrow('voice'); await stores[0].release(a); await expect(reserve(stores[1],'six',{voice:true,costMicros:1})).resolves.toBeDefined(); });
 it('kill switch is shared and durable', async () => { await stores[0].disable(); await expect(reserve(stores[1])).rejects.toThrow('disabled'); });
 it('applies identity request and audio limits across environments',async()=>{await reserve(stores[0],'a',{costMicros:1,requests:100,audioMs:900000});await expect(reserve(stores[1],'a',{costMicros:1,requests:1})).rejects.toThrow('quota identity');await expect(reserve(stores[1],'a',{costMicros:1,requests:0,audioMs:1})).rejects.toThrow('quota identity');});
 it('will not overwrite a ledger or authorize an unknown environment',async()=>{await expect(stores[0].initializeLedger(bounds)).rejects.toThrow('already initialized');const other=await createRedisStore({url,parentNamespace:ns,environment:'unapproved'});try{await expect(reserve(other)).rejects.toThrow('quota');}finally{await other.close();}});
 it('credential replacement leaves identity usage unchanged',async()=>{await reserve(stores[0],'a',{requests:100,costMicros:1});await stores[0].issueInvite('a');await stores[0].issueInvite('a');await expect(reserve(stores[0],'a')).rejects.toThrow('quota identity');});
 it('rejects reservations and readiness after Redis process identity changes', async () => {
  await reserve(stores[0]);
  const ledgerKey = `${ns}:ledger`;
  await stores[0].client.hSet(ledgerKey, 'redisRunId', 'previous-redis-process');
  const before = await stores[0].client.hGetAll(ledgerKey);

  await expect(stores[0].checkReady()).rejects.toThrow('ledger reconciliation required');
  await expect(reserve(stores[1])).rejects.toThrow('ledger reconciliation required');
  expect(await stores[0].client.hGetAll(ledgerKey)).toEqual(before);
 });
 it('does not adopt an existing ledger without a process identity', async () => {
  await stores[0].client.hDel(`${ns}:ledger`, 'redisRunId');
  await expect(stores[0].checkReady()).rejects.toThrow('ledger reconciliation required');
  await expect(reserve(stores[0])).rejects.toThrow('ledger reconciliation required');
  await expect(stores[0].initializeLedger(bounds)).rejects.toThrow('already initialized');
 });
});
