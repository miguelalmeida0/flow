import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteStudioMedia, getStudioMedia, putStudioMedia, removeOrphanedStudioMedia, retainStudioMedia } from "./mediaRepository";
import { useStudioMediaUrl } from "./useStudioMediaUrl";

afterEach(() => vi.restoreAllMocks());

describe("recording reader lifecycle", () => {
  it("re-reads a durable blob published after the same asset ID was initially empty", async () => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:durable-recording") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    await deleteStudioMedia("late-recording");
    const { result, unmount } = renderHook(() => useStudioMediaUrl("late-recording"));
    await waitFor(() => expect(result.current.missing).toBe(true));
    await act(async () => putStudioMedia("late-recording", new Blob(["test-only lifecycle bytes"], { type: "audio/webm" })));
    await waitFor(() => expect(result.current.url).toBe("blob:durable-recording"));
    expect(result.current.missing).toBe(false);
    await act(async () => deleteStudioMedia("late-recording"));
    await waitFor(() => expect(result.current).toMatchObject({ url: undefined, missing: true, state: "missing" }));
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:durable-recording");
  });
  it("never calls an active or finalizing recording missing", async () => {
    const { result, rerender } = renderHook(({ phase }: { phase: "recording" | "finalizing" }) => useStudioMediaUrl("active-not-yet-written", phase), { initialProps: { phase: "recording" as "recording" | "finalizing" } });
    await act(async () => Promise.resolve());
    expect(result.current).toMatchObject({ state: "recording", missing: false });
    rerender({ phase: "finalizing" });
    await act(async () => Promise.resolve());
    expect(result.current).toMatchObject({ state: "finalizing", missing: false });
  });
  it("serializes chunks and keeps the final complete blob", async () => {
    const writes = ["first", "first second", "first second final"].map((value) => putStudioMedia("ordered-chunks", new Blob([value], { type: "audio/webm" })));
    await Promise.all(writes);
    expect((await getStudioMedia("ordered-chunks"))?.size).toBe("first second final".length);
  });
  it("protects active writers and history references from orphan cleanup", async () => {
    const release = retainStudioMedia("owned-audio");
    await putStudioMedia("owned-audio", new Blob(["owned"], { type: "audio/webm" }));
    await removeOrphanedStudioMedia(new Set());
    expect(await getStudioMedia("owned-audio")).toBeDefined();
    release();
    const historyReferences = new Set(["owned-audio"]);
    await removeOrphanedStudioMedia(() => historyReferences);
    expect(await getStudioMedia("owned-audio")).toBeDefined();
    historyReferences.clear();
    await removeOrphanedStudioMedia(() => historyReferences);
    expect(await getStudioMedia("owned-audio")).toBeUndefined();
  });
});
