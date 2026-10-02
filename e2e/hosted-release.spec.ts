import { expect, test, type Page } from "@playwright/test";
import { fillCommandField } from "./tide-helpers";

async function observeMicrophone(page: Page) {
  await page.addInitScript(()=>{
    const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    const observation={calls:0,tracks:[] as MediaStreamTrack[]};
    Object.assign(window,{__hostedMicrophone:observation});
    navigator.mediaDevices.getUserMedia=async constraints=>{observation.calls++;const stream=await original(constraints);observation.tracks.push(...stream.getTracks());return stream;};
  });
}
const control=(page:Page,body:Record<string,unknown>)=>page.request.post("/__fixture/control",{data:body});
const state=async(page:Page)=>(await page.request.get("/__fixture/state")).json();
const snapshot=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem("flow.life.v3")!));
async function command(page:Page,text:string){const field=await fillCommandField(page,text);await field.press("Enter");}
test.beforeEach(async({page})=>{await page.route("https://api.open-meteo.com/**",route=>route.fulfill({status:200,contentType:"application/json",body:'{"daily":{"time":[]}}'}));});
const microphone = (page:Page)=>page.evaluate(()=>{
  const observation=(window as Window & {__hostedMicrophone:{calls:number;tracks:MediaStreamTrack[]}}).__hostedMicrophone;
  return {calls:observation.calls,states:observation.tracks.map(track=>track.readyState)};
});

test("cloud proposals require confirmation, cancel cleanly and reject stale delayed responses",async({page})=>{
  await page.goto("/calendar");await grantAccess(page);await control(page,{action:"model",mode:"proposal"});
  await command(page,'Write a note saying "Reviewed note".');
  await expect(page.getByRole("button",{name:"Confirm",exact:true})).toBeVisible();
  expect((await snapshot(page)).document.studio.journalEntries).toHaveLength(0);
  await page.getByRole("button",{name:"Cancel",exact:true}).click();
  expect((await snapshot(page)).past).toHaveLength(0);
  await command(page,'Write a note saying "Reviewed note".');
  await page.getByRole("button",{name:"Confirm",exact:true}).click();
  await expect.poll(async()=>(await snapshot(page)).document.studio.journalEntries.length).toBe(1);
  expect((await snapshot(page)).past).toHaveLength(1);
  await command(page,'Write a note saying "Stale preview".');
  await expect(page.getByRole("button",{name:"Confirm",exact:true})).toBeVisible();
  await command(page,"Remember I prefer blue pens");
  await expect.poll(async()=>(await snapshot(page)).document.personalMemoryFacts?.length).toBe(1);
  const intervened=await snapshot(page);
  await expect(page.getByRole("button",{name:"Confirm",exact:true})).toHaveCount(0);
  await command(page,"Confirm");
  expect(await snapshot(page)).toEqual(intervened);
  await control(page,{action:"model",mode:"delayed"});const before=(await state(page)).modelRequests;
  await command(page,'Write a note saying "Another reviewed note".');
  await expect.poll(async()=>(await state(page)).modelRequests).toBeGreaterThan(before);
  await command(page,"Remember I prefer quiet mornings");
  await control(page,{action:"resolve-model"});
  await expect.poll(async()=>(await snapshot(page)).document.personalMemoryFacts?.length).toBe(2);
  expect((await snapshot(page)).document.studio.journalEntries).toHaveLength(1);
  await expect(page.getByRole("button",{name:"Confirm",exact:true})).toHaveCount(0);
  await control(page,{action:"model",mode:"proposal"});
});

