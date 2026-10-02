import {act,render,waitFor} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {FlowEnvironmentProvider} from "../../app/FlowEnvironmentProvider";
import {StudioRuntimeProvider,useStudioRuntime} from "./StudioRuntimeProvider";
import {hostedMicrophoneBroker} from "../../kernel/voice/hostedMicrophoneBroker";
import {acceptanceFixture,acceptanceClock} from "../voice-intelligence/acceptanceFixtures";
import {LIFE_STORAGE_KEY} from "../../domain/life-storage";
import {getStudioMedia} from "./mediaRepository";

class Recorder {
  static isTypeSupported(){return true;}
  state:RecordingState="inactive";mimeType="audio/webm";
  ondataavailable:((event:BlobEvent)=>void)|null=null;onstop:((event:Event)=>void)|null=null;onerror=null;
  start(){this.state="recording";}pause(){this.state="paused";}resume(){this.state="recording";}
  requestData(){this.ondataavailable?.({data:new Blob(["original microphone recording"],{type:this.mimeType})} as BlobEvent);}
  stop(){this.state="inactive";this.onstop?.(new Event("stop"));}
}
let runtime:ReturnType<typeof useStudioRuntime>;
function Probe(){runtime=useStudioRuntime();return null;}
afterEach(()=>{hostedMicrophoneBroker.revokeAll();delete window.__FLOW_RUNTIME__;vi.unstubAllGlobals();vi.restoreAllMocks();});
it.each([true,false])("saves original recording on terminal Stop with cloud capture active=%s",async(cloudActive)=>{
  localStorage.clear();window.__FLOW_RUNTIME__={mode:"hosted",inferenceEnabled:true,releaseId:"test"};
  const snapshot=acceptanceFixture("legacy-journal-editing").snapshot;
  const entry=snapshot.document.studio.journalEntries[0]!;
  entry.audioAssetId=undefined;entry.recordingState="idle";entry.recordingDurationMs=0;
  localStorage.setItem(LIFE_STORAGE_KEY,JSON.stringify(snapshot));
  const stop=vi.fn();const stream={getTracks:()=>[{stop}]} as unknown as MediaStream;
  const getUserMedia=vi.fn(async()=>stream);
  const network=vi.fn();vi.stubGlobal("fetch",network);
  Object.defineProperty(navigator,"mediaDevices",{configurable:true,value:{getUserMedia}});vi.stubGlobal("MediaRecorder",Recorder);
  render(<FlowEnvironmentProvider now={()=>acceptanceClock}><StudioRuntimeProvider><Probe/></StudioRuntimeProvider></FlowEnvironmentProvider>);
  const voice=cloudActive?await hostedMicrophoneBroker.acquire():undefined;
  await act(async()=>runtime.startRecording(entry.id));
  expect(runtime.recorder.status).toBe("recording");expect(getUserMedia).toHaveBeenCalledOnce();
  expect(network).not.toHaveBeenCalled();
  const assetId=runtime.recorder.assetId!;
  await act(async()=>hostedMicrophoneBroker.revokeAll());
  await waitFor(()=>expect(runtime.recorder.status).toBe("idle"));
  expect((await getStudioMedia(assetId))?.size).toBeGreaterThan(0);expect(stop).toHaveBeenCalledOnce();
  voice?.release();expect(stop).toHaveBeenCalledOnce();
});
