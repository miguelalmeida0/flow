import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultRegistry } from "./index";
import { describeCapabilitiesForModel, renderCapabilitiesForPrompt } from "../llm/capabilityModel";
import { validateModelOutput } from "../llm/validateModelOutput";
import { createEnvironment, createSession, submit } from "../kernel";
import { journeyDocument, fixedClock } from "../__tests__/fixtures";
import { callDesktopCapability, checkDesktopCompanionHealth, getDesktopCompanionToken } from "../lib/desktopBridgeClient";
import { checkModelStatus, interpretTurn } from "../llm/modelClient";
import { deriveVoiceInputOwner } from "../voice/voiceOwnership";
import { desktopOpenFile } from "./desktop";

afterEach(() => { delete window.__FLOW_RUNTIME__; localStorage.clear(); vi.restoreAllMocks(); });

describe.each(["hosted", "typed-only", "browser-native"] as const)("%s boundaries", (mode) => {
  function configure() {
    window.__FLOW_RUNTIME__ = { mode, inferenceEnabled: false, releaseId: "test" };
    localStorage.setItem("flow.desktopCompanion.token", "stale-token");
  }
  it("excludes desktop actions from the registry and prompt", () => {
    configure();
    const registry = createDefaultRegistry();
    expect(registry.has("calendar.move")).toBe(true);
    expect(registry.list("desktop")).toEqual([]);
    expect(renderCapabilitiesForPrompt(describeCapabilitiesForModel(registry))).not.toContain("desktop.");
  });
  it("rejects model and direct kernel desktop actions before network or mutation", () => {
    configure();
    const registry = createDefaultRegistry(), document = journeyDocument(), session = createSession();
    const steps = [{ capabilityId: "desktop.openFile", args: { path: "/tmp/example.txt" } }];
    expect(validateModelOutput({ raw: JSON.stringify({ kind: "plan", summary: "open file", steps }), registry, document, session, rawTranscript: "open file", now: fixedClock().now(), todayDateKey: "2026-09-17" }).kind).toBe("rejected");
    const env = createEnvironment(registry, document, { route: "today" }, fixedClock());
    const result = submit(env, session, "open file", steps);
    expect(result.outcome.status).toBe("error");
    expect(result.env.document).toEqual(document);
    // Even a caller holding a capability reference from a local registry
    // cannot bypass the token/client guard after selecting a hosted runtime.
    expect(desktopOpenFile.execute({ path: "/tmp/example.txt" }, {
      document, navigation: env.navigation, memory: [], history: [], historyPointer: -1, clock: env.clock,
    }).status).toBe("error");
  });
  it("blocks direct desktop calls and health checks despite stored tokens", async () => {
    configure();
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ available: true }) });
    expect(getDesktopCompanionToken()).toBeNull();
    await expect(callDesktopCapability("desktop.openFile", {}, { fetchImpl })).rejects.toMatchObject({ code: "not-configured" });
    expect(await checkDesktopCompanionHealth({ fetchImpl })).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("keeps model probes and voice ownership within the selected runtime", async () => {
    configure();
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ available: true }) });
    expect(await checkModelStatus(fetchImpl)).toMatchObject({ available: false });
    expect(await interpretTurn({ system: "s", user: "u", schema: {}, fetchImpl })).toMatchObject({ ok: false, reason: "unavailable" });
    expect(deriveVoiceInputOwner(false)).toBe(mode === "browser-native" ? "browser-fallback" : "none");
    if (mode === "hosted") {
      expect(fetchImpl).toHaveBeenCalledOnce();
      expect(fetchImpl).toHaveBeenCalledWith("/api/session", expect.objectContaining({ credentials: "same-origin", redirect: "error" }));
    } else expect(fetchImpl).not.toHaveBeenCalled();
  });
});

it("preserves the default localhost registry", () => {
  expect(createDefaultRegistry().has("desktop.openFile")).toBe(true);
});

it("forwards cancellation to the local model transport and reports cancelled", async () => {
  localStorage.setItem("flow.desktopCompanion.token", "local-token");
  const controller = new AbortController();
  const fetchImpl = vi.fn(async (_url: RequestInfo | URL, options?: RequestInit) => {
    expect(options?.signal).toBe(controller.signal);
    controller.abort();
    throw new DOMException("Aborted", "AbortError");
  });
  expect(await interpretTurn({ system: "s", user: "u", schema: {}, fetchImpl, signal: controller.signal }))
    .toMatchObject({ ok: false, reason: "cancelled" });
});
