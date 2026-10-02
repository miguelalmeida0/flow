// @vitest-environment-options {"url":"https://flow.example/"}
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {HostedVoiceClient} from "./hostedVoiceClient";
import {VoiceCompanionClient} from "./voiceCompanionClient";
import type {VoiceCompanionEvent} from "./voiceCompanionClient";
import {encodeVoiceFrame} from "../../../shared/hosted-voice-protocol.mjs";
class Socket {
  static instances:Socket[]=[];static OPEN=1;readyState=0;bufferedAmount=0;binaryType="";
  onopen?:()=>void;onmessage?:(event:{data:unknown})=>void;onclose?:(event:{code:number;reason:string})=>void;onerror?:()=>void;
  sent:Array<string|ArrayBuffer>=[];constructor(public url:string){Socket.instances.push(this);}
  send(value:string|ArrayBuffer){this.sent.push(value);}
  close(){this.readyState=3;}
  open(){this.readyState=1;this.onopen?.();}
  message(value:unknown){this.onmessage?.({data:typeof value==="object"&&!(value instanceof ArrayBuffer)?JSON.stringify(value):value});}
}
beforeEach(()=>{Socket.instances=[];window.__FLOW_RUNTIME__={mode:"hosted",inferenceEnabled:true,releaseId:"test"};});
afterEach(()=>{delete window.__FLOW_RUNTIME__;vi.useRealTimers();});
async function setup(){
  const events:VoiceCompanionEvent[]=[];
  const sessionImpl=vi.fn(async()=>({authenticated:true,csrf:"x".repeat(43),expiresAt:Date.now()+300000,inferenceEnabled:true,speechEnabled:true,reasoningEnabled:false,consentVersion:"v1"}));
  const client=new HostedVoiceClient({webSocketImpl:Socket as unknown as typeof WebSocket,sessionImpl});
  client.on(event=>events.push(event));client.connect();await Promise.resolve();await Promise.resolve();
  const socket=Socket.instances[0]!;socket.open();
  const hello=JSON.parse(socket.sent[0] as string);const epoch=hello.captureEpoch;
  const send=(event:object)=>socket.message({version:1,sessionId:"session",captureEpoch:epoch,...event});
  const ready=()=>send({type:"ready",sttReady:true,ttsReady:true,expiresAt:Date.now()+300000});
  return {client,socket,events,send,ready,epoch,hello};
}
it("uses cookie URL and first-frame CSRF, and sends no audio before readiness",async()=>{
  const h=await setup();
  expect(h.socket.url).toBe("wss://flow.example/api/voice");expect(h.hello.csrf).toBe("x".repeat(43));
  h.client.sendAudio(new ArrayBuffer(100));expect(h.socket.sent).toHaveLength(1);
  h.ready();h.client.sendAudio(new ArrayBuffer(100));expect(h.socket.sent[1]).toBeInstanceOf(ArrayBuffer);h.client.disconnect();
});
it("rejects old output generations after cancellation and accepts only ordered current PCM",async()=>{
  const h=await setup();h.ready();h.client.speak("one");h.send({type:"tts.start",generation:1,requestId:1});
  h.client.cancelSpeak();h.client.speak("two");h.send({type:"tts.start",generation:3,requestId:3});
  h.socket.message(encodeVoiceFrame({kind:2,epoch:h.epoch,generation:1,sequence:1,data:new ArrayBuffer(20)}));
  expect(h.events.filter(e=>e.type==="tts.audio")).toHaveLength(0);
  h.socket.message(encodeVoiceFrame({kind:2,epoch:h.epoch,generation:3,sequence:1,data:new ArrayBuffer(20)}));
  expect(h.events.filter(e=>e.type==="tts.audio")).toHaveLength(1);h.client.disconnect();
});
it("counts framing bytes in PCM overflow and never reconnects automatically",async()=>{
  const h=await setup();h.ready();h.socket.bufferedAmount=95900;
  h.client.sendAudio(new ArrayBuffer(100));
  expect(h.client.isConnected).toBe(false);expect(h.events.some(e=>e.type==="stt.error")).toBe(true);
  await Promise.resolve();expect(Socket.instances).toHaveLength(1);
});
it("ignores stale socket close after explicit new capture",async()=>{
  const h=await setup();h.ready();h.client.disconnect();h.client.connect();await Promise.resolve();await Promise.resolve();
  const current=Socket.instances[1]!;current.open();
  h.socket.onclose?.({code:1000,reason:"old"});
  expect(h.client.isConnected).toBe(true);h.client.disconnect();
});
it("blocks direct local companion constructor overrides in hosted mode",()=>{
  const client=new VoiceCompanionClient({webSocketImpl:Socket as unknown as typeof WebSocket,baseUrl:"ws://127.0.0.1:8766",token:"stale"});
  client.connect();expect(Socket.instances).toHaveLength(0);
});
