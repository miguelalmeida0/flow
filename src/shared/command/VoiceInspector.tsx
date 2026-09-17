import { useEffect, useState } from "react";
import type { FlowCommandTrace } from "../../app/commandTrace";
import { useFlowEnvironment } from "../../app/FlowEnvironmentProvider";

function snapshot() {
  return typeof window === "undefined" ? undefined : window.__FLOW_COMMAND_TRACE__;
}

export function VoiceInspector() {
  const { commandPresentation, dispatchPresentation } = useFlowEnvironment();
  const open = commandPresentation.voiceInspectorOpen;
  const [trace, setTrace] = useState<FlowCommandTrace | undefined>(snapshot);
  const [selectedId, setSelectedId] = useState<string>();

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const update = () => setTrace(selectedId ? window.__FLOW_COMMAND_TRACES__?.find(({ commandId }) => commandId === selectedId) : snapshot());
    window.addEventListener("flow-command-trace", update);
    return () => window.removeEventListener("flow-command-trace", update);
  }, [selectedId]);

  if (!import.meta.env.DEV) return null;
  return <aside className="fixed bottom-3 right-3 z-[80] max-w-[min(92vw,560px)] text-xs text-flow-ink" data-voice-inspector>
    <button data-action-id="diagnostic.voice-inspector" className="ml-auto block min-h-10 rounded-full border border-flow-border bg-flow-elevated px-4 shadow-sm" data-flow-action="Toggle voice inspector" onClick={() => dispatchPresentation({ type: "command-surface", surface: "voice-inspector", open: !open })} type="button">Voice inspector</button>
    {open && <div className="mt-2 max-h-[58vh] overflow-auto rounded-2xl border border-flow-border bg-flow-elevated p-4 shadow-xl">
      <select data-action-id="diagnostic.command-select" className="mb-3 w-full rounded-lg border border-flow-border p-2" aria-label="Inspected command" value={selectedId ?? ""} onChange={(event) => { const id = event.target.value || undefined; setSelectedId(id); setTrace(id ? window.__FLOW_COMMAND_TRACES__?.find(({ commandId }) => commandId === id) : snapshot()); }}><option value="">Latest command</option>{window.__FLOW_COMMAND_TRACES__?.slice(-20).reverse().map((item) => <option key={item.commandId} value={item.commandId}>{item.transcript}</option>)}</select>
      {!trace ? <p className="text-flow-muted">Run a command to inspect deterministic interpretation.</p> : <>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1"><dt className="text-flow-muted">Raw</dt><dd>{trace.transcript}</dd><dt className="text-flow-muted">Normalized</dt><dd>{trace.normalizedInput}</dd><dt className="text-flow-muted">Route · mode</dt><dd>{trace.contextUsed.route} · {trace.contextUsed.activeMode ?? trace.contextUsed.voiceMode ?? "command"}</dd><dt className="text-flow-muted">Selected</dt><dd>{trace.domain} · {typeof trace.intent === "object" && trace.intent && "type" in trace.intent ? String(trace.intent.type) : "unknown"}</dd></dl>
        <div className="mt-4 space-y-2">{trace.candidates.map((item) => <div className="rounded-xl border border-flow-border p-2" key={`${item.definitionId}-${item.intentType}`}><div className="flex justify-between gap-4"><strong>{item.intentType}</strong><span>{item.score}</span></div><p className="mt-1 text-flow-muted">{item.domain} · +{item.positiveEvidence.join(", ") || "none"}{item.negativeEvidence.length ? ` · −${item.negativeEvidence.join(", ")}` : ""}</p></div>)}</div>
        <details className="mt-4"><summary className="cursor-pointer text-flow-muted">Context, authority, recording, delivery</summary><pre className="mt-2 whitespace-pre-wrap break-words text-[10px] leading-4">{JSON.stringify({ commandId: trace.commandId, parentCommandId: trace.parentCommandId, context: trace.contextUsed, social: trace.socialContext, entities: trace.entities, proposedActions: trace.actions, actualActions: trace.actualActions, transactionId: trace.transactionId, pending: trace.pendingAuthority, delivery: trace.delivery, recording: trace.recording, classification: trace.segmentClassification, contentDestination: trace.contentDestination, classificationReason: trace.segmentReason, unresolvedReason: trace.unresolvedReason }, null, 2)}</pre></details>
      </>}
    </div>}
  </aside>;
}
