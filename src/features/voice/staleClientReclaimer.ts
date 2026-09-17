const RECLAIM_MESSAGE = "flow-live-reclaim-stale-clients";
const WORKER_URL = "/flow-live-reclaimer.js?v=1";

export interface StaleClientReclaimResult {
  supported: boolean;
  reclaimedClients: number;
  timedOut: boolean;
}

export type VoiceAcquisitionDiagnostic = {
  phase: "claim" | "native-start" | "native-error" | "stale-reclaim";
  at: number;
  detail: string;
};

declare global {
  interface Window { __flowVoiceDiagnostics?: VoiceAcquisitionDiagnostic[] }
}

export function recordVoiceAcquisitionDiagnostic(diagnostic: Omit<VoiceAcquisitionDiagnostic, "at">) {
  const entry = { ...diagnostic, at: Date.now() };
  window.__flowVoiceDiagnostics = [...(window.__flowVoiceDiagnostics ?? []).slice(-31), entry];
  document.documentElement.dataset.flowVoiceAcquisition = JSON.stringify(window.__flowVoiceDiagnostics);
  window.dispatchEvent(new CustomEvent("flow-voice-diagnostic", { detail: entry }));
}

export async function reclaimStaleVoiceClients(timeoutMs = 2_000): Promise<StaleClientReclaimResult> {
  if (!("serviceWorker" in navigator) || typeof MessageChannel !== "function") {
    return { supported: false, reclaimedClients: 0, timedOut: false };
  }
  try {
    const registration = await navigator.serviceWorker.register(WORKER_URL, { scope: "/", updateViaCache: "none" });
    await navigator.serviceWorker.ready;
    const worker = registration.active ?? registration.waiting;
    if (!worker) return { supported: false, reclaimedClients: 0, timedOut: false };
    const requestId = `${Date.now()}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
    return await new Promise<StaleClientReclaimResult>((resolve) => {
      const channel = new MessageChannel();
      let settled = false;
      const finish = (result: StaleClientReclaimResult) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        channel.port1.close();
        resolve(result);
      };
      const timer = window.setTimeout(() => finish({ supported: true, reclaimedClients: 0, timedOut: true }), timeoutMs);
      channel.port1.onmessage = (event: MessageEvent<{ type?: string; requestId?: string; reclaimedClients?: number }>) => {
        if (event.data?.type !== RECLAIM_MESSAGE || event.data.requestId !== requestId) return;
        finish({ supported: true, reclaimedClients: event.data.reclaimedClients ?? 0, timedOut: false });
      };
      worker.postMessage({ type: RECLAIM_MESSAGE, requestId }, [channel.port2]);
    });
  } catch {
    return { supported: false, reclaimedClients: 0, timedOut: false };
  }
}
