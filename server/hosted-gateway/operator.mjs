// Run manually against the durable, authenticated private store. No boot path calls this.
// initialize is a new authorization only, never a recovery command for lost usage.
import { createRedisStore } from './store.mjs';
const env=process.env;
const store=await createRedisStore({url:env.FLOW_REDIS_URL,parentNamespace:env.FLOW_BUDGET_NAMESPACE,environment:env.FLOW_ENVIRONMENT});
try{
 const [command,identity]=process.argv.slice(2);
 if(command==='initialize'){
  if(env.FLOW_AUTHORIZE_NEW_LEDGER!=='yes')throw new Error('New authorization requires FLOW_AUTHORIZE_NEW_LEDGER=yes; never initialize after data loss');
  await store.initializeLedger({parentDailyMicros:Number(env.FLOW_PARENT_DAILY_MICROS),environmentDailyMicros:Number(env.FLOW_ENVIRONMENT_DAILY_MICROS),identityDailyRequests:Number(env.FLOW_IDENTITY_DAILY_REQUESTS),identityDailyAudioMs:Number(env.FLOW_IDENTITY_DAILY_AUDIO_MS),globalVoiceLimit:Number(env.FLOW_GLOBAL_VOICE_LIMIT),voiceSessionMs:Number(env.FLOW_VOICE_SESSION_MS)});
 }else if(command==='environment'){
  await store.configureEnvironment(Number(env.FLOW_ENVIRONMENT_DAILY_MICROS));
 }else if(command==='invite'){
  // Deliberate one-time operator output. Do not capture this command in shared logs.
  process.stdout.write(`${await store.issueInvite(identity)}\n`);
 }else if(command==='disable')await store.disable();
 else throw new Error('Expected initialize, environment, invite IDENTITY, or disable');
}catch{process.stderr.write('Operator action failed; check command, explicit bounds, and store access.\n');process.exitCode=1;}
finally{await store.close();}