test("visibility boundary and server expiry end actual microphone tracks",async({page})=>{
  await observeMicrophone(page);await page.goto("/calendar");await grantAccess(page);
  await page.getByRole("button",{name:"Start voice"}).click();await expect.poll(()=>microphone(page)).toEqual({calls:1,states:["live"]});
  // Chromium headless has no user tab strip. Exercise its visibility callback
  // with a declared hidden-state fixture while retaining the real microphone.
  await page.evaluate(()=>{Object.defineProperty(document,"visibilityState",{configurable:true,value:"hidden"});document.dispatchEvent(new Event("visibilitychange"));});
  await expect.poll(()=>microphone(page)).toEqual({calls:1,states:["ended"]});
  await page.evaluate(()=>{delete (document as unknown as {visibilityState?:string}).visibilityState;document.dispatchEvent(new Event("visibilitychange"));});
  expect((await microphone(page)).calls).toBe(1);
  await page.getByRole("button",{name:"Start voice"}).click();await expect.poll(()=>microphone(page)).toEqual({calls:2,states:["ended","live"]});
  await control(page,{action:"expire"});
  await expect.poll(()=>microphone(page)).toEqual({calls:2,states:["ended","ended"]});
  await expect(page.getByRole("button",{name:"Stop voice"})).toHaveCount(0);
});

test("denied microphone, provider outage and explicit reconnect preserve duplicate protection",async({page,context})=>{
  await observeMicrophone(page);await page.goto("/calendar");await grantAccess(page);
  const cdp=await context.newCDPSession(page);
  const {targetInfo:{browserContextId}}=await cdp.send("Target.getTargetInfo");
  await cdp.send("Browser.setPermission",{browserContextId,permission:{name:"microphone"},setting:"denied",origin:"https://127.0.0.1:5443"});
  expect(await page.evaluate(async()=>(await navigator.permissions.query({name:"microphone" as PermissionName})).state)).toBe("denied");
  await page.getByRole("button",{name:"Start voice"}).click();
  await expect(page.getByRole("button",{name:"Start voice"})).toBeEnabled();
  expect((await microphone(page)).states).toEqual([]);
  await cdp.send("Browser.setPermission",{browserContextId,permission:{name:"microphone"},setting:"granted",origin:"https://127.0.0.1:5443"});
  const channel=(await state(page)).opens;await page.getByRole("button",{name:"Start voice"}).click();
  await expect.poll(async()=>(await microphone(page)).states).toEqual(["live"]);
  await expect.poll(async()=>(await snapshot(page)).document.personalMemoryFacts?.length).toBe(1);
  await control(page,{action:"transcript",channel,id:"duplicate-test",text:"Remember I prefer warm tea",duplicate:true});
  await expect.poll(async()=>(await snapshot(page)).document.personalMemoryFacts?.length).toBe(2);
  expect((await snapshot(page)).past).toHaveLength(2);
  await control(page,{action:"outage",channel});await expect.poll(async()=>(await microphone(page)).states).toEqual(["ended"]);
  const opens=(await state(page)).opens;await page.waitForTimeout(300);expect((await state(page)).opens).toBe(opens);
  await control(page,{action:"transcript",channel,id:"late",text:"Remember I prefer unsafe late output"});
  await expect.poll(async()=>(await state(page)).channels[channel].closed).toBe(true);
  await page.waitForTimeout(300); // Deliver the deliberately late callback on the closed channel.
  expect((await snapshot(page)).document.personalMemoryFacts).toHaveLength(2);
  // Reconnect carries silent native PCM. A newly scripted utterance with a new
  // ID would represent a new request, not a duplicate delivery of the old one.
  await control(page,{action:"suppress-next-initial"});
  await page.getByRole("button",{name:"Start voice"}).click();await expect.poll(async()=>(await microphone(page)).states).toEqual(["ended","live"]);
  await expect.poll(async()=>(await state(page)).channels[opens]?.frames??0).toBeGreaterThan(4);
  await control(page,{action:"transcript",channel,id:"late-after-reconnect",text:"Remember I prefer unsafe late output"});
  await page.waitForTimeout(300); // Reconnected channel is actively delivering PCM.
  expect((await snapshot(page)).past).toHaveLength(2);
  await control(page,{action:"transcript",channel:opens,id:"new-intent-after-reconnect",text:"Remember I prefer quiet afternoons",duplicate:true});
  await expect.poll(async()=>(await snapshot(page)).past.length).toBe(3);
  await page.waitForTimeout(300);
  expect((await snapshot(page)).past).toHaveLength(3);
  await page.getByRole("button",{name:"Stop voice"}).click();await cdp.detach();
});

