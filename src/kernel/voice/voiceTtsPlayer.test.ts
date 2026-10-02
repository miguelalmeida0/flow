import { afterEach, expect, it, vi } from "vitest";
import { VoiceTtsPlayer } from "./voiceMicCapture";

afterEach(() => vi.unstubAllGlobals());

it("reconstructs odd PCM tails, resets them on cancel, and rejects a terminal half sample", () => {
  const samples: number[][] = [];
  vi.stubGlobal("AudioContext", class {
    currentTime=0; destination={};resume=()=>Promise.resolve();close=()=>Promise.resolve();
    createBuffer=(_channels:number,length:number,rate:number)=>({duration:length/rate,copyToChannel:(data:Float32Array)=>samples.push(Array.from(data))});
    createBufferSource=()=>({connect:vi.fn(),start:vi.fn(),stop:vi.fn(),buffer:null,onended:undefined});
  });
  const player=new VoiceTtsPlayer();player.beginUtterance();
  player.enqueueChunk(new Uint8Array([0]).buffer);player.enqueueChunk(new Uint8Array([64]).buffer);
  expect(samples).toEqual([[0.5]]);
  player.enqueueChunk(new Uint8Array([255]).buffer);player.cancel();player.beginUtterance();
  player.enqueueChunk(new Uint8Array([0,128]).buffer);expect(samples[1]).toEqual([-1]);
  player.enqueueChunk(new Uint8Array([1]).buffer);expect(()=>player.finish(vi.fn())).toThrow("Incomplete PCM");
});

it("stops every queued source on supersession and isolates late ended callbacks", () => {
  const sources: Array<{ onended?: () => void; stop: ReturnType<typeof vi.fn> }> = [];
  vi.stubGlobal("AudioContext", class {
    currentTime = 1;
    destination = {};
    resume = () => Promise.resolve();
    createBuffer = (_channels: number, length: number, rate: number) => ({ duration: length / rate, copyToChannel: vi.fn() });
    createBufferSource = () => {
      const source = { connect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: undefined, buffer: null };
      sources.push(source);
      return source;
    };
  });
  const player = new VoiceTtsPlayer();
  const oldDone = vi.fn(), nextDone = vi.fn();
  player.beginUtterance();
  player.enqueueChunk(new ArrayBuffer(4800));
  player.enqueueChunk(new ArrayBuffer(4800));
  player.finish(oldDone);
  player.beginUtterance();
  expect(sources[0]!.stop).toHaveBeenCalledOnce();
  expect(sources[1]!.stop).toHaveBeenCalledOnce();
  player.enqueueChunk(new ArrayBuffer(4800));
  player.finish(nextDone);
  sources[0]!.onended?.();
  sources[1]!.onended?.();
  expect(oldDone).not.toHaveBeenCalled();
  expect(nextDone).not.toHaveBeenCalled();
  sources[2]!.onended?.();
  expect(nextDone).toHaveBeenCalledOnce();
});
