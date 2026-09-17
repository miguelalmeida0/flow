import { useFlowEnvironment, useFlowTransition } from "../../app/FlowEnvironmentProvider";
import { useCommittedEventReveal } from "./useCommittedEventReveal";
import { classifyDensity } from "./tide/classifyDensity";
import { DayTimeline } from "./DayTimeline";
import { formatTime } from "./time";
import { NowInset } from "../now/NowInset";
import { eventColor, eventImportance } from "./eventDefaults";
import { allCalendarEvents } from "../../domain/life-calendar-world";
import { motion } from "motion/react";
import { useReducedMotionPreference } from "../../shared/motion/useReducedMotionPreference";
import { selectNowWindow } from "../../domain/life-selectors";
import { WorldContinuitySurface } from "../../shared/motion/WorldContinuitySurface";
import { formatCompactScopeDate, formatScopeDate, scopeLabel } from "../elite/temporal";
import { WeekTimeline } from "./WeekTimeline";

export function CalendarSpace() {
  const { snapshot, document, renderedCalendar, calendarPreview, calendarFeedback, selectedCalendarEventId, selectCalendarEvent, dispatchCalendar, currentTime, todayDateKey, temporalScope, setTemporalScope } = useFlowEnvironment();
  const transition = useFlowTransition();
  const selected = renderedCalendar.events.find(({ id }) => id === selectedCalendarEventId);
  const selectedDeferred = allCalendarEvents(document).find(({ id, dateKey }) => id === selectedCalendarEventId && dateKey !== renderedCalendar.dateKey);
  const density = classifyDensity(renderedCalendar);
  const reducedMotion = useReducedMotionPreference();
  useCommittedEventReveal(snapshot.lastTransaction?.id, snapshot.lastTransaction?.primaryEntity?.kind === "calendar-event" ? snapshot.lastTransaction.primaryEntity.id : undefined, Boolean(transition || calendarPreview), reducedMotion);
  const openMinutes = selectNowWindow(document, currentTime).minutes;
  // The header is in the shared layout group: include content above the day
  // whose wrapping/presence can shift every event, but not feedback/rewards.
  const calendarLayout = `${renderedCalendar.dateKey}:${density}:${calendarPreview}:${openMinutes}:${selectedDeferred ? JSON.stringify(selectedDeferred) : ""}:${document.calendar.deferred.map(({ id, title }) => `${id}:${title}`).join("|")}`;
  return <section className="mx-auto flex min-h-full w-full max-w-[1680px] flex-col pb-6 sm:pb-8" data-testid="calendar-space">
    <motion.div className="relative flex min-h-[112px] shrink-0 flex-col items-start justify-end gap-3 overflow-hidden border-b border-[#E7E0D9] px-4 pb-5 pt-6 sm:flex-row sm:items-end sm:justify-between sm:px-7 sm:pb-6 sm:pt-8 lg:px-10 xl:px-12" layout={reducedMotion ? false : "position"} layoutDependency={calendarLayout} data-world-heading>
      <WorldContinuitySurface className="bg-flow-page" destination="today" layoutDependency={calendarLayout} />
      <div className="relative"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#4D91F5]" data-page-eyebrow>{scopeLabel(temporalScope, todayDateKey)} · Tide active</p><h1 className="mt-1 font-serif text-4xl tracking-[-0.045em]">{temporalScope.kind === "week" ? "Breathing Week" : "Breathing Day"}</h1><p className="mt-2 text-xs text-flow-secondary">{temporalScope.kind === "week" ? formatScopeDate(temporalScope) : formatCompactScopeDate(renderedCalendar.dateKey)}</p></div>
      <div className="relative w-full text-left sm:max-w-[48%] sm:text-right"><p className={`text-xs font-semibold ${density === "Overloaded" ? "text-[#C75151]" : density === "Tight" ? "text-[#B77A25]" : "text-flow-green-strong"}`}>{calendarPreview ? "What-if preview" : density}</p>{document.calendar.deferred.length > 0 ? <p className="mt-1 truncate text-xs text-flow-secondary">{document.calendar.deferred.length} planned for later · {document.calendar.deferred.map(({ title }) => title).join(" · ")}</p> : <p className="mt-1 hidden text-xs text-[#8A9097] sm:block">Space is part of the plan.</p>}</div>
    </motion.div>
    <div className="mx-4 mt-3 sm:mx-8"><NowInset compact /></div>
    {selectedDeferred && <div
      className="mx-4 mt-3 flex flex-wrap items-center gap-2 rounded-[16px] border border-[#BED4F4] bg-flow-blue-soft px-4 py-3 text-xs text-[#52606D] sm:mx-8"
      data-color={eventColor(selectedDeferred)}
      data-importance={eventImportance(selectedDeferred)}
      data-life-entity-id={selectedDeferred.id}
      data-testid="calendar-relationship-inspector"
    >
      <span><span className="font-semibold text-[#245D9C]">{selectedDeferred.title}</span> · Planned for {selectedDeferred.dateKey} at {formatTime(selectedDeferred.start)}</span>
      {eventImportance(selectedDeferred) !== "normal" && <span className="rounded-full border border-flow-orange/35 px-2 py-1 font-semibold text-[#8B5422]">{eventImportance(selectedDeferred)}</span>}
      {eventColor(selectedDeferred) !== "neutral" && <span className="rounded-full border border-flow-blue/35 px-2 py-1 font-semibold capitalize text-[#245D9C]">{eventColor(selectedDeferred)}</span>}
    </div>}
    {temporalScope.kind === "week" ? <WeekTimeline document={document} scope={temporalScope} openDay={(dateKey, eventId) => {
      setTemporalScope({ kind: "day", dateKey });
      if (eventId) selectCalendarEvent(eventId);
    }} /> : <DayTimeline feedback={calendarFeedback} onAction={dispatchCalendar} onSelect={(event) => selectCalendarEvent(event.id)} plan={renderedCalendar} preview={calendarPreview} selected={selected} />}
  </section>;
}