test("two authenticated identities keep transcripts and durable documents isolated",async({page,browser})=>{
  const otherContext=await browser.newContext({baseURL:"https://127.0.0.1:5443",ignoreHTTPSErrors:true,permissions:["microphone"]});const other=await otherContext.newPage();
  try {
    await observeMicrophone(page);await observeMicrophone(other);
    await page.goto("/calendar");await grantAccess(page);await other.goto("https://127.0.0.1:5443/calendar");await grantAccess(other);
    const channel=(await state(page)).opens;await page.getByRole("button",{name:"Start voice"}).click();await expect.poll(async()=>(await state(page)).opens).toBe(channel+1);
    await other.getByRole("button",{name:"Start voice"}).click();await expect.poll(async()=>(await state(page)).opens).toBe(channel+2);
    await expect.poll(async()=>(await snapshot(page)).document.personalMemoryFacts?.length).toBe(1);
    await expect.poll(async()=>(await snapshot(other)).document.personalMemoryFacts?.length).toBe(1);
    const otherBefore=await snapshot(other);
    await control(page,{action:"transcript",channel,id:"only-first",text:"Remember I prefer blue notebooks"});
    await expect.poll(async()=>(await snapshot(page)).document.personalMemoryFacts?.length).toBe(2);
    await page.getByRole("button",{name:"Stop voice"}).click();
    await expect.poll(async()=>(await microphone(page)).states).toEqual(["ended"]);
    expect((await microphone(other)).states).toEqual(["live"]);
    const frames=(await state(page)).channels[channel+1].frames;
    await expect.poll(async()=>(await state(page)).channels[channel+1].frames).toBeGreaterThan(frames+4);
    expect(await snapshot(other)).toEqual(otherBefore);
  } finally { await otherContext.close(); }
});
async function grantAccess(page:Page){
  const {invite}=await (await page.request.get("/__fixture/invite")).json();
  await page.getByRole("button",{name:"Enable cloud features"}).click();
  await page.getByLabel("Invitation code").fill(invite);
  await page.getByLabel("I agree to cloud processing").check();
  await page.getByRole("button",{name:"Enable cloud access"}).click();
  await expect(page.getByRole("button",{name:"Start voice"})).toBeEnabled();
}

