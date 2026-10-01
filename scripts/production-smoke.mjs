import { chromium, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { hashArtifact } from './release-policy.mjs';
const out='artifacts/production-smoke';mkdirSync(out,{recursive:true});
const fixtureWeather=process.env.FLOW_SMOKE_WEATHER_FIXTURE==='1';
const root=path.resolve('dist'), artifactHash=hashArtifact(root);
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.json':'application/json'};
const server=createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  if(!url.pathname.startsWith('/flow/')){res.writeHead(404);res.end('Not found');return;}
  let relative;try{relative=decodeURIComponent(url.pathname.slice(6));}catch{res.writeHead(400);res.end();return;}
  let file=path.resolve(root,relative||'index.html');
  if(!file.startsWith(root+path.sep)){res.writeHead(404);res.end();return;}
  const fallback=!existsSync(file); if(fallback)file=path.join(root,'404.html');
  res.writeHead(fallback?404:200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
const report={artifactHash,status:'FAIL',browser:null,weather:fixtureWeather?'Deterministic external weather fixture':'Actual external weather network',viewports:[],consoleErrors:[],pageErrors:[],failedRequests:[],httpErrors:[],expectedSpa404:[],localRequests:[]};
try{
 const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
 browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});report.browser=browser.version();
 for(const publicOrigin of [false,true]) for(const [viewport,width,height,reducedMotion] of [['desktop',1440,1000,'no-preference'],['tablet',834,1112,'no-preference'],['mobile',390,844,'reduce']]){
  const name=`${publicOrigin?'public-origin-artifact':'loopback-artifact'}-${viewport}`;
  const appOrigin=publicOrigin?'https://miguelalmeida0.github.io':origin;
  const context=await browser.newContext({viewport:{width,height},reducedMotion,permissions:[]});
  if(fixtureWeather)await context.route('https://api.open-meteo.com/**',async route=>{
    const query=new URL(route.request().url()).searchParams;
    const start=Date.parse(`${query.get('start_date')}T12:00:00Z`),end=Date.parse(`${query.get('end_date')}T12:00:00Z`);
    assert(Number.isFinite(start)&&Number.isFinite(end)&&end>=start&&end-start<=90*86400000);
    const time=Array.from({length:Math.floor((end-start)/86400000)+1},(_,i)=>new Date(start+i*86400000).toISOString().slice(0,10));
    const daily={time,weather_code:time.map(()=>2),temperature_2m_max:time.map(()=>18),temperature_2m_min:time.map(()=>9),apparent_temperature_max:time.map(()=>17),precipitation_probability_max:time.map(()=>18),wind_speed_10m_max:time.map(()=>12),uv_index_max:time.map(()=>3),sunrise:time.map(d=>`${d}T06:18`),sunset:time.map(d=>`${d}T19:48`)};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({daily})});
  });
  if(publicOrigin)await context.route('https://miguelalmeida0.github.io/**',async route=>{
    // Exercise the candidate at its HTTPS origin without publishing anything.
    // All site responses come from the same hashed local production artifact.
    const url=new URL(route.request().url());
    if(!url.pathname.startsWith('/flow/')){await route.fulfill({status:404,body:'Not found'});return;}
    const file=path.resolve(root,decodeURIComponent(url.pathname.slice(6))||'index.html');
    if(!file.startsWith(root+path.sep)){await route.fulfill({status:404,body:'Not found'});return;}
    const fallback=!existsSync(file), target=fallback?path.join(root,'404.html'):file;
    await route.fulfill({status:fallback?404:200,contentType:mime[path.extname(target)]||'application/octet-stream',body:readFileSync(target)});
  });
  const page=await context.newPage();
  let directFallback=false;
  page.on('console',m=>{if(m.type()==='error'){
    if(directFallback&&m.text().includes('404'))report.expectedSpa404.push(m.text());else report.consoleErrors.push(m.text());
  }});
  page.on('pageerror',e=>report.pageErrors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)report.httpErrors.push({url:r.url(),status:r.status()});});
  page.on('requestfailed',r=>report.failedRequests.push({url:r.url(),error:r.failure()?.errorText}));
  page.on('request',r=>{if(/:(8765|8766|11434)\b/.test(r.url()))report.localRequests.push(r.url());});
  await page.goto(`${appOrigin}/flow/?releaseSmoke=1`);
  await expect(page.locator('[data-space-shell="home"]')).toBeVisible();
  assert((await page.title()).length>0); assert.equal(new URL(page.url()).searchParams.get('releaseSmoke'),'1');
  async function command(text){
    const field=page.getByRole('textbox',{name:'Tell Flow what to change'});
    if(!await field.isVisible()){
      try{await page.getByRole('button',{name:'Open Flow command',exact:true}).click({timeout:1500});}
      catch(error){if(!await field.isVisible())throw error;}
    }
    await expect(field).toBeVisible();
    await field.fill(text);await field.press('Enter');
  }
  for(const [text,route] of [['Open calendar','today'],['Open journal','journal'],['Open friends','people'],['Open memories','memories']]){
   await command(text);await expect(page.locator(`[data-space-shell="${route}"]`)).toBeVisible();assert(new URL(page.url()).pathname.startsWith('/flow/'));
  }
  await page.keyboard.press('Tab');assert(await page.evaluate(()=>document.activeElement!==document.body));
  await command('Open calendar');
  const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('flow.life.v3')));
  await command('Add Release smoke event at three for thirty minutes');
  await expect.poll(async()=>(await state()).document.calendar.events.filter(e=>e.title==='Release smoke event').length).toBe(1);
  await command('Undo');await expect.poll(async()=>(await state()).document.calendar.events.filter(e=>e.title==='Release smoke event').length).toBe(0);
  await command('Redo');await expect.poll(async()=>(await state()).document.calendar.events.filter(e=>e.title==='Release smoke event').length).toBe(1);
  const before=await state();directFallback=true;await page.reload();
  await expect(page.locator('[data-space-shell="today"]')).toBeVisible();
  assert.deepEqual((await state()).document,before.document);
  await page.goto(`${appOrigin}/flow/journal?releaseSmoke=1`);
  await expect(page.locator('[data-space-shell="journal"]')).toBeVisible();
  assert.equal(new URL(page.url()).searchParams.get('releaseSmoke'),'1');
  await page.screenshot({path:`${out}/${name}.png`});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  report.viewports.push({name,width,height,reducedMotion,origin:appOrigin,delivery:publicOrigin?'Local artifact fulfilled at public origin; not a deployment':'Local HTTP artifact server',status:'PASS'});await context.close();
 }
 assert.deepEqual(report.consoleErrors,[]);assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.failedRequests,[]);assert.deepEqual(report.localRequests,[]);
 assert.equal(hashArtifact(root),artifactHash);report.status='PASS';
}catch(error){report.error=error.stack;process.exitCode=1;}
finally{await browser?.close();await new Promise(resolve=>server.close(resolve));writeFileSync(`${out}/results.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}
