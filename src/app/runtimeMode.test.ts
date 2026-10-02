import { afterEach, describe, expect, it } from "vitest";
import { getRuntimeConfig, resolveRuntimeConfig } from "./runtimeMode";

afterEach(() => { delete window.__FLOW_RUNTIME__; localStorage.clear(); });

describe("runtime mode", () => {
  it.each(["localhost", "127.0.0.1", "[::1]", "::1"])("retains local startup on %s", (hostname) => {
    expect(resolveRuntimeConfig(undefined, hostname).mode).toBe("local");
  });
  it.each(["flow.example", "localhost.example", "192.168.1.2", ""])("defaults %s to typed-only", (hostname) => {
    expect(resolveRuntimeConfig(undefined, hostname)).toMatchObject({ mode: "typed-only", inferenceEnabled: false });
  });
  it("accepts server-injected hosted configuration even on a local staging host", () => {
    expect(resolveRuntimeConfig({ mode: "hosted", inferenceEnabled: true, releaseId: "candidate-1" }, "localhost"))
      .toEqual({ mode: "hosted", inferenceEnabled: true, releaseId: "candidate-1" });
  });
  it("fails closed on malformed configuration and nonboolean inference flags", () => {
    expect(resolveRuntimeConfig({ mode: "unknown" }, "localhost").mode).toBe("typed-only");
    expect(resolveRuntimeConfig({ mode: "hosted", inferenceEnabled: "true" }, "flow.example").inferenceEnabled).toBe(false);
  });
  it("never selects local mode from stored settings or companion credentials", () => {
    window.__FLOW_RUNTIME__ = { mode: "hosted", inferenceEnabled: false, releaseId: "candidate-2" };
    localStorage.setItem("flow.runtimeMode", "local");
    localStorage.setItem("flow.desktopCompanion.token", "old-token");
    expect(getRuntimeConfig().mode).toBe("hosted");
  });
});
