export type FlowRuntimeMode = "local" | "hosted" | "typed-only" | "browser-native";

export interface FlowRuntimeConfig {
  mode: FlowRuntimeMode;
  inferenceEnabled: boolean;
  releaseId: string;
}

declare global {
  interface Window {
    /** Injected by the same-origin gateway before the application module loads. */
    __FLOW_RUNTIME__?: FlowRuntimeConfig;
  }
}

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** No persisted preference can turn a public deployment into a local client. */
export function resolveRuntimeConfig(config: unknown, hostname: string): FlowRuntimeConfig {
  if (config === undefined) {
    const mode = LOCAL_HOSTNAMES.has(hostname.toLowerCase()) ? "local" : "typed-only";
    return { mode, inferenceEnabled: mode === "local", releaseId: "" };
  }
  const value = config && typeof config === "object" ? config as Record<string, unknown> : {};
  const mode = value.mode === "local" || value.mode === "hosted" || value.mode === "typed-only" || value.mode === "browser-native" ? value.mode : "typed-only";
  return {
    mode,
    inferenceEnabled: (mode === "local" || mode === "hosted") && value.inferenceEnabled === true,
    releaseId: typeof value.releaseId === "string" ? value.releaseId : "",
  };
}

export function getRuntimeConfig(): FlowRuntimeConfig {
  return typeof window === "undefined"
    ? resolveRuntimeConfig(undefined, "localhost")
    : resolveRuntimeConfig(window.__FLOW_RUNTIME__, window.location.hostname);
}

export function getRuntimeMode(): FlowRuntimeMode { return getRuntimeConfig().mode; }

/** Browser speech does not grant access to hosted inference or local companions. */
export function isBrowserVoiceAllowed(mode: FlowRuntimeMode = getRuntimeMode()): boolean {
  return mode === "local" || mode === "browser-native";
}

/** Registry construction is shared by prompting, output validation and execution. */
export function isCapabilityAllowed(capabilityId: string, mode: FlowRuntimeMode = getRuntimeMode()): boolean {
  return mode === "local" || !capabilityId.startsWith("desktop.");
}
