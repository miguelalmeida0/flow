import { useFlowEnvironment } from "../../app/FlowEnvironmentProvider";
import { WorldPageShell, warmButton, warmCard, warmQuietButton } from "../../shared/design-system/WorldPageShell";
import { buildEliteHomeModel } from "../elite/eliteViewModel";

export function GoodToKnowSpace() {
  const { document, temporalScope, currentTime, runCommand, selectInsight } = useFlowEnvironment();
  const model = buildEliteHomeModel(document, temporalScope, currentTime);
  return <WorldPageShell destination="good-to-know" eyebrow="Useful conclusions, not noise" title="Good to know" description="Deterministic signals drawn from the schedule, open commitments, and real free windows." testId="good-to-know-space">
    <div className="grid gap-4 md:grid-cols-2">{model.instincts.map((item, index) => <article className={`${warmCard} p-7`} data-insight-id={item.id} key={item.id}><span className="grid size-11 place-items-center rounded-full bg-flow-blue-soft text-[#4D91F5]">✦</span><h3 className="mt-7 font-serif text-3xl tracking-[-0.04em]">{item.title}</h3><p className="mt-3 text-sm text-flow-secondary">{item.detail}</p><p className="mt-7 border-t border-flow-border pt-5 text-xs leading-5 text-flow-muted">{item.provenance}</p>{index === 0 && <div className="mt-5 flex flex-wrap gap-2"><button data-action-id="insight.act" className={warmButton} data-flow-action="Put this in motion" onClick={() => { selectInsight(item.id); runCommand("Put this in motion", "quick"); }} type="button">Put this in motion</button><button data-action-id="insight.explain" className={warmQuietButton} data-flow-action="Why this?" onClick={() => { selectInsight(item.id); runCommand("Why this?", "quick"); }} type="button">Why this?</button></div>}</article>)}{!model.instincts.length && <div className={`${warmCard} p-10 text-center md:col-span-2`}><p className="font-serif text-3xl">Nothing urgent.</p><p className="mt-3 text-sm text-flow-secondary">Flow will surface something only when the local facts support it.</p></div>}</div>
  </WorldPageShell>;
}
