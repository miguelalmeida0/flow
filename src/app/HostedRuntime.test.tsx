import {act,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {FlowEnvironmentProvider,useFlowEnvironment} from "./FlowEnvironmentProvider";
import {GlobalCommandDock} from "../shared/command/GlobalCommandDock";
import {FakeRecognitionAdapter} from "../features/day-planner/voice/fakeRecognition";
import {interpretTurn} from "../kernel/llm/modelClient";
import type * as ModelClient from "../kernel/llm/modelClient";
import {LIFE_STORAGE_KEY} from "../domain/life-storage";
const voice=vi.hoisted(()=>({start:vi.fn(),stop:vi.fn(),speak:vi.fn()}));
vi.mock("../features/voice/useKyutaiVoiceSession",()=>({useKyutaiVoiceSession:()=>({...voice,active:false,status:"stopped",available:false,state:"SLEEPING"})}));
vi.mock("../kernel/llm/modelClient",async original=>({...await original<typeof ModelClient>(),interpretTurn:vi.fn()}));
let env:ReturnType<typeof useFlowEnvironment>;
function Probe(){env=useFlowEnvironment();return null;}
function mount(){render(<FlowEnvironmentProvider now={()=>new Date("2026-10-02T10:00:00Z")}><Probe/><GlobalCommandDock recognitionAdapter={new FakeRecognitionAdapter()}/></FlowEnvironmentProvider>);}
beforeEach(()=>{
  localStorage.clear();sessionStorage.clear();vi.clearAllMocks();window.__FLOW_RUNTIME__={mode:"hosted",inferenceEnabled:true,releaseId:"test"};
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({authenticated:true,csrf:"c".repeat(43),expiresAt:Date.now()+60000,reasoningEnabled:true,speechEnabled:true,inferenceEnabled:true,consentVersion:"v1"}))));
});
afterEach(()=>{delete window.__FLOW_RUNTIME__;vi.restoreAllMocks();vi.unstubAllGlobals();});
it("offers kernel Confirm/Cancel without legacy pending and commits only on confirmation",async()=>{
  vi.mocked(interpretTurn).mockResolvedValueOnce({ok:true,response:{content:JSON.stringify({kind:"plan",summary:"Create note",conditions:[],steps:[{capabilityId:"journal.create",args:{title:"Reviewed note"}}]}),model:"fixture",totalDurationMs:1,loadDurationMs:null,evalCount:1}}).mockResolvedValue({ok:true,response:{content:JSON.stringify({verdict:"accept"}),model:"fixture",totalDurationMs:1,loadDurationMs:null,evalCount:1}});
  mount();await act(async()=>env.runCommand('Write a note saying "Reviewed note".',"type","proposal"));
  const confirm=await screen.findByRole("button",{name:"Confirm"});
  expect(env.pending).toBeUndefined();expect(env.document.studio.journalEntries).toHaveLength(0);
  fireEvent.click(confirm);await waitFor(()=>expect(env.document.studio.journalEntries).toHaveLength(1));
  expect(screen.queryByRole("button",{name:"Confirm"})).not.toBeInTheDocument();
});
it("shows retained save recovery, retries durably and leaves the command field usable",async()=>{
  mount();const original=localStorage.setItem.bind(localStorage);
  const save=vi.spyOn(localStorage,"setItem").mockImplementation((key,value)=>{if(key===LIFE_STORAGE_KEY)throw new DOMException("full","QuotaExceededError");original(key,value);});
  await act(async()=>env.runCommand("Remember I like early meetings","type","unsaved"));
  expect(screen.getByRole("button",{name:"Discard unsaved request"})).toBeVisible();
  const warning=new Event("beforeunload",{cancelable:true});window.dispatchEvent(warning);expect(warning.defaultPrevented).toBe(true);
  save.mockRestore();fireEvent.click(screen.getByRole("button",{name:"Retry save"}));
  await waitFor(()=>expect(env.hasUnsavedChanges).toBe(false));expect(env.document.personalMemoryFacts).toHaveLength(1);
  const after=new Event("beforeunload",{cancelable:true});window.dispatchEvent(after);expect(after.defaultPrevented).toBe(false);
});
it("auth never starts voice and explicit Start calls only the hosted owner",async()=>{
  mount();const start=await screen.findByRole("button",{name:"Start voice"});expect(voice.start).not.toHaveBeenCalled();
  fireEvent.click(start);expect(voice.start).toHaveBeenCalledOnce();expect(env.flowLiveStatus).not.toBe("unavailable");
});
it.each(["type","voice"] as const)("%s session controls dispatch hosted stop and make no false Start claim",async source=>{
  const commands:string[]=[];const listener=(event:Event)=>commands.push((event as CustomEvent).detail);window.addEventListener("flow-live-command",listener);
  try {
    mount();await act(async()=>env.runCommand("Pause listening",source,"stop-hosted"));
    expect(commands).toEqual(["sleep"]);expect(env.feedback.detail).toBe("The microphone session is off.");
    await act(async()=>env.runCommand("Resume listening",source,"start-hosted"));
    expect(commands).toEqual(["sleep"]);expect(env.feedback.title).toBe("Choose Start voice");expect(voice.start).not.toHaveBeenCalled();
  } finally {window.removeEventListener("flow-live-command",listener);}
});
