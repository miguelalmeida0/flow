import { useFlowEnvironment } from "../../../app/FlowEnvironmentProvider";
import type { EliteHomeModel } from "../eliteViewModel";
import { formatTime } from "../../day-planner/time";
import { Icon } from "../../../shared/design-system/Icon";
import { primaryWorldUiActions } from "../../../shared/command/uiActionDescriptors";
import { HomeLens } from "./HomeLens";
import { formatCompactScopeDate } from "../temporal";

const accents = ["bg-flow-blue", "bg-flow-orange", "bg-flow-violet"];

export function TodayLens({ model }: { model: EliteHomeModel }) {
  const { navigate, runCommand } = useFlowEnvironment();
  const available = model.events.filter(({ status }) => status !== "done");
  const preferred = model.scope.kind === "week" ? model.dateKeys.map((dateKey) => available.find((event) => event.dateKey === dateKey)).filter((event): event is NonNullable<typeof event> => Boolean(event)) : [
    available.find(({ start, kind }) => start >= 8 * 60 && start < 12 * 60 && kind === "flexible"),
    available.find(({ start, kind, protected: locked }) => start >= 12 * 60 && (kind === "protected" || locked)),
    available.find(({ start }) => start >= 15 * 60),
  ].filter((event): event is NonNullable<typeof event> => Boolean(event));
  const items = [...new Map([...preferred, ...available].map((event) => [event.id, event])).values()].slice(0, 3);
  const scopeAction = model.scope.kind === "week" ? primaryWorldUiActions.home.seeWeekInToday : primaryWorldUiActions.home.seeFullDay;
  return <HomeLens destination="today" icon={<Icon name="calendar" size={26} />} testId="elite-today-lens" title={model.scope.kind === "week" ? "This week" : "Today"}>
    <div className="mt-2 flex justify-end text-xs text-flow-secondary">{model.scope.kind === "week" ? `${model.dateKeys.length} days · ${model.dateLabel}` : formatCompactScopeDate(model.scope.dateKey)}</div>
    <div className="relative mt-5 space-y-4 pl-[62px] before:absolute before:bottom-1 before:left-[61px] before:top-1 before:w-px before:bg-[#D8DDE5]">
      {items.map((event, index) => <div className="relative" key={event.id}>
        <span className="absolute -left-[62px] top-4 w-11 text-right text-[11px] tabular-nums text-flow-secondary">{model.scope.kind === "week" ? new Intl.DateTimeFormat("en", { weekday: "short" }).format(new Date(`${event.dateKey}T12:00:00`)) : formatTime(event.start)}</span>
        <span className={`absolute -left-[7px] top-[18px] size-2.5 rounded-full ring-4 ring-flow-surface ${accents[index] ?? "bg-flow-green"}`} />
        <button data-action-id="home.legacy-event-open" className={`w-full rounded-[13px] px-3 py-3 text-left transition hover:-translate-y-0.5 ${index === 0 ? "bg-flow-blue-soft" : index === 1 ? "bg-flow-orange-soft" : "bg-flow-violet-soft"}`} data-flow-action="Open Today event" onClick={() => navigate("today")} type="button">
          <span className="block text-[14px] font-medium text-flow-ink">{event.title}</span>
          <span className="mt-1 block text-[11px] text-flow-secondary">{formatTime(event.start)} – {formatTime(event.end)}</span>
        </button>
      </div>)}
      {!items.length && <div className="rounded-[13px] bg-flow-neutral-soft p-4 text-sm text-flow-secondary">This day is open.</div>}
    </div>
    <button data-action-id="home.see-full-day" className="mt-5 flex min-h-11 w-full items-center justify-between rounded-full border border-flow-border px-5 text-sm text-flow-ink transition hover:bg-flow-page" data-flow-action={scopeAction.label} onClick={() => runCommand(scopeAction.phrase, "quick")} type="button"><span>{scopeAction.label}</span><Icon name="arrow-right" size={18} /></button>
  </HomeLens>;
}
