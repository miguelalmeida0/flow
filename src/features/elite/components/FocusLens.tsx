import type { EliteHomeModel } from "../eliteViewModel";
import { Icon } from "../../../shared/design-system/Icon";
import { HomeLens } from "./HomeLens";
import { useFlowEnvironment } from "../../../app/FlowEnvironmentProvider";
import { formatTime } from "../../day-planner/time";

export function FocusLens({ model }: { model: EliteHomeModel }) {
  const { document, runCommand, navigate } = useFlowEnvironment();
  const active = document.focus.active;
  const minutes = active?.durationMinutes ?? model.focusWindow.minutes;
  const circumference = 2 * Math.PI * 76;
  const progress = Math.min(0.92, Math.max(0.18, minutes / 60));
  return <HomeLens destination="focus" icon={<span className="grid size-7 place-items-center rounded-full border-2 border-flow-blue text-[13px]">◎</span>} testId="elite-focus-lens" title="Focus">
    <div className="relative mx-auto mt-8 grid size-[210px] place-items-center">
      <svg aria-hidden className="absolute inset-0 -rotate-90" viewBox="0 0 180 180"><circle cx="90" cy="90" fill="none" r="76" stroke="#E8EEF7" strokeWidth="10" /><circle cx="90" cy="90" fill="none" r="76" stroke="#4D91F5" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} strokeLinecap="round" strokeWidth="10" /></svg>
      <div className="relative text-center"><p className="font-serif text-[42px] leading-none text-flow-ink">{model.scope.kind === "week" && !active ? `${Math.round(minutes / 60)} hr` : `${minutes} min`}</p><p className="mx-auto mt-3 max-w-[145px] text-sm leading-5 text-[#4E5967]">{active ? "focus session in motion" : model.scope.kind === "week" ? `of clear focus time across ${model.dateKeys.length} days` : model.focusWindow.sourceTitle ? `available in ${model.focusWindow.sourceTitle}, until ${formatTime(model.focusWindow.end)}` : `of clear focus time before ${model.focusWindow.anchorTitle ?? "your boundary"}`}</p></div>
    </div>
    <button data-action-id="home.legacy-focus" className="mt-5 flex min-h-12 w-full items-center justify-center gap-3 rounded-full border border-flow-border bg-flow-elevated text-sm font-medium text-flow-ink shadow-[0_4px_14px_rgba(35,43,55,0.04)] transition hover:-translate-y-0.5" data-flow-action="Start or stop Focus" onClick={() => runCommand(active ? "Stop focus" : model.scope.kind === "week" ? "Give me 25 minutes this week" : `Give me ${Math.min(25, minutes)} minutes`, "quick")} type="button"><Icon name={active ? "pause" : "play"} size={20} /><span>{active ? "Stop focus" : model.scope.kind === "week" ? "Choose a focus day" : "Start focus"}</span></button>
    <button data-action-id="home.domain-card" className="mt-3 min-h-11 w-full rounded-full text-xs text-[#52606D] hover:bg-flow-page" data-flow-action="Open Focus" onClick={() => navigate("focus")} type="button">Open Focus</button>
  </HomeLens>;
}
