import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

it("requires explicit opt-in on a local production page and survives app navigation", async () => {
  vi.stubGlobal("window", { location: { hostname: "localhost", search: "" } });
  const { voiceDebugEnabled } = await import("./voiceDebug");
  expect(voiceDebugEnabled()).toBe(false);
  window.location.search = "?flowVoiceDebug=1";
  expect(voiceDebugEnabled()).toBe(true);
  window.location.search = "";
  expect(voiceDebugEnabled()).toBe(true);
});

it("never enables voice diagnostics at the public production origin", async () => {
  vi.stubGlobal("window", { location: { hostname: "miguelalmeida0.github.io", search: "?flowVoiceDebug=1" } });
  const { voiceDebugEnabled } = await import("./voiceDebug");
  expect(voiceDebugEnabled()).toBe(false);
});
