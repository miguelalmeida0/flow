import {expect,it,vi} from "vitest";
import {HostedMicrophoneBroker} from "./hostedMicrophoneBroker";
it("shares one physical stream and recorder release preserves the voice lease", async()=>{
  const stop=vi.fn(),stream={getTracks:()=>[{stop}]} as unknown as MediaStream;
  const acquire=vi.fn(async()=>stream),broker=new HostedMicrophoneBroker(acquire);
  const [voice,recorder]=await Promise.all([broker.acquire(),broker.acquire()]);
  expect(acquire).toHaveBeenCalledOnce();expect(voice.stream).toBe(recorder.stream);
  recorder.release();expect(stop).not.toHaveBeenCalled();voice.release();expect(stop).toHaveBeenCalledOnce();
});
it("terminal stop finalizes all owners before stopping tracks and rejects late permission", async()=>{
  let resolve!:(stream:MediaStream)=>void;const stop=vi.fn(),revoked=vi.fn();
  const broker=new HostedMicrophoneBroker(()=>new Promise<MediaStream>(r=>resolve=r));
  const pending=broker.acquire(revoked).catch(error=>error);
  broker.revokeAll();resolve({getTracks:()=>[{stop}]} as unknown as MediaStream);
  expect(await pending).toBeInstanceOf(Error);expect(stop).toHaveBeenCalledOnce();
  expect(revoked).not.toHaveBeenCalled();
});
it("an old permission result cannot replace a newer capture epoch", async()=>{
  const resolvers:Array<(stream:MediaStream)=>void>=[];
  const broker=new HostedMicrophoneBroker(()=>new Promise(resolve=>resolvers.push(resolve)));
  const oldStop=vi.fn(),newStop=vi.fn();
  const old=broker.acquire().catch(error=>error);broker.revokeAll();const next=broker.acquire();
  resolvers[1]!({getTracks:()=>[{stop:newStop}]} as unknown as MediaStream);const lease=await next;
  resolvers[0]!({getTracks:()=>[{stop:oldStop}]} as unknown as MediaStream);expect(await old).toBeInstanceOf(Error);
  expect(oldStop).toHaveBeenCalledOnce();expect(newStop).not.toHaveBeenCalled();lease.release();expect(newStop).toHaveBeenCalledOnce();
});
