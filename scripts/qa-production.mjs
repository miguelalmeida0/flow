import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { hashArtifact, verdict, gates } from './release-policy.mjs';
const tierA=process.argv.includes('--tier=a');
const prebuilt=process.argv.includes('--prebuilt');
const out='artifacts/production'; mkdirSync(out,{recursive:true});
const git=(...args)=>spawnSync('git',args,{encoding:'utf8'}).stdout.trim();
const read=(p)=>{try{return JSON.parse(readFileSync(p,'utf8'));}catch{return null;}};
const m={schemaVersion:1,gitSha:git('rev-parse','HEAD'),branch:git('branch','--show-current'),
  dirty:Boolean(git('status','--porcelain')),node:process.version,npm:spawnSync('npm',['--version'],{encoding:'utf8'}).stdout.trim(),
  dependencyLockHash:createHash('sha256').update(readFileSync('package-lock.json')).digest('hex'),
  buildTimestamp:null,artifactHash:null,tier:tierA?'A':'A+B+C',results:Object.fromEntries(gates.map(k=>[k,{status:'NOT RUN'}])),
  physicalMicrophone:{status:'NOT PERFORMED'},verdict:'BLOCKED'};
function save(){m.verdict=verdict(m);writeFileSync(out+'/release-manifest.json',JSON.stringify(m,null,2)+'\n');}
function run(name,command,args,env={}){
  console.log(`[production] ${name}: ${command} ${args.join(' ')}`);
  const startedAt=new Date().toISOString();
  const result=spawnSync(command,args,{encoding:'utf8',env:{...process.env,...env},maxBuffer:128*1024*1024});
  writeFileSync(`${out}/${name}.log`,(result.stdout||'')+(result.stderr||'')+(result.error?.message||''));
  m.results[name]={status:result.status===0?'PASS':'FAIL',exitCode:result.status,startedAt,finishedAt:new Date().toISOString(),log:`${out}/${name}.log`};
  console.log(`[production] ${name}: ${m.results[name].status}`);save();return result.status===0;
}
save();
if(!run('install','npm',['ci'])) process.exit(1);
if(!tierA){
  // npm ci replaces node_modules. Keep browser binaries outside that tree.
  process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.resolve('.playwright-browsers');
  run('browserInstall','npx',['playwright','install','chromium']);
}
run('lint','npm',['run','lint']);
run('unit','npm',['run','test:run','--','--reporter=default','--reporter=json',`--outputFile=${out}/unit.json`]);
run('server','npm',['run','test:server','--','--reporter=default','--reporter=json',`--outputFile=${out}/server.json`]);
run('releasePolicy','npm',['run','test:release-policy']);
run('python','python3',['-m','unittest','discover','-s','voice-companion','-p','test_*.py']);
const ci=prebuilt && process.env.FLOW_CI_MANIFEST && read(process.env.FLOW_CI_MANIFEST);
const prebuiltValid=ci && ci.gitSha===m.gitSha && ci.dependencyLockHash===m.dependencyLockHash && ci.dirty===false && ci.results?.build?.status==='PASS' && existsSync('dist') && ci.artifactHash===hashArtifact('dist');
if(prebuilt && !prebuiltValid){m.results.build={status:'FAIL',reason:'Missing or mismatched clean CI build evidence'};save();}
if((!prebuilt || prebuiltValid) && run('build','npm',['run',prebuilt?'build:verify':'build'],prebuilt?{FLOW_PREBUILT_ARTIFACT_HASH:ci.artifactHash}:{})) {
  m.buildTimestamp=prebuilt?ci.buildTimestamp:new Date().toISOString(); m.artifactHash=hashArtifact('dist');
  if(prebuilt)m.results.build.provenance='Verified exact prebuilt CI artifact; no local rebuild';save();
  run('design','npm',['run','qa:design-migration']);
  run('e2e','npm',['run','test:production-smoke'],tierA?{FLOW_SMOKE_WEATHER_FIXTURE:'1'}:{});
  if(!tierA)run('qaRelease','npm',['run','qa:release'],{FLOW_PREBUILT_ARTIFACT_HASH:m.artifactHash});
}
run('dependencyAudit','npm',['audit','--omit=dev','--json']);
if(!tierA){
  run('realModel','npm',['run','test:real-model','--','--maxWorkers=1','--reporter=default','--reporter=json',`--outputFile=${out}/real-model.json`]);
  run('voiceAutopilot','npm',['run','test:voice:autopilot'],{HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1',OLLAMA_NO_CLOUD:'1',FLOW_FRONTEND_MODE:'production',FLOW_VOICE_APP_URL:'http://localhost:5173/flow/'});
}
for(const key of ['unit','server','realModel']){
  const data=read(`${out}/${key==='realModel'?'real-model':key}.json`);
  if(data){m.results[key].counts={passed:data.numPassedTests,failed:data.numFailedTests,skipped:data.numPendingTests,todo:data.numTodoTests};
    if(data.numFailedTests||data.numPendingTests||data.numTodoTests||!data.numTotalTests)m.results[key].status='FAIL';}
}
const security=process.env.FLOW_SECURITY_REVIEW_FILE && read(process.env.FLOW_SECURITY_REVIEW_FILE);
if(security?.status==='PASS'&&security.gitSha===m.gitSha&&security.artifactHash===m.artifactHash&&security.reviewer&&security.evidence)m.results.securityReview=security;
const mic=process.env.FLOW_PHYSICAL_MIC_FILE && read(process.env.FLOW_PHYSICAL_MIC_FILE);
if(mic)m.physicalMicrophone=mic;
m.dirty=m.dirty||Boolean(git('status','--porcelain'));
if(m.artifactHash&&hashArtifact('dist')!==m.artifactHash){m.results.build.status='FAIL';m.results.build.reason='Artifact changed during verification';}
save();console.log(`${m.verdict}\nManifest: ${out}/release-manifest.json`);
const tierAKeys=['lint','unit','server','releasePolicy','python','build','design','e2e','dependencyAudit'];
process.exitCode=tierA?tierAKeys.every(k=>m.results[k].status==='PASS')?0:1:m.verdict==='READY TO DEPLOY'?0:1;
