import { resolve } from 'node:path';
const positive=(value,max)=>Number.isSafeInteger(value)&&value>0&&value<=max;
export function normalizeConfig(input={}){
 const config={distDir:resolve('dist'),releaseId:'unreleased',sessionTtlMs:86400000,requestDeadlineMs:15000,maxInputBytes:65536,...input};
 let validOrigin=false;try{const url=new URL(config.origin);validOrigin=url.protocol==='https:'&&url.origin===config.origin;}catch{/* invalid config disables paid endpoints */}
 config.accessConfigured=config.inferenceEnabled===true&&validOrigin&&typeof config.consentVersion==='string'&&config.consentVersion.length>0&&config.consentVersion.length<=100&&positive(config.sessionTtlMs,604800000);
 config.inferenceConfigured=config.accessConfigured&&positive(config.requestDeadlineMs,30000)&&positive(config.maxOutputTokens,4096)&&positive(config.maxInputBytes,65536)&&positive(config.interpretCostMicros,1e12);
 // Operator must verify their opt-out/account rate. Floor uses the regular,
 // not promotional, Nova-3 English rate; six minutes cover a five-minute lease.
 config.speechConfigured=config.accessConfigured&&config.speechRateVerified===true&&positive(config.sttRateMicrosPerMinute,1e9)&&config.sttRateMicrosPerMinute>=7700&&positive(config.sttSessionCostMicros,1e12)&&config.sttSessionCostMicros>=config.sttRateMicrosPerMinute*6&&positive(config.ttsCostMicros,1e12)&&config.ttsCostMicros>=9000;
 config.distDir=resolve(config.distDir);
 return Object.freeze(config);
}
export function readConfig(env=process.env){
 return normalizeConfig({distDir:env.FLOW_DIST_DIR||resolve('dist'),releaseId:env.FLOW_RELEASE_ID||'unreleased',origin:env.FLOW_PUBLIC_ORIGIN,
  inferenceEnabled:env.FLOW_INFERENCE_ENABLED==='true',consentVersion:env.FLOW_CONSENT_VERSION,
  sessionTtlMs:Number(env.FLOW_SESSION_TTL_MS||86400000),requestDeadlineMs:Number(env.FLOW_REQUEST_DEADLINE_MS||15000),
  maxInputTokens:Number(env.FLOW_MAX_INPUT_TOKENS),maxInputBytes:Number(env.FLOW_MAX_INPUT_BYTES||65536),maxOutputTokens:Number(env.FLOW_MAX_OUTPUT_TOKENS),interpretCostMicros:Number(env.FLOW_INTERPRET_COST_MICROS),
  redisUrl:env.FLOW_REDIS_URL,parentNamespace:env.FLOW_BUDGET_NAMESPACE,environment:env.FLOW_ENVIRONMENT,port:Number(env.PORT||3000),
  speechRateVerified:env.FLOW_SPEECH_RATE_VERIFIED==='true',sttRateMicrosPerMinute:Number(env.FLOW_STT_RATE_MICROS_PER_MINUTE),sttSessionCostMicros:Number(env.FLOW_STT_SESSION_COST_MICROS),ttsCostMicros:Number(env.FLOW_TTS_COST_MICROS),
 });
}
