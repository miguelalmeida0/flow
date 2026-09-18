import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { emptyDocument, fixedClock } from "./fixtures";
import {
  desktopOpenApp,
  desktopGetFrontmostApp,
  desktopOpenFile,
  desktopOpenUrl,
  desktopListRecentFiles,
  DESKTOP_ALLOWED_APPS,
} from "../capabilities/desktop";
import * as bridgeClient from "../lib/desktopBridgeClient";
import { DesktopBridgeError, desktopBridgeEvents } from "../lib/desktopBridgeClient";
import type { CapabilityContext } from "../types";

function contextFor(): CapabilityContext {
  return { document: emptyDocument(), navigation: { route: "today" }, memory: [], history: [], historyPointer: -1, clock: fixedClock() };
}

const ORIGINAL_TOKEN_KEY = bridgeClient.DESKTOP_COMPANION_TOKEN_KEY;

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("desktop.openApp validation", () => {
  it("rejects an app not on the allowlist without ever calling fetch", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const ctx = contextFor();

    const message = desktopOpenApp.validate({ app: "Malicious App" as (typeof DESKTOP_ALLOWED_APPS)[number] }, ctx);
    expect(message).toBeTruthy();
    expect(desktopOpenApp.requiresConfirmation({ app: "Finder" }, ctx)).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("accepts every allowlisted app", () => {
    const ctx = contextFor();
    for (const app of DESKTOP_ALLOWED_APPS) {
      expect(desktopOpenApp.validate({ app }, ctx)).toBeNull();
    }
  });
});

describe("desktop capability execute() - synchronous by kernel design", () => {
  it("fails synchronously, with no dispatch, when no companion token is configured", () => {
    const dispatchSpy = vi.spyOn(bridgeClient, "dispatchDesktopCapability");
    const ctx = contextFor();
    const result = desktopOpenApp.execute({ app: "Finder" }, ctx);
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toMatch(/desktop companion/i);
    }
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it("happy path: returns a synchronous pending result and calls dispatchDesktopCapability with the right capability id/args", () => {
    localStorage.setItem(ORIGINAL_TOKEN_KEY, "test-token");
    const dispatchSpy = vi.spyOn(bridgeClient, "dispatchDesktopCapability").mockImplementation(() => {});
    const ctx = contextFor();

    const result = desktopOpenApp.execute({ app: "Finder" }, ctx);

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.data).toMatchObject({ pending: true });
    }
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const [requestId, capabilityId, args] = dispatchSpy.mock.calls[0]!;
    expect(typeof requestId).toBe("string");
    expect(capabilityId).toBe("desktop.openApp");
    expect(args).toEqual({ app: "Finder" });
  });

  it("desktop.getFrontmostApp dispatches with no meaningful args and returns a pending result", () => {
    localStorage.setItem(ORIGINAL_TOKEN_KEY, "test-token");
    const dispatchSpy = vi.spyOn(bridgeClient, "dispatchDesktopCapability").mockImplementation(() => {});
    const ctx = contextFor();

    const result = desktopGetFrontmostApp.execute({}, ctx);
    expect(result.status).toBe("ok");
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy.mock.calls[0]![1]).toBe("desktop.getFrontmostApp");
  });

  it("desktop.openFile and desktop.openUrl forward their narrow args unchanged", () => {
    localStorage.setItem(ORIGINAL_TOKEN_KEY, "test-token");
    const dispatchSpy = vi.spyOn(bridgeClient, "dispatchDesktopCapability").mockImplementation(() => {});
    const ctx = contextFor();

    desktopOpenFile.execute({ path: "/Users/example/Downloads/report.pdf" }, ctx);
    expect(dispatchSpy.mock.calls[0]![1]).toBe("desktop.openFile");
    expect(dispatchSpy.mock.calls[0]![2]).toEqual({ path: "/Users/example/Downloads/report.pdf" });

    desktopOpenUrl.execute({ url: "https://example.com" }, ctx);
    expect(dispatchSpy.mock.calls[1]![1]).toBe("desktop.openUrl");
    expect(dispatchSpy.mock.calls[1]![2]).toEqual({ url: "https://example.com" });
  });

  it("desktop.listRecentFiles forwards dir/limit unchanged", () => {
    localStorage.setItem(ORIGINAL_TOKEN_KEY, "test-token");
    const dispatchSpy = vi.spyOn(bridgeClient, "dispatchDesktopCapability").mockImplementation(() => {});
    const ctx = contextFor();

    desktopListRecentFiles.execute({ dir: "/Users/example/Downloads", limit: 5 }, ctx);
    expect(dispatchSpy.mock.calls[0]![1]).toBe("desktop.listRecentFiles");
    expect(dispatchSpy.mock.calls[0]![2]).toEqual({ dir: "/Users/example/Downloads", limit: 5 });
  });
});

