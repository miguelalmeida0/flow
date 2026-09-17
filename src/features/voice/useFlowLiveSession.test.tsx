import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FakeRecognitionAdapter } from "../day-planner/voice/fakeRecognition";
import { LiveOwnershipCoordinator, type LiveLease, type LiveOwnershipTransport } from "./liveOwnership";
import { useFlowLiveSession } from "./useFlowLiveSession";

afterEach(() => vi.useRealTimers());

async function setup() {
  vi.useFakeTimers();
  let clock = 1_000;
  let stored: string | null = null;
  const transport: LiveOwnershipTransport = {
    read: () => stored, write: (value) => { stored = value; }, remove: () => { stored = null; },
    publish: () => undefined, subscribe: () => () => undefined, close: () => undefined,
  };
  const owner = new LiveOwnershipCoordinator(transport, { ownerId: "foreground", now: () => clock, leaseMs: 100, heartbeatMs: 1_000, settleMs: 1 });
  const adapter = new FakeRecognitionAdapter();
  const started = vi.spyOn(adapter, "start");
  const final = vi.fn();
  const hook = renderHook(() => useFlowLiveSession(final, () => undefined, [], adapter, "en-US", () => 0, owner));
  act(() => hook.result.current.start());
  await act(async () => { await vi.advanceTimersByTimeAsync(2); });
  expect(hook.result.current.status).toBe("listening");
  return { owner, adapter, final, hook, started, transport, delayHeartbeat: () => { clock += 5_000; } };
}

it("accepts a final transcript after an expired own-winner lease and keeps listening", async () => {
  const session = await setup();
  session.delayHeartbeat();
  expect(session.owner.isOwner()).toBe(false);
  act(() => session.adapter.emitFinal("Start with my voice"));
  expect(session.final).toHaveBeenCalledWith("Start with my voice", expect.any(String));
  expect(session.hook.result.current.lastTranscript).toBe("Start with my voice");
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(session.adapter.startCount).toBe(2);
  session.hook.unmount();
});

it("never renews or accepts a final transcript after a foreign claim or explicit stop", async () => {
  const session = await setup();
  const callbacks = session.started.mock.calls[0]![0];
  const lease = JSON.parse(session.transport.read()!) as LiveLease;
  const foreign = { ...lease, ownerId: "foreign", claimId: "foreign-next", generation: lease.generation + 1, expiresAt: 10_000 };
  session.transport.write(JSON.stringify(foreign));
  act(() => callbacks.onFinal([{ transcript: "Delete everything" }], { utteranceId: "foreign", cycle: 1 }));
  expect(session.final).not.toHaveBeenCalled();
  expect(JSON.parse(session.transport.read()!)).toEqual(foreign);
  await act(async () => { await session.hook.result.current.stop(); });
  const renew = vi.spyOn(session.owner, "renewIfStillWinner");
  act(() => { callbacks.onInterim("stale"); callbacks.onFinal([{ transcript: "stale" }], { utteranceId: "stale", cycle: 1 }); callbacks.onEnd(); });
  expect(renew).not.toHaveBeenCalled();
  expect(session.final).not.toHaveBeenCalled();
  session.hook.unmount();
});

it("restarts an expired quiet session after native end without needing a transcript", async () => {
  const session = await setup();
  session.delayHeartbeat();
  act(() => session.adapter.stop());
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(session.adapter.startCount).toBe(2);
  expect(session.hook.result.current.status).toBe("listening");
  expect(session.final).not.toHaveBeenCalled();
  session.hook.unmount();
});

it("does not renew or process a hidden-page callback", async () => {
  const session = await setup();
  session.delayHeartbeat();
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  const renew = vi.spyOn(session.owner, "renewIfStillWinner");
  try {
    act(() => session.adapter.emitFinal("Start with my voice"));
    expect(renew).not.toHaveBeenCalled();
    expect(session.final).not.toHaveBeenCalled();
    expect(session.adapter.startCount).toBe(1);
  } finally { hidden.mockRestore(); session.hook.unmount(); }
});
