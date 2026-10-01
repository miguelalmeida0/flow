import { chromium } from '@playwright/test';
import { mkdirSync,writeFileSync } from 'node:fs';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const context=await browser.newContext({permissions:[]});const page=await context.newPage();
const result={browser:browser.version(),url:'https://miguelalmeida0.github.io/flow/',expectedPolicy:'Public demo only; production-origin pairing disabled',console:[],pageErrors:[]};
page.on('console',m=>{if(m.type()==='error')result.console.push(m.text());});page.on('pageerror',e=>result.pageErrors.push(e.message));
try{
 await page.goto(result.url,{waitUntil:'domcontentloaded'});result.loadedUrl=page.url();result.title=await page.title();
 result.loopback=await page.evaluate(async()=>{
  const read=async(url,options)=>{try{const response=await fetch(url,{...options,signal:AbortSignal.timeout(5000)});return{status:response.status,body:await response.text()};}catch(error){return{blocked:true,error:error.message};}};
  const health=await read('http://127.0.0.1:8765/health');
  const capability=await read('http://127.0.0.1:8765/capability',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer release-origin-probe-invalid'},body:JSON.stringify({capability:'ai.status',args:{}})});
  const websocket=await new Promise(resolve=>{const ws=new WebSocket('ws://127.0.0.1:8766/voice');const timer=setTimeout(()=>{ws.close();resolve({timeout:true});},5000);ws.onopen=()=>{clearTimeout(timer);ws.close();resolve({opened:true});};ws.onerror=()=>{clearTimeout(timer);resolve({blocked:true});};});
  return{origin:location.origin,secureContext:isSecureContext,health,capability,websocket};
 });
}catch(error){result.error=error.message;process.exitCode=1;}
finally{await browser.close();mkdirSync('artifacts/origin-probe',{recursive:true});writeFileSync('artifacts/origin-probe/results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));}
