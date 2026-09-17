import { useFlowEnvironment } from "../../app/FlowEnvironmentProvider";
import { primaryWorldUiActions } from "../../shared/command/uiActionDescriptors";
import { selectNowWindow } from "../../domain/life-selectors";

export function NowInset({ compact = false }: { compact?: boolean }) {
  const { document, nowCandidates, dispatchEntityView, focusedEntityId, runCommand, currentTime } = useFlowEnvironment();
  const window = selectNowWindow(document, currentTime);
  const candidates = nowCandidates;
  return <section className={`rounded-[20px] border border-[#E8E1DA] bg-flow-elevated shadow-[0_10px_28px_rgba(35,43,55,0.04)] ${compact ? "px-4 py-3" : "p-5"}`} data-now-date={window.dateKey} data-testid="now-space">
    <div className="flex items-center justify-between gap-4">
      <div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4D91F5]">Now{document.calendar.dateKey !== window.dateKey ? " · Today" : ""}</p><h2 className={`${compact ? "text-lg" : "mt-1 font-serif text-2xl"}`}>{window.minutes > 0 ? `${window.minutes} minutes open` : "Stay with what is here"}</h2></div>
      <button data-action-id="now.query" className="min-h-11 rounded-full px-3 text-xs text-[#245D9C] hover:bg-flow-blue-soft" data-flow-action={primaryWorldUiActions.home.whatNeedsMe.label} onClick={() => runCommand(primaryWorldUiActions.home.whatNeedsMe.phrase, "quick")} type="button">What needs me?</button>
    </div>
    {!compact && <div className="mt-4 grid gap-2 sm:grid-cols-3">{candidates.map((candidate) => <button data-action-id="now.open-source" className={`min-h-[68px] rounded-[14px] border p-3 text-left ${focusedEntityId === candidate.id ? "border-flow-blue bg-flow-blue-soft" : "border-[#E8E1DA] bg-white"}`} data-flow-action="Open Now recommendation" key={candidate.id} onClick={() => dispatchEntityView({ type: "entity-view", kind: "recommendation", operation: "open", target: { id: candidate.id } })} type="button"><span className="block text-sm">{candidate.title}</span><span className="mt-1 block text-xs text-flow-secondary">{candidate.minutes}m · {candidate.reason}</span><span className="mt-2 block text-[10px] font-semibold uppercase tracking-[0.14em] text-[#245D9C]">Open</span></button>)}</div>}
  </section>;
}
