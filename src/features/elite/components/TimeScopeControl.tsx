import { Icon } from "../../../shared/design-system/Icon";
import { useFlowEnvironment } from "../../../app/FlowEnvironmentProvider";
import { dateKeyAfter } from "../../day-planner/interpretation/temporal";
import { weekScope } from "../temporal";

export function TimeScopeControl() {
  const { temporalScope, todayDateKey, setTemporalScope, document } = useFlowEnvironment();
  const currentWeek = weekScope(todayDateKey, document.preferences.weekStartsOn);
  const selected = temporalScope.kind === "week" ? temporalScope.dateKey === currentWeek.dateKey && temporalScope.endDateKey === currentWeek.endDateKey ? "week" : "other" : temporalScope.dateKey === todayDateKey ? "today" : temporalScope.dateKey === dateKeyAfter(todayDateKey, 1) ? "tomorrow" : "other";
  return <nav aria-label="Time scope" className="relative flex w-full min-w-0 max-w-[410px] items-center justify-between overflow-x-auto rounded-full border border-flow-border bg-flow-elevated p-1 [scrollbar-width:none] sm:w-auto">
    <button data-action-id="home.date-step" aria-label="Previous day" className="grid size-10 shrink-0 place-items-center rounded-full text-flow-ink hover:bg-flow-neutral-soft" data-flow-action="Previous day" onClick={() => setTemporalScope({ kind: "day", dateKey: dateKeyAfter(temporalScope.dateKey, -1) })} type="button"><Icon name="arrow-left" size={19} /></button>
    {(["today", "tomorrow", "week"] as const).map((item) => <button data-action-id="home.time-scope" aria-current={selected === item ? "date" : undefined} className={`min-h-10 shrink-0 rounded-full px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#245D9C] sm:px-4 sm:text-sm ${selected === item ? "bg-flow-neutral-soft font-semibold text-flow-ink" : "text-[#52606D] hover:text-flow-ink"}`} data-flow-action="Set time scope" key={item} onClick={() => setTemporalScope(item === "today" ? { kind: "day", dateKey: todayDateKey } : item === "tomorrow" ? { kind: "day", dateKey: dateKeyAfter(todayDateKey, 1) } : weekScope(todayDateKey, document.preferences.weekStartsOn))} type="button">{item === "week" ? "This Week" : item[0]!.toUpperCase() + item.slice(1)}</button>)}
    <button data-action-id="home.date-step" aria-label="Next day" className="grid size-10 shrink-0 place-items-center rounded-full text-flow-ink hover:bg-flow-neutral-soft" data-flow-action="Next day" onClick={() => setTemporalScope({ kind: "day", dateKey: dateKeyAfter(temporalScope.dateKey, 1) })} type="button"><Icon name="arrow-right" size={19} /></button>
  </nav>;
}