test("HTTPS invitation, explicit native microphone capture, durable transcript and Stop", async ({ page }) => {
  const errors: string[] = [], forbidden: string[] = [];
  page.on("pageerror",error=>errors.push(error.message));
  page.on("request",request=>{if(/localhost|127\.0\.0\.1:(?:8787|8765|11434)/.test(request.url()))forbidden.push(request.url());});
  await page.route("https://api.open-meteo.com/**",route=>route.fulfill({status:200,contentType:"application/json",body:'{"daily":{"time":[]}}'}));
  await observeMicrophone(page);await page.goto("/calendar");
  expect(await page.evaluate(()=>isSecureContext)).toBe(true);
  await expect(page.getByRole("button",{name:"Enable cloud features"})).toBeEnabled();
  const before=await (await page.request.get("/__fixture/state")).json();
  await grantAccess(page);
  expect((await (await page.request.get("/__fixture/state")).json()).pcmFrames).toBe(before.pcmFrames);
  expect(await microphone(page)).toEqual({calls:0,states:[]});
  await page.getByRole("button",{name:"Start voice"}).focus();await page.keyboard.press("Enter");
  await expect(page.getByRole("button",{name:"Stop voice"})).toBeEnabled();
  await expect.poll(async()=> (await (await page.request.get("/__fixture/state")).json()).nonzeroSamples).toBeGreaterThan(0);
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem("flow.life.v3")!).document.personalMemoryFacts?.length)).toBe(1);
  const snapshot=await page.evaluate(()=>JSON.parse(localStorage.getItem("flow.life.v3")!));
  expect(snapshot.past).toHaveLength(1);
  await page.getByRole("button",{name:"Stop voice"}).focus();await page.keyboard.press("Enter");
  await expect(page.getByRole("button",{name:"Start voice"})).toBeEnabled();
  await expect.poll(async()=> (await (await page.request.get("/__fixture/state")).json()).closed).toBe(before.closed+1);
  await expect.poll(()=>microphone(page)).toEqual({calls:1,states:["ended"]});
  const stopped=await (await page.request.get("/__fixture/state")).json();
  await page.waitForTimeout(300);
  expect((await (await page.request.get("/__fixture/state")).json()).pcmFrames).toBe(stopped.pcmFrames);
  await page.reload();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem("flow.life.v3")!).document.personalMemoryFacts)).toEqual(snapshot.document.personalMemoryFacts);
  expect(errors).toEqual([]);expect(forbidden).toEqual([]);
  await test.info().attach("transport-evidence",{body:JSON.stringify({kind:"native synthetic microphone + actual HTTPS/WSS gateway + real Redis + synthetic provider adapters",...stopped,realProviderEvidence:false}),contentType:"application/json"});
});

test("failed logout in a sibling tab ends actual capture and cannot silently restore authority",async({page,context})=>{
  await observeMicrophone(page);await page.goto("/calendar");await grantAccess(page);
  await page.getByRole("button",{name:"Start voice"}).click();
  await expect.poll(()=>microphone(page)).toEqual({calls:1,states:["live"]});
  const second=await context.newPage();await second.goto("/calendar");
  await expect(second.getByRole("button",{name:"Start voice"})).toBeEnabled();
  await second.locator('[data-action-id="cloud.disclosure"]').click();
  await second.route("**/api/session",route=>route.request().method()==="DELETE"?route.fulfill({status:503,body:'{}'}):route.continue());
  await second.getByRole("button",{name:"Log out of cloud access"}).click();
  await expect.poll(()=>microphone(page)).toEqual({calls:1,states:["ended"]});
  await expect(page.getByRole("button",{name:"Enable cloud features"})).toBeVisible();
  await page.reload();await expect(page.getByRole("button",{name:"Enable cloud features"})).toBeVisible();
  const later=await context.newPage();await later.goto("/calendar");await expect(later.getByRole("button",{name:"Enable cloud features"})).toBeVisible();
});

test("sibling logout aborts pending typed model work with voice inactive",async({page,context})=>{
  await observeMicrophone(page);await page.goto("/calendar");await grantAccess(page);await control(page,{action:"model",mode:"delayed"});
  const before=await state(page);await command(page,'Write a note saying "Pending note".');
  await expect.poll(async()=>(await state(page)).modelRequests).toBeGreaterThan(before.modelRequests);
  expect(await microphone(page)).toEqual({calls:0,states:[]});
  const second=await context.newPage();await second.goto("/calendar");await expect(second.getByRole("button",{name:"Start voice"})).toBeEnabled();
  await second.locator('[data-action-id="cloud.disclosure"]').click();
  await second.route("**/api/session",route=>route.request().method()==="DELETE"?route.fulfill({status:503,body:'{}'}):route.continue());
  await second.getByRole("button",{name:"Log out of cloud access"}).click();
  await expect.poll(async()=>(await state(page)).modelAborted).toBeGreaterThan(before.modelAborted);
  await control(page,{action:"resolve-model"});
  await expect(page.getByRole("button",{name:"Confirm",exact:true})).toHaveCount(0);
  expect((await snapshot(page)).document.studio.journalEntries).toHaveLength(0);expect((await snapshot(page)).past).toHaveLength(0);
  await control(page,{action:"model",mode:"proposal"});
});
