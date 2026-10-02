import {afterEach,expect,it,vi} from "vitest";
afterEach(()=>{vi.unstubAllGlobals();sessionStorage.clear();localStorage.removeItem("flow.cloud.logout-broadcast.v1");});
const response=(value:unknown)=>new Response(JSON.stringify(value),{status:200,headers:{"Content-Type":"application/json"}});
const authorized=()=>({authenticated:true,csrf:"x".repeat(43),expiresAt:Date.now()+300000,inferenceEnabled:true,speechEnabled:true,reasoningEnabled:false,consentVersion:"v1"});
it("logout publishes immediately and an older GET cannot restore authentication",async()=>{
  vi.resetModules();const module=await import("./hostedSessionClient");
  let resolve!:(response:Response)=>void;
  const fetchImpl=vi.fn().mockImplementationOnce(()=>new Promise<Response>(r=>resolve=r)).mockRejectedValue(new Error("offline"));
  vi.stubGlobal("fetch",fetchImpl);
  const listener=vi.fn();module.subscribeHostedSession(listener);
  const old=module.getHostedSession().catch(error=>error);
  const logout=module.logoutHostedSession().catch(error=>error);
  expect(listener).toHaveBeenCalledWith(expect.objectContaining({authenticated:false}));
  resolve(response(authorized()));expect(await old).toBeInstanceOf(Error);await logout;
  expect(listener.mock.calls.some(([s])=>s.authenticated)).toBe(false);
  expect(fetchImpl.mock.calls[0]![1].redirect).toBe("error");
});
it("rejects invalid expiry and never publishes it",async()=>{
  vi.resetModules();const module=await import("./hostedSessionClient");const listener=vi.fn();module.subscribeHostedSession(listener);
  const fetchImpl=vi.fn(async()=>({ok:true,json:async()=>({...authorized(),expiresAt:NaN})})) as unknown as typeof fetch;
  await expect(module.getHostedSession({fetchImpl})).rejects.toThrow();expect(listener).not.toHaveBeenCalled();
});
it("uses freshly fetched session CSRF and retains no persistent credentials",async()=>{
  vi.resetModules();const module=await import("./hostedSessionClient");
  const fetchImpl=vi.fn(async()=>response(authorized()));
  const session=await module.getHostedSession({fetchImpl});
  expect(session.csrf).toBe("x".repeat(43));expect(fetchImpl).toHaveBeenCalledWith("/api/session",expect.objectContaining({cache:"no-store",credentials:"same-origin",redirect:"error"}));
});
it("logout waits for pending redemption cookie installation and revokes that session",async()=>{
  vi.resetModules();const module=await import("./hostedSessionClient");let resolve!:(response:Response)=>void;
  const fetchImpl=vi.fn().mockImplementationOnce(()=>new Promise<Response>(r=>resolve=r))
    .mockResolvedValueOnce(response(authorized())).mockResolvedValueOnce(response({authenticated:false}));
  vi.stubGlobal("fetch",fetchImpl);const listener=vi.fn();module.subscribeHostedSession(listener);
  const redeem=module.redeemHostedSession("invite","v1").catch(error=>error);
  const logout=module.logoutHostedSession();
  expect(listener).toHaveBeenCalledWith(expect.objectContaining({authenticated:false}));expect(fetchImpl).toHaveBeenCalledTimes(1);
  resolve(response(authorized()));expect(await redeem).toBeInstanceOf(Error);await logout;
  expect(fetchImpl.mock.calls[2]![1]).toMatchObject({method:"DELETE",headers:{"X-Flow-CSRF":"x".repeat(43)}});
  expect(listener.mock.calls.some(([session])=>session.authenticated)).toBe(false);
});
it("keeps failed logout opted out across background reads and reload, until an explicit refresh",async()=>{
  vi.resetModules();let client=await import("./hostedSessionClient");
  const fetchImpl=vi.fn(async(_url:unknown,options?:RequestInit)=>options?.method==="DELETE" ? new Response(null,{status:503}) : response(authorized()));
  vi.stubGlobal("fetch",fetchImpl);
  await client.getHostedSession();
  await expect(client.logoutHostedSession()).rejects.toThrow();
  expect((await client.getHostedSession()).authenticated).toBe(false);
  vi.resetModules();client=await import("./hostedSessionClient");
  expect((await client.getHostedSession()).authenticated).toBe(false);
  expect((await client.getHostedSession({explicitRefresh:true})).authenticated).toBe(true);
});
it("sibling logout invalidates inactive cloud authority and persists opt-out without a successful DELETE",async()=>{
  vi.resetModules();const client=await import("./hostedSessionClient");
  const fetchImpl=vi.fn(async()=>response(authorized()));vi.stubGlobal("fetch",fetchImpl);
  await client.getHostedSession();
  const pendingTyped=new AbortController();
  const unsubscribe=client.subscribeHostedLogout(()=>pendingTyped.abort());
  window.dispatchEvent(new StorageEvent("storage",{key:"flow.cloud.logout-broadcast.v1",newValue:"other-tab-intent"}));
  expect(pendingTyped.signal.aborted).toBe(true);
  expect((await client.getHostedSession()).authenticated).toBe(false);
  expect(sessionStorage.getItem("flow.cloud.logout-intent.v1")).toBe("1");
  unsubscribe();
});
it("a later tab inherits origin logout intent until explicit refresh",async()=>{
  vi.resetModules();localStorage.setItem("flow.cloud.logout-broadcast.v1","prior-logout");sessionStorage.clear();
  const client=await import("./hostedSessionClient");const fetchImpl=vi.fn(async()=>response(authorized()));
  expect((await client.getHostedSession({fetchImpl})).authenticated).toBe(false);
  expect((await client.getHostedSession({fetchImpl,explicitRefresh:true})).authenticated).toBe(true);
  expect(localStorage.getItem("flow.cloud.logout-broadcast.v1")).toBeNull();
});
it("rechecks persisted logout before publishing a background GET without a mounted listener",async()=>{
  vi.resetModules();const client=await import("./hostedSessionClient");let resolve!:(value:Response)=>void;
  const pending=client.getHostedSession({fetchImpl:()=>new Promise<Response>(r=>resolve=r)});
  localStorage.setItem("flow.cloud.logout-broadcast.v1","missed-event");
  resolve(response(authorized()));expect((await pending).authenticated).toBe(false);
});
