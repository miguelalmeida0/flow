import {expect,test,type Page} from "@playwright/test";
import {fillCommandField} from "./tide-helpers";

// Browser UX evidence with synthetic session HTTP responses. This does not
// qualify HTTPS microphone transport, provider audio or model quality.
async function setup(page:Page) {
  let authenticated=false;
  const requests:string[]=[];
  await page.addInitScript(()=>{window.__FLOW_RUNTIME__={mode:"hosted",inferenceEnabled:true,releaseId:"ux-fixture"};});
  await page.route("https://api.open-meteo.com/**",route=>route.fulfill({status:200,contentType:"application/json",body:'{"daily":{"time":[]}}'}));
  await page.route("**/api/session",route=>{
    const method=route.request().method();requests.push(method);
    if(method==="POST")authenticated=true;
    if(method==="DELETE")authenticated=false;
    return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({authenticated,...(authenticated?{csrf:"c".repeat(43),expiresAt:Date.now()+60000}:{}),inferenceEnabled:true,reasoningEnabled:true,speechEnabled:true,consentVersion:"ux-v1"})});
  });
  return requests;
}
async function command(page:Page,text:string){const field=await fillCommandField(page,text);await field.press("Enter");}
for(const width of [390,1440])test(`hosted consent, explicit start failure, logout and local persistence at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});const requests=await setup(page);
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  let mediaRequests=0;page.on("request",request=>{if(request.url().includes("/api/voice"))mediaRequests++;});
  await page.goto("/calendar");
  await page.getByRole("button",{name:"Enable cloud features"}).focus();await page.keyboard.press("Enter");
  const invite=page.getByLabel("Invitation code");await expect(invite).toBeFocused();
  await expect(page.getByRole("button",{name:"Enable cloud access"})).toBeDisabled();
  await invite.fill("single-use-fixture");await page.keyboard.press("Tab");await expect(page.getByLabel("I agree to cloud processing")).toBeFocused();await page.keyboard.press("Space");
  await page.keyboard.press("Tab");await expect(page.getByRole("button",{name:"Enable cloud access"})).toBeFocused();await page.keyboard.press("Enter");
  await expect(page.getByRole("button",{name:"Start voice"})).toBeEnabled();expect(requests.filter(x=>x==="POST")).toHaveLength(1);expect(mediaRequests).toBe(0);
  await expect(page.getByText(/AI-generated/)).toBeVisible();await expect(page.getByRole("link",{name:"Previous Flow version"})).toHaveAttribute("href","https://miguelalmeida0.github.io/flow/");
  await page.getByRole("button",{name:"Start voice"}).focus();await page.keyboard.press("Enter");
  // HTTP preview intentionally fails closed, leaving a visible recovery and usable composer.
  await expect(page.getByLabel("Global Flow command")).toContainText("Voice unavailable. Start again.");
  await command(page,"Remember I prefer quiet afternoons");
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem("flow.life.v3")!).document.personalMemoryFacts?.length)).toBe(1);
  await page.getByRole("button",{name:"Log out of cloud access"}).focus();await page.keyboard.press("Enter");
  await expect(page.getByLabel("Invitation code")).toBeVisible();await expect(page.getByRole("button",{name:"Enable cloud features"})).toBeVisible();
  await page.getByRole("button",{name:"Refresh cloud access"}).focus();await page.keyboard.press("Enter");await expect(page.getByLabel("Invitation code")).toBeVisible();
  await page.reload();await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem("flow.life.v3")!).document.personalMemoryFacts?.length)).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
  const icon=await page.request.get("/flow-icon.svg");expect(icon.status()).toBe(200);expect(icon.headers()["content-type"]).toContain("image/svg+xml");
  await page.waitForFunction(()=>{const e=document.querySelector('[data-flow-region="command"]');if(!e)return false;const s=getComputedStyle(e);return Number(s.opacity)===1&&(s.transform==="none"||Math.abs(new DOMMatrixReadOnly(s.transform).m42)<0.01);});
  await page.screenshot({path:`artifacts/hosted-release/20261002-source/u6-hosted-${width}.png`});
  await page.locator('[data-action-id="cloud.disclosure"]').focus();await page.keyboard.press("Enter");
  await expect(page.getByLabel("Invitation code")).toBeVisible();
  await page.screenshot({path:`artifacts/hosted-release/20261002-source/u6-consent-${width}.png`});
});

test("expanded command and time controls stay separated and hit-testable across the footer breakpoint",async({page})=>{
  await setup(page);await page.goto("/");await command(page,"Home");
  for(const width of [390,834,1024,1279,1280,1366,1440,1545,1559,1560,1577,1578,1672]) {
    await page.setViewportSize({width,height:900});await page.keyboard.press("Control+k");await expect(page.getByRole("textbox",{name:"Tell Flow what to change"})).toBeVisible();
    // The Dock enters at y=12 via Motion. Measure the settled footer geometry,
    // after that transform reaches its declared y=0 target.
    await page.waitForFunction(()=>{const element=document.querySelector('[data-flow-region="command"]');if(!element)return false;const transform=getComputedStyle(element).transform;return transform==="none"||Math.abs(new DOMMatrixReadOnly(transform).m42)<0.01;});
    const geometry=await page.evaluate(()=>{
      const command=document.querySelector('[data-flow-region="command"]')!.getBoundingClientRect();const time=document.querySelector('[data-flow-region="time"]')!.getBoundingClientRect();
      const sameRow=command.top<time.bottom&&command.bottom>time.top;
      const controls=[...document.querySelectorAll('[aria-label="Time scope"] button')];
      return {gap:sameRow?time.left-command.right:time.top-command.bottom,overflow:document.documentElement.scrollWidth>innerWidth,hit:controls.every(button=>{const r=button.getBoundingClientRect();return button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})};
    });
    expect(geometry.gap,`${width}px gap`).toBeGreaterThanOrEqual(15.5);expect(geometry.overflow).toBe(false);expect(geometry.hit,`${width}px time control hit targets`).toBe(true);
  }
});
