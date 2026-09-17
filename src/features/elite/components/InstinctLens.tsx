import type { EliteHomeModel, EliteInstinct } from "../eliteViewModel";
import { Icon } from "../../../shared/design-system/Icon";
import { HomeLens } from "./HomeLens";
import { useFlowEnvironment } from "../../../app/FlowEnvironmentProvider";

function InstinctIcon({ item }: { item: EliteInstinct }) {
  const colors = { leaf: "text-flow-green-strong", sun: "text-flow-orange-strong", rain: "text-flow-blue", sunset: "text-flow-orange", clock: "text-flow-violet" };
  return <span className={`grid size-10 shrink-0 place-items-center rounded-full bg-flow-page ${colors[item.icon]}`}><Icon name={item.icon === "clock" ? "clock" : item.icon === "leaf" ? "spark" : item.icon === "sunset" ? "calendar" : "star"} size={23} /></span>;
}

export function InstinctLens({ model }: { model: EliteHomeModel }) {
  const { runCommand, navigate } = useFlowEnvironment();
  return <HomeLens destination="good-to-know" icon={<Icon name="spark" size={28} />} testId="elite-instinct-lens" title="Good to know">
    <div className="mt-7 divide-y divide-flow-border">
      {model.instincts.map((item, index) => <button data-action-id="home.legacy-insight" className="flex min-h-[76px] w-full items-center gap-3 py-4 text-left" data-flow-action="Open insight" key={item.id} onClick={() => runCommand(index === 0 ? "Why this" : "What did you notice", "quick")} type="button"><InstinctIcon item={item} /><span><span className="block text-sm font-medium leading-5 text-flow-ink">{item.title}</span><span className="mt-1 block text-xs text-flow-secondary">{item.detail}</span></span></button>)}
      {!model.instincts.length && <p className="py-8 text-sm leading-6 text-flow-secondary">Nothing urgent. Flow will surface a conclusion only when the facts support it.</p>}
    </div>
    <button data-action-id="home.legacy-navigation" className="mt-3 min-h-11 w-full rounded-full text-xs text-[#52606D] hover:bg-flow-page" data-flow-action="Open Good to know" onClick={() => navigate("good-to-know")} type="button">Open Good to know</button>
  </HomeLens>;
}
