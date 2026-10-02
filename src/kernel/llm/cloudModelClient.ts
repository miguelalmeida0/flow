import { getHostedSession, subscribeHostedSession } from "../hostedSessionClient";
import type { ModelCallOutcome } from "./modelClient";
import type { PromptContext } from "./promptBuilder";

export type HostedModelRequest =
  | { version: 1; kind: "interpret"; context: PromptContext }
  | { version: 1; kind: "verify"; rawTranscript: string; interpreterOutputJson: string };
const unavailable = (): ModelCallOutcome => ({ ok: false, reason: "unavailable", message: "Cloud reasoning is unavailable. Typed commands still work." });

export async function cloudInterpretTurn(request: HostedModelRequest, options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {}): Promise<ModelCallOutcome> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  options.signal?.addEventListener("abort", cancel, { once: true });
  if (options.signal?.aborted) cancel();
  const unsubscribe = subscribeHostedSession(session => { if (!session.authenticated || !session.reasoningEnabled) cancel(); });
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    if (controller.signal.aborted) return { ok: false, reason: "cancelled", message: "Cancelled." };
    const session = await getHostedSession({ signal: controller.signal, fetchImpl });
    if (!session.authenticated) return { ok: false, reason: "unauthorized", message: "Activate cloud access to use reasoning. Typed commands still work." };
    if (!session.reasoningEnabled) return unavailable();
    const body = JSON.stringify(request);
    if (new TextEncoder().encode(body).byteLength > 65536) return { ok: false, reason: "rejected", message: "That request is too long. Try a shorter request." };
    const response = await fetchImpl("/api/interpret", { method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error", signal: controller.signal,
      headers: { "Content-Type": "application/json", "X-Flow-CSRF": session.csrf! }, body });
    if (response.status === 401 || response.status === 403) return { ok: false, reason: "unauthorized", message: "Cloud access expired. Activate it again to use reasoning." };
    if (!response.ok) return unavailable();
    if (!response.body || Number(response.headers.get("content-length")) > 65536) return unavailable();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    const cancelReader = () => { void reader.cancel().catch(() => {}); };
    controller.signal.addEventListener("abort", cancelReader, { once: true });
    try {
      while (true) {
        if (controller.signal.aborted) throw new Error("cancelled");
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 65536) throw new Error("response too large");
        chunks.push(value);
      }
    } finally { controller.signal.removeEventListener("abort", cancelReader); await reader.cancel().catch(() => {}); reader.releaseLock(); }
    if (controller.signal.aborted) return { ok: false, reason: "cancelled", message: "Cancelled." };
    const joined = new Uint8Array(bytes); let offset = 0;
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
    const result = JSON.parse(new TextDecoder().decode(joined)) as Record<string, unknown>;
    if (result.ok === true) {
      const value = result.response as Record<string, unknown> | undefined;
      if (!value || typeof value.content !== "string" || value.content.length > 32768 || value.model !== "gpt-4.1-mini-2025-04-14") return unavailable();
      return { ok: true, response: { content: value.content, model: value.model, totalDurationMs: null, loadDurationMs: null, evalCount: null } };
    }
    if (result.ok === false && result.reason === "rejected") return { ok: false, reason: "rejected", message: "Flow couldn't obtain a safe interpretation. Nothing changed." };
    return unavailable();
  } catch { return controller.signal.aborted ? { ok: false, reason: "cancelled", message: "Cancelled." } : { ok: false, reason: "offline", message: "Cloud reasoning could not be reached. Typed commands still work." }; }
  finally { unsubscribe(); options.signal?.removeEventListener("abort", cancel); }
}
