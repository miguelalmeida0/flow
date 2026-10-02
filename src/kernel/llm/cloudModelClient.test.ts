import { afterEach, expect, it, vi } from "vitest";
import { interpretTurn } from "./modelClient";
import { runConversationTurn } from "./conversationCoordinator";
import { createSession } from "../kernel";
import { journeyDocument, testEnvironment, fixedClock } from "../__tests__/fixtures";
import { createDefaultRegistry } from "../capabilities";
import { describeCapabilitiesForModel } from "./capabilityModel";
import contract from "../../../server/hosted-gateway/generated/model-contract.json";
import {getHostedSession,logoutHostedSession} from "../hostedSessionClient";
const session = () => new Response(JSON.stringify({ authenticated: true, csrf: "a".repeat(43), expiresAt: Date.now()+60000, reasoningEnabled: true, inferenceEnabled: true, speechEnabled: false, consentVersion: "v1" }));
const model = (content: unknown) => new Response(JSON.stringify({ok:true,response:{content:JSON.stringify(content),model:"gpt-4.1-mini-2025-04-14"}}));
const hosted = () => { window.__FLOW_RUNTIME__ = {mode:"hosted",inferenceEnabled:true,releaseId:"fixture"}; };
afterEach(() => { delete window.__FLOW_RUNTIME__; vi.restoreAllMocks(); });
function turn(fetchImpl: typeof fetch, text="Move dinner to six tonight") {
  const env=testEnvironment(journeyDocument(),fixedClock());
  return {rawTranscript:text,normalizedTranscript:text,env,session:createSession(),recentTurns:[],referents:[],fetchImpl};
}
it("sends only structured context and fresh CSRF to the same origin",async()=>{
  hosted(); const fetchImpl=vi.fn(async (url: RequestInfo | URL) => url==="/api/session"?session():model({kind:"answer",text:"Hello",sources:[]}));
  const result=await runConversationTurn(turn(fetchImpl,"Explain a closure"));
  expect(result.message).toBe("Hello");expect(fetchImpl.mock.calls.map(c=>c[0])).toEqual(["/api/session","/api/interpret"]);
  const call = fetchImpl.mock.calls[1] as unknown as [string,RequestInit];
  const body=JSON.parse(String(call[1].body));expect(Object.keys(body).sort()).toEqual(["context","kind","version"]);expect(call[1].headers).toMatchObject({"X-Flow-CSRF":"a".repeat(43)});
});
it("requires review before a cloud mutation and rejects multi-step mutation scope",async()=>{
  hosted();const plan={kind:"plan",steps:[{capabilityId:"calendar.move",args:{eventId:"dinner",startMinutes:1080}}],summary:"Move dinner",conditions:[]};
  const fetchImpl=async(url:RequestInfo|URL,init?:RequestInit)=>url==="/api/session"?session():model(JSON.parse(String(init?.body)).kind==="verify"?{verdict:"accept"}:plan);
  const input=turn(fetchImpl);const before=JSON.stringify(input.env.document);const result=await runConversationTurn(input);
  expect(result.outcome.status).toBe("proposed");expect(JSON.stringify(result.env.document)).toBe(before);
  plan.steps.push({capabilityId:"calendar.move",args:{eventId:"drinks",startMinutes:1200}});
  const compound=await runConversationTurn(turn(fetchImpl,"Move dinner and drinks later"));expect(compound.outcome.status).toBe("error");expect(compound.message).toContain("separately");
});
it("clarifies rather than submitting when required hosted verification is unavailable",async()=>{
  hosted();const executePlan=vi.fn();
  const fetchImpl=async(url:RequestInfo|URL,init?:RequestInit)=>url==="/api/session"?session():JSON.parse(String(init?.body)).kind==="verify"?new Response("",{status:503}):model({kind:"plan",steps:[{capabilityId:"calendar.move",args:{eventId:"dinner",startMinutes:1080}}],summary:"Move dinner",conditions:["unless that clashes with drinks"]});
  const result=await runConversationTurn({...turn(fetchImpl,"Move dinner to six, unless that clashes with drinks"),executePlan});
  expect(result.outcome.status).toBe("clarify");expect(executePlan).not.toHaveBeenCalled();
});
it("actually aborts a pending fetch on the coordinator deadline",async()=>{
  hosted();let observed: AbortSignal | undefined;
  const fetchImpl=async(url:RequestInfo|URL,init?:RequestInit)=>{if(url==="/api/session")return session();observed=init?.signal??undefined;return new Promise<Response>((_,reject)=>observed!.addEventListener("abort",()=>reject(new Error("aborted")),{once:true}));};
  const result=await runConversationTurn({...turn(fetchImpl),budget:{maxRounds:3,maxPlanSteps:8,turnDeadlineMs:50,roundDeadlineMs:30,verifierRoundDeadlineMs:30,minVerifierBudgetMs:1}});
  expect(result.declineReason).toBe("deadline");expect(observed?.aborted).toBe(true);
});
it("aborts required verification at its deadline and returns clarification",async()=>{
  hosted();let observed:AbortSignal|undefined;const executePlan=vi.fn();
  const fetchImpl=async(url:RequestInfo|URL,init?:RequestInit)=>{if(url==="/api/session")return session();if(JSON.parse(String(init?.body)).kind==="verify"){observed=init?.signal??undefined;return new Promise<Response>((_,reject)=>observed!.addEventListener("abort",()=>reject(new Error("aborted")),{once:true}));}return model({kind:"plan",steps:[{capabilityId:"calendar.move",args:{eventId:"dinner",startMinutes:1080}}],summary:"Move dinner",conditions:["unless that clashes with drinks"]});};
  const result=await runConversationTurn({...turn(fetchImpl,"Move dinner to six, unless that clashes with drinks"),executePlan,budget:{maxRounds:3,maxPlanSteps:8,turnDeadlineMs:1000,roundDeadlineMs:100,verifierRoundDeadlineMs:20,minVerifierBudgetMs:1}});
  expect(result.outcome.status).toBe("clarify");expect(observed?.aborted).toBe(true);expect(executePlan).not.toHaveBeenCalled();
});
it("never falls back to localhost for missing hosted context or typed-only mode",async()=>{
  hosted();const fetchImpl=vi.fn();const req={system:"untrusted",user:"hi",schema:{},fetchImpl};expect((await interpretTurn(req)).ok).toBe(false);
  window.__FLOW_RUNTIME__={mode:"typed-only",inferenceEnabled:false,releaseId:"fixture"};expect((await interpretTurn(req)).ok).toBe(false);expect(fetchImpl).not.toHaveBeenCalled();
});
it("uses exactly the current hosted registry capabilities in the generated contract",()=>{
  expect(contract.capabilities.map(c=>c.id)).toEqual(describeCapabilitiesForModel(createDefaultRegistry("hosted")).map(c=>c.id));
});
it("rejects an unknown entity and an unsafe verifier repair before submitting",async()=>{
  hosted();const executePlan=vi.fn();let verify=false;
  const fetchImpl=async(url:RequestInfo|URL,init?:RequestInit)=>{
    if(url==="/api/session")return session();
    const body=JSON.parse(String(init?.body));
    if(body.kind==="verify")return model({verdict:"repair",repairedFrame:{kind:"plan",steps:[{capabilityId:"desktop.openFile",args:{path:"/private"}}],summary:"open"}});
    return model({kind:"plan",steps:[{capabilityId:"calendar.move",args:{eventId:verify?"dinner":"invented",startMinutes:1080}}],summary:"Move",conditions:verify?["unless that clashes with drinks"]:[]});
  };
  expect((await runConversationTurn({...turn(fetchImpl),executePlan})).declineReason).toBe("invalid-output");
  verify=true;expect((await runConversationTurn({...turn(fetchImpl,"Move dinner to six, unless that clashes with drinks"),executePlan})).outcome.status).toBe("clarify");expect(executePlan).not.toHaveBeenCalled();
});
it("a failed logout blocks the next typed model request until explicit refresh",async()=>{
  hosted(); const fetchImpl=vi.fn(async(url:RequestInfo|URL,init?:RequestInit)=>init?.method==="DELETE"?new Response(null,{status:503}):url==="/api/session"?session():model({kind:"answer",text:"Hello",sources:[]}));
  vi.stubGlobal("fetch",fetchImpl);
  await getHostedSession({explicitRefresh:true});await expect(logoutHostedSession()).rejects.toThrow();
  const before=fetchImpl.mock.calls.length;await runConversationTurn(turn(fetchImpl,"Explain a closure"));
  expect(fetchImpl.mock.calls.slice(before).some(([url])=>url==="/api/interpret")).toBe(false);
  await getHostedSession({explicitRefresh:true});const restored=await runConversationTurn(turn(fetchImpl,"Explain a closure"));
  expect(restored.message).toBe("Hello");vi.unstubAllGlobals();
});
