import { callDesktopCapability, DesktopBridgeError } from "../lib/desktopBridgeClient";

/**
 * Client for the companion's `ai.interpretTurn` / `ai.status` capabilities
 * (server/desktop-bridge/index.mjs). Deliberately thin: it reuses
 * `callDesktopCapability`, the same authenticated-localhost primitive every
 * other capability call in this app already goes through, rather than
 * opening a second client/transport just for the model. There is no code
 * path here that can reach anything other than the companion's own
 * `/capability` endpoint — the companion itself is the only process allowed
 * to talk to Ollama (see index.mjs's module doc).
 */

export interface InterpretTurnRequest {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  /** Injectable for tests; forwarded to callDesktopCapability. */
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  /** Benchmark/dev override only — forces a specific allowlisted model for
   * THIS call (server still enforces ALLOWED_MODELS regardless). Never set
   * by any production call site; omitted, the companion uses its own
   * configured DEFAULT_MODEL. Exists so the acceptance corpus can run an
   * apples-to-apples comparison across candidate models without touching
   * the default (see FINAL REPORT's model comparison). */
  model?: string;
}

export interface InterpretTurnResponse {
  content: string;
  model: string;
  totalDurationMs: number | null;
  loadDurationMs: number | null;
  evalCount: number | null;
}

export type ModelCallOutcome =
  | { ok: true; response: InterpretTurnResponse }
  | { ok: false; reason: "not-configured" | "offline" | "unauthorized" | "rejected" | "unavailable" | "cancelled"; message: string };

/** Awaitable, never throws — every failure mode the companion or network can
 * produce is classified into ModelCallOutcome so the coordinator can decide
 * per-reason whether to retry, fall back to "unavailable", or surface a
 * clarification, without a try/catch at every call site. */
export async function interpretTurn(request: InterpretTurnRequest): Promise<ModelCallOutcome> {
  if (request.signal?.aborted) return { ok: false, reason: "cancelled", message: "Cancelled." };
  try {
    const response = await callDesktopCapability<InterpretTurnResponse>(
      "ai.interpretTurn",
      { system: request.system, user: request.user, schema: request.schema, ...(request.model ? { model: request.model } : {}) },
      { fetchImpl: request.fetchImpl },
    );
    if (request.signal?.aborted) return { ok: false, reason: "cancelled", message: "Cancelled." };
    return { ok: true, response };
  } catch (error) {
    if (error instanceof DesktopBridgeError) {
      const reason = error.code === "rejected" ? "unavailable" : error.code;
      return { ok: false, reason, message: error.message };
    }
    return { ok: false, reason: "offline", message: "Could not reach Flow's desktop companion." };
  }
}

export interface ModelStatus {
  /** True only when the configured DEFAULT model is actually installed —
   * never "some allowlisted model happens to be present." When `liveProbe`
   * was requested, also requires that probe to have succeeded — "installed"
   * alone is not proof the model can actually serve a request right now
   * (loading, OOM-killed, and a stuck Ollama process all still show up as
   * "installed"). */
  available: boolean;
  model: string | null;
  defaultModel?: string;
  defaultModelInstalled?: boolean;
  /** null when no live probe was requested; true/false when one ran (see
   * `checkModelStatus`'s `liveProbe` option). */
  liveProbeOk?: boolean | null;
}

/** Best-effort local-model availability check, for the UI's "local model
 * unavailable" state (Rule #9/#12) — never throws. Pass `liveProbe: true`
 * to also perform one real, tiny, bounded chat call proving the selected
 * installed model actually responds, not just that Ollama reports it as
 * present — a stronger, slower check the caller opts into explicitly. */
export async function checkModelStatus(fetchImpl?: typeof fetch, options: { liveProbe?: boolean } = {}): Promise<ModelStatus> {
  try {
    return await callDesktopCapability<ModelStatus>("ai.status", options.liveProbe ? { liveProbe: true } : {}, { fetchImpl });
  } catch {
    return { available: false, model: null, liveProbeOk: options.liveProbe ? false : null };
  }
}