describe("desktop bridge offline surfaces a clear failure via the event channel", () => {
  it("dispatchDesktopCapability emits an 'error' event with a clear message when the network call rejects", async () => {
    localStorage.setItem(ORIGINAL_TOKEN_KEY, "test-token");
    const events: bridgeClient.DesktopBridgeEvent[] = [];
    const unsubscribe = desktopBridgeEvents.on((event) => events.push(event));

    const failingFetch = vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:8765"));

    bridgeClient.dispatchDesktopCapability(
      "req-1",
      "desktop.openApp",
      { app: "Finder" },
      { fetchImpl: failingFetch, pendingMessage: "Opening Finder…" },
    );

    // Immediate synchronous "pending" event.
    expect(events[0]).toMatchObject({ status: "pending", requestId: "req-1", capabilityId: "desktop.openApp" });

    // Let the rejected fetch's microtask chain settle.
    await vi.waitFor(() => {
      expect(events.some((e) => e.status === "error")).toBe(true);
    });

    const errorEvent = events.find((e) => e.status === "error")!;
    expect(errorEvent.message).toMatch(/desktop companion isn't running|companion/i);
    unsubscribe();
  });

  it("dispatchDesktopCapability emits an 'ok' event with a formatted message on success", async () => {
    localStorage.setItem(ORIGINAL_TOKEN_KEY, "test-token");
    const events: bridgeClient.DesktopBridgeEvent[] = [];
    const unsubscribe = desktopBridgeEvents.on((event) => events.push(event));

    const okFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ opened: "Finder" }),
    } as Response);

    bridgeClient.dispatchDesktopCapability(
      "req-2",
      "desktop.openApp",
      { app: "Finder" },
      {
        fetchImpl: okFetch,
        formatSuccessMessage: (data) => `Opened ${(data as { opened: string }).opened}.`,
      },
    );

    await vi.waitFor(() => {
      expect(events.some((e) => e.status === "ok")).toBe(true);
    });

    const okEvent = events.find((e) => e.status === "ok")!;
    expect(okEvent.message).toBe("Opened Finder.");
    expect(okEvent.data).toEqual({ opened: "Finder" });
    unsubscribe();
  });

  it("surfaces DesktopBridgeError.message verbatim on the error event (e.g. unauthorized)", async () => {
    localStorage.setItem(ORIGINAL_TOKEN_KEY, "test-token");
    const events: bridgeClient.DesktopBridgeEvent[] = [];
    const unsubscribe = desktopBridgeEvents.on((event) => events.push(event));

    const unauthorizedFetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) } as Response);

    bridgeClient.dispatchDesktopCapability("req-3", "desktop.openApp", { app: "Finder" }, { fetchImpl: unauthorizedFetch });

    await vi.waitFor(() => {
      expect(events.some((e) => e.status === "error")).toBe(true);
    });
    const errorEvent = events.find((e) => e.status === "error")!;
    expect(errorEvent.message).toMatch(/rejected its session token/i);
    unsubscribe();
  });
});

describe("DesktopBridgeError", () => {
  it("carries a stable error code", () => {
    const err = new DesktopBridgeError("offline", "companion offline");
    expect(err.code).toBe("offline");
    expect(err.message).toBe("companion offline");
  });
});
