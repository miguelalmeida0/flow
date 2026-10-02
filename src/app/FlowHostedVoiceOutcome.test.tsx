import {act,render,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {FlowEnvironmentProvider,useFlowEnvironment} from "./FlowEnvironmentProvider";
import type {KyutaiVoiceSessionOptions} from "../features/voice/useKyutaiVoiceSession";
import {interpretTurn} from "../kernel/llm/modelClient";
import type * as ModelClient from "../kernel/llm/modelClient";
import type * as VoiceWorld from "../features/voice-home/useVoiceWorld";
import type { LifeLockManager } from "../domain/life-synchronization";
const voice=vi.hoisted(()=>({options:null as KyutaiVoiceSessionOptions|null,speak:vi.fn()}));
const presentation=vi.hoisted(()=>({wait:vi.fn()}));
vi.mock("../features/voice-home/useVoiceWorld",async(original)=>{
 const actual=await original<typeof VoiceWorld>();
 return {...actual,useVoiceWorld:(...args:Parameters<typeof actual.useVoiceWorld>)=>({...actual.useVoiceWorld(...args),waitForTargetPaint:presentation.wait})};
});
vi.mock("../features/voice/useKyutaiVoiceSession",()=>({useKyutaiVoiceSession:(options:KyutaiVoiceSessionOptions)=>{
  voice.options=options;return {available:true,active:true,status:"active",captureEpoch:"epoch",state:"LISTENING",speak:voice.speak,cancel:vi.fn(),stop:vi.fn()};
}}));
vi.mock("../kernel/llm/modelClient",async(original)=>({...await original<typeof ModelClient>(),interpretTurn:vi.fn()}));
let environment:ReturnType<typeof useFlowEnvironment>;
function Probe(){environment=useFlowEnvironment();return null;}
beforeEach(()=>{localStorage.clear();voice.speak.mockReset();presentation.wait.mockReset();vi.mocked(interpretTurn).mockReset();window.__FLOW_RUNTIME__={mode:"hosted",inferenceEnabled:true,releaseId:"test"};});
afterEach(()=>{delete window.__FLOW_RUNTIME__;Object.defineProperty(navigator,"locks",{configurable:true,value:undefined});});
function mount(){render(<FlowEnvironmentProvider now={()=>new Date("2026-10-02T10:00:00Z")}><Probe/></FlowEnvironmentProvider>);}
it("speaks a durable voice result using its original transport command identity",async()=>{
  mount();await act(async()=>voice.options!.onFinalTranscript("Remember I prefer morning meetings",{commandId:"transport-1",captureEpoch:"epoch"}));
  await waitFor(()=>expect(voice.speak).toHaveBeenCalledOnce());
  expect(window.__FLOW_COMMAND_TRACE__?.commandId).toBe("transport-1");
  expect(environment.document.personalMemoryFacts).toHaveLength(1);
});
it("typed supersession while the microphone remains active cannot speak an older model outcome",async()=>{
  let resolve!:(value:Awaited<ReturnType<typeof interpretTurn>>)=>void;
  vi.mocked(interpretTurn).mockImplementation(()=>new Promise(r=>resolve=r));mount();
  act(()=>voice.options!.onFinalTranscript("Help me organize my entire morning around my priorities",{commandId:"old-voice",captureEpoch:"epoch"}));
  await waitFor(()=>expect(interpretTurn).toHaveBeenCalled());
  await act(async()=>environment.runCommand("Remember I prefer quiet rooms","type","new-typed"));
  await act(async()=>resolve({ok:true,response:{content:JSON.stringify({kind:"answer",text:"Older reply"}),model:"test",totalDurationMs:1,loadDurationMs:null,evalCount:1}}));
  expect(voice.speak).not.toHaveBeenCalled();
});
it("keeps untrusted model success claims out of application status and speech",async()=>{
  vi.mocked(interpretTurn).mockResolvedValue({ok:true,response:{content:JSON.stringify({kind:"answer",text:"I saved it"}),model:"test",totalDurationMs:1,loadDurationMs:null,evalCount:1}});
  mount();const before=JSON.stringify(environment.snapshot);
  await act(async()=>voice.options!.onFinalTranscript("Explain how a closure works",{commandId:"model-answer",captureEpoch:"epoch"}));
  await waitFor(()=>expect(environment.feedback.title).toBe("AI response — no changes made"));
  expect(environment.feedback.detail).toBe("I saved it");expect(JSON.stringify(environment.snapshot)).toBe(before);
  expect(voice.speak).not.toHaveBeenCalledWith(expect.stringContaining("I saved it"));
  expect(voice.speak).toHaveBeenCalledWith("AI response — no changes made");
});
it.each(["voice","type"] as const)("revokes queued hosted voice after Stop while preserving queued %s command semantics",async(source)=>{
 let held=false,release!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;});
 let tail=Promise.resolve();
 const locks:LifeLockManager={request:(_name,_options,callback)=>{
  const before=held?gate:Promise.resolve();
  const task=tail.then(()=>before).then(callback);tail=task.then(()=>undefined,()=>undefined);return task;
 }};
 Object.defineProperty(navigator,"locks",{configurable:true,value:locks});
 mount();await act(async()=>{await tail;});
 const before=JSON.parse(localStorage.getItem("flow.life.v3")!);
 held=true;
 act(()=>environment.runCommand("Remember I prefer quiet afternoons",source,"queued-before-stop"));
 act(()=>voice.options!.onSessionStopped?.("Stopped"));
 await act(async()=>{held=false;release();await tail;});
 const after=JSON.parse(localStorage.getItem("flow.life.v3")!);
 if(source==="voice"){expect(after).toEqual(before);expect(voice.speak).not.toHaveBeenCalled();}
 else{expect(after.document.personalMemoryFacts).toHaveLength(1);expect(after.past).toHaveLength(before.past.length+1);}
 await act(async()=>environment.runCommand("Remember I prefer morning walks","voice","fresh-after-stop"));
 await waitFor(()=>expect(environment.document.personalMemoryFacts).toHaveLength(source==="voice"?1:2));
});
it("revokes a hosted legacy command waiting for target paint after logout",async()=>{
 let release!:()=>void;presentation.wait.mockReturnValue(new Promise<void>(resolve=>{release=resolve;}));
 mount();const before=JSON.parse(localStorage.getItem("flow.life.v3")!);
 act(()=>environment.runCommand("Capture Read the release notes","voice","paint-pending"));
 await waitFor(()=>expect(presentation.wait).toHaveBeenCalled());
 act(()=>environment.invalidateAsyncAuthority("logout"));
 await act(async()=>release());
 expect(JSON.parse(localStorage.getItem("flow.life.v3")!)).toEqual(before);
 expect(voice.speak).not.toHaveBeenCalled();
});
it("preserves two intentionally queued hosted commands without a lifecycle cancellation",async()=>{
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});let held=false,tail=Promise.resolve();
 const locks:LifeLockManager={request:(_name,_options,callback)=>{const before=held?gate:Promise.resolve();const task=tail.then(()=>before).then(callback);tail=task.then(()=>undefined,()=>undefined);return task;}};
 Object.defineProperty(navigator,"locks",{configurable:true,value:locks});mount();await act(async()=>{await tail;});held=true;
 act(()=>{environment.runCommand("Remember I prefer quiet afternoons","voice","queued-one");environment.runCommand("Remember I prefer morning walks","voice","queued-two");});
 await act(async()=>{held=false;release();await tail;});
 expect(environment.document.personalMemoryFacts).toHaveLength(2);
 expect(environment.snapshot.past).toHaveLength(2);
});
it("executes local voice sleep without waiting for target presentation",async()=>{
 window.__FLOW_RUNTIME__={mode:"local",inferenceEnabled:false,releaseId:"test"};
 presentation.wait.mockReturnValue(new Promise<void>(()=>undefined));
 const sessionCommands:string[]=[];
 const receive=(event:Event)=>sessionCommands.push((event as CustomEvent<string>).detail);
 window.addEventListener("flow-live-command",receive);
 try {
  mount();const before=JSON.stringify(environment.snapshot.document);
  await act(async()=>environment.runCommand("Pause listening","voice","sleep-before-restart"));
  expect(sessionCommands).toEqual(["sleep"]);
  expect(presentation.wait).not.toHaveBeenCalled();
  expect(JSON.stringify(environment.snapshot.document)).toBe(before);
  expect(environment.snapshot.past).toHaveLength(0);
 } finally {window.removeEventListener("flow-live-command",receive);}
});
