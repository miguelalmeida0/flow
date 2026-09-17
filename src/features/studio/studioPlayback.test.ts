import { afterEach, describe, expect, it, vi } from "vitest";
import { requestStudioPlayback, type StudioPlaybackRequest } from "./studioPlayback";

afterEach(() => vi.useRealTimers());
describe("bound playback readiness request", () => {
  it("accepts one native operation even when duplicate surfaces offer the same target", async () => {
    const play = vi.fn().mockResolvedValue(undefined);
    const listener = (event: Event) => { const { accept } = (event as CustomEvent<StudioPlaybackRequest>).detail; accept(play); accept(play); };
    window.addEventListener("flow-studio-playback", listener);
    try { await requestStudioPlayback({ target: "memory", memoryId: "M1", mode: "play" }); expect(play).toHaveBeenCalledTimes(1); }
    finally { window.removeEventListener("flow-studio-playback", listener); }
  });
  it("rejects a current request if its original target never becomes ready", async () => {
    vi.useFakeTimers();
    const request = requestStudioPlayback({ target: "memory", memoryId: "M1", mode: "play" });
    const assertion = expect(request).rejects.toThrow("has not loaded");
    await vi.advanceTimersByTimeAsync(2000); await assertion;
  });
  it("expires cancelled readiness without playback or a replacement error", async () => {
    vi.useFakeTimers(); let current = true;
    const request = requestStudioPlayback({ target: "journal-playback", entryId: "J1", mode: "play" }, () => current);
    current = false; await vi.advanceTimersByTimeAsync(2000); await expect(request).resolves.toBeUndefined();
  });
});
