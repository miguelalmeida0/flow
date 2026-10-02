import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {act,renderHook} from "@testing-library/react";
import {useKyutaiVoiceSession} from "./useKyutaiVoiceSession";
import type {VoiceTransport,VoiceTransportListener} from "../../kernel/voice/voiceTransport";
import type {VoiceCompanionEvent} from "../../kernel/voice/voiceCompanionClient";
class Client implements VoiceTransport {
  sttReady=true;ttsReady=true;isConnected=true;listeners=new Set<VoiceTransportListener>();
  connect=vi.fn();disconnect=vi.fn();sendAudio=vi.fn();startSession=vi.fn();stopSession=vi.fn();setInputMode=vi.fn();speak=vi.fn();cancelSpeak=vi.fn();acknowledgePlayback=vi.fn();
  on(listener:VoiceTransportListener){this.listeners.add(listener);return()=>{this.listeners.delete(listener);};}
  emit(event:VoiceCompanionEvent){for(const listener of this.listeners)listener(event);}
}
const epoch="12345678-1234-1234-1234-123456789012";
const ready=()=>({type:"ready" as const,version:1,sttReady:true,ttsReady:true,captureEpoch:epoch,sessionId:"s",expiresAt:Date.now()+300000});
beforeEach(()=>{window.__FLOW_RUNTIME__={mode:"hosted",inferenceEnabled:true,releaseId:"test"};});
afterEach(()=>{delete window.__FLOW_RUNTIME__;vi.restoreAllMocks();vi.useRealTimers();});
function setup(micCaptureImpl=vi.fn(async(callback:(data:ArrayBuffer)=>void)=>{ void callback; return {stop:vi.fn()}; })) {
  const client=new Client(),onFinal=vi.fn(),onStopped=vi.fn();
  const player={beginUtterance:vi.fn(),enqueueChunk:vi.fn(),cancel:vi.fn(),close:vi.fn(),unlock:vi.fn(async()=>{})};
  const hook=renderHook(()=>useKyutaiVoiceSession({client,micCaptureImpl,createTtsPlayer:()=>player,onFinalTranscript:onFinal,onSessionStopped:onStopped}));
  return {...hook,client,player,onFinal,onStopped,micCaptureImpl};
}
it("does not connect, capture, or respond to wake before explicit Start",()=>{
  const h=setup();
  act(()=>{h.result.current.wake();h.client.emit(ready());h.result.current.speak("hello");});
  expect(h.client.connect).not.toHaveBeenCalled();expect(h.micCaptureImpl).not.toHaveBeenCalled();expect(h.client.speak).not.toHaveBeenCalled();
});
it("sibling logout invalidates pending typed authority with the microphone inactive",()=>{
  const h=setup();const typedRequest=new AbortController();h.onStopped.mockImplementation(()=>typedRequest.abort());
  expect(h.result.current.active).toBe(false);
  act(()=>window.dispatchEvent(new StorageEvent("storage",{key:"flow.cloud.logout-broadcast.v1",newValue:crypto.randomUUID()})));
  expect(typedRequest.signal.aborted).toBe(true);expect(h.micCaptureImpl).not.toHaveBeenCalled();
});
it("starts only after accepted readiness and dispatches stable transport identity once",async()=>{
  const h=setup();
  act(()=>h.result.current.start());
  expect(h.client.connect).toHaveBeenCalledOnce();expect(h.micCaptureImpl).not.toHaveBeenCalled();
  await act(async()=>h.client.emit(ready()));
  expect(h.result.current.state).toBe("LISTENING");expect(h.micCaptureImpl).toHaveBeenCalledOnce();
  act(()=>{h.client.emit({type:"speech.start",utteranceId:"u",sessionId:"s",captureEpoch:epoch});h.client.emit({type:"transcript.final",text:"Open calendar",utteranceId:"u",sessionId:"s",captureEpoch:epoch});h.client.emit({type:"transcript.final",text:"Open calendar",utteranceId:"u",sessionId:"s",captureEpoch:epoch});});
  expect(h.onFinal).toHaveBeenCalledExactlyOnceWith("Open calendar",{commandId:"hosted-voice:s:"+epoch+":u",captureEpoch:epoch});
});
it("Stop invalidates pending microphone acquisition and synchronous PCM callbacks",async()=>{
  let resolve!:(value:{stop:()=>void})=>void;let pcm!:(data:ArrayBuffer)=>void;
  const stop=vi.fn();
  const mic=vi.fn((callback:(data:ArrayBuffer)=>void)=>{pcm=callback;return new Promise<{stop:()=>void}>(r=>resolve=r);});
  const h=setup(mic);
  act(()=>h.result.current.start());await act(async()=>h.client.emit(ready()));
  act(()=>{h.result.current.stop();pcm(new ArrayBuffer(20));h.client.emit(ready());});
  await act(async()=>resolve({stop}));
  expect(stop).toHaveBeenCalledOnce();expect(h.client.sendAudio).not.toHaveBeenCalled();expect(h.result.current.active).toBe(false);
  expect(h.onStopped).toHaveBeenCalled();expect(h.player.cancel).toHaveBeenCalled();
});
it("pagehide stops capture and late final or TTS cannot revive it",async()=>{
  const h=setup();
  act(()=>h.result.current.start());await act(async()=>h.client.emit(ready()));
  act(()=>{window.dispatchEvent(new Event("pagehide"));h.client.emit({type:"speech.start",utteranceId:"late"});h.client.emit({type:"transcript.final",text:"delete everything",utteranceId:"late"});h.client.emit({type:"tts.audio",data:new ArrayBuffer(20)});});
  expect(h.onFinal).not.toHaveBeenCalled();expect(h.player.enqueueChunk).not.toHaveBeenCalled();expect(h.result.current.active).toBe(false);
  act(()=>document.dispatchEvent(new Event("visibilitychange")));
  expect(h.client.connect).toHaveBeenCalledOnce();
});
it("returns playback credit only after current audio source completes",async()=>{
  const h=setup();act(()=>h.result.current.start());await act(async()=>h.client.emit(ready()));
  act(()=>h.client.emit({type:"tts.audio",data:new ArrayBuffer(20),generation:3,sequence:2,captureEpoch:epoch}));
  expect(h.client.acknowledgePlayback).not.toHaveBeenCalled();
  const played=h.player.enqueueChunk.mock.calls[0]![1] as ()=>void;
  act(()=>played());expect(h.client.acknowledgePlayback).toHaveBeenCalledWith(3,2);
  act(()=>{h.result.current.stop();played();});
  expect(h.client.acknowledgePlayback).toHaveBeenCalledTimes(1);
});
it("expires and requires explicit new Start",async()=>{
  vi.useFakeTimers();const h=setup();act(()=>h.result.current.start());
  await act(async()=>h.client.emit({...ready(),expiresAt:Date.now()+20}));
  act(()=>vi.advanceTimersByTime(21));expect(h.result.current.active).toBe(false);expect(h.client.disconnect).toHaveBeenCalled();
});
it.each(["typed-only", "browser-native"] as const)("%s keeps provider transport disconnected even on explicit Start",(mode)=>{
  window.__FLOW_RUNTIME__={mode,inferenceEnabled:false,releaseId:"test"};
  const h=setup();act(()=>h.result.current.start());expect(h.client.connect).not.toHaveBeenCalled();
});
it.each(["command", "Escape"])("%s stops the actual hosted owner and rejects later PCM",async(kind)=>{
  let pcm!:(data:ArrayBuffer)=>void; const stop=vi.fn();
  const h=setup(vi.fn(async(callback:(data:ArrayBuffer)=>void)=>{pcm=callback;return {stop};}));
  act(()=>h.result.current.start());await act(async()=>h.client.emit(ready()));
  act(()=>{window.dispatchEvent(kind === "command" ? new CustomEvent("flow-live-command",{detail:"sleep"}) : new KeyboardEvent("keydown",{key:"Escape"}));pcm(new ArrayBuffer(20));});
  expect(h.result.current.active).toBe(false);expect(stop).toHaveBeenCalledOnce();expect(h.onStopped).toHaveBeenCalled();expect(h.client.sendAudio).not.toHaveBeenCalled();
  act(()=>window.dispatchEvent(new CustomEvent("flow-live-command",{detail:"start"})));
  expect(h.client.connect).toHaveBeenCalledOnce();
});
it("does not announce active capture while microphone permission is pending",async()=>{
  let resolve!:(capture:{stop:ReturnType<typeof vi.fn>})=>void;
  const h=setup(vi.fn((callback:(data:ArrayBuffer)=>void)=>{void callback;return new Promise<{stop:ReturnType<typeof vi.fn>}>(r=>resolve=r);}));
  act(()=>h.result.current.start());await act(async()=>h.client.emit(ready()));
  expect(h.result.current.status).toBe("connecting");
  await act(async()=>resolve({stop:vi.fn()}));expect(h.result.current.status).toBe("active");
});
