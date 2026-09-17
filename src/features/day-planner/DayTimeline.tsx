import { motion } from "motion/react";
import { useReducedMotionPreference } from "../../shared/motion/useReducedMotionPreference";
import { useEffect, useState } from "react";
import type { CalendarAction, CalendarEvent, DayPlan, PlannerFeedback, TransactionSource } from "./model";
import { EventBlock } from "./EventBlock";
import { BreathingRoomBlock } from "./BreathingRoomBlock";
import { eventStatus } from "./eventDefaults";
import { DAY_END, DAY_START, MINUTE_HEIGHT, formatTime } from "./time";
import { tokens } from "../../shared/design-system/tokens";
import { buildDirectManipulationPreview, type DirectManipulationPreview } from "./directManipulationPreview";
import { CurrentTimeMarker } from "./CurrentTimeMarker";

interface DayTimelineProps {
  plan: DayPlan;
  feedback: PlannerFeedback;
  selected?: CalendarEvent;
  preview?: boolean;
  onSelect: (event: CalendarEvent) => void;
  onAction: (actions: CalendarAction[], source: TransactionSource, transcript: string) => void;
  now?: () => Date;
}

const hours = Array.from({ length: (DAY_END - DAY_START) / 60 + 1 }, (_, index) => DAY_START + index * 60);
const systemNow = () => new Date();

export function DayTimeline({ plan, feedback, selected, preview, onSelect, onAction, now = systemNow }: DayTimelineProps) {
  const reducedMotion = useReducedMotionPreference();
  const [manipulation, setManipulation] = useState<DirectManipulationPreview>();
  const height = (DAY_END - DAY_START) * MINUTE_HEIGHT;
  const renderedPlan = manipulation?.plan ?? plan;
  const renderedFeedback = manipulation
    ? { ...feedback, changedIds: manipulation.changedIds, originById: manipulation.originById, transactionKind: "resize" as const }
    : feedback;
  const liveEvents = renderedPlan.events.filter((event) => eventStatus(event) !== "done" && eventStatus(event) !== "cancelled");
  const doneEvents = renderedPlan.events.filter((event) => eventStatus(event) === "done");

  useEffect(() => setManipulation(undefined), [plan]);

  function previewActions(actions: CalendarAction[] | undefined) {
    const value = now();
    const current = value.getHours() * 60 + value.getMinutes();
    setManipulation(actions ? buildDirectManipulationPreview(plan, actions, current) ?? undefined : undefined);
  }

  function lineageLabel(event: CalendarEvent) {
    if (event.mergedFromIds?.length) return `${event.mergedFromIds.length} merged`;
    if (!event.linkedGroupId) return undefined;
    const group = liveEvents.filter((candidate) => candidate.linkedGroupId === event.linkedGroupId).sort((left, right) => left.start - right.start);
    const index = group.findIndex((candidate) => candidate.id === event.id);
    return group.length > 1 && index >= 0 ? `Part ${index + 1} of ${group.length}` : undefined;
  }

  return (
    <div aria-label="Scrollable day timeline" className={`min-w-0 flex-1 overflow-y-auto overflow-x-hidden ${tokens.surface}`} data-reduced-motion={reducedMotion ? "true" : "false"} role="region" tabIndex={0}>
      <div className="relative ml-[56px] mr-2 mt-4 min-w-0 sm:ml-[72px] sm:mr-6" style={{ height }}>
        <div className={`absolute bottom-0 left-0 top-0 w-px ${tokens.timeline.spine}`} />
        {hours.map((hour) => (
          <div className="absolute left-0 right-0" key={hour} style={{ top: (hour - DAY_START) * MINUTE_HEIGHT }}>
            <span className={`absolute -left-[50px] -translate-y-1/2 text-[11px] font-medium tabular-nums sm:-left-[62px] ${tokens.timeline.hour}`}>{formatTime(hour)}</span>
            <span className={`absolute -left-1 size-2 -translate-y-1/2 rounded-full border ${tokens.timeline.hourDot}`} />
            <span className={`absolute left-3 right-0 h-px ${tokens.timeline.grid}`} />
          </div>
        ))}

        <CurrentTimeMarker now={now} />

        {renderedPlan.endBoundaryMinutes !== undefined && (
          <motion.div className={`absolute left-0 right-0 z-30 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] ${tokens.timeline.boundary}`} initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} style={{ top: (renderedPlan.endBoundaryMinutes - DAY_START) * MINUTE_HEIGHT }}>
            <span className={`size-2 rounded-full ${tokens.timeline.boundaryDot}`} /><span className={`h-px flex-1 border-t border-dashed ${tokens.timeline.boundaryLine}`} /><span>Day ends {formatTime(renderedPlan.endBoundaryMinutes)}</span>
          </motion.div>
        )}

        {renderedFeedback.markerMinutes !== undefined && (
          <motion.div className={`absolute left-0 right-0 z-20 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] ${tokens.timeline.tideMarker}`} initial={reducedMotion ? false : { opacity: 0, scaleX: 0.4 }} animate={{ opacity: 1, scaleX: 1 }} style={{ top: (renderedFeedback.markerMinutes - DAY_START) * MINUTE_HEIGHT, transformOrigin: "left" }}>
            <span className={`size-2 rounded-full ${tokens.timeline.nowDot}`} /><span className={`h-px flex-1 ${tokens.timeline.tideLine}`} /><span>{renderedFeedback.markerLabel ?? "Tide change"}</span>
          </motion.div>
        )}

        {(renderedPlan.breathingRooms ?? []).filter((room) => room.dateKey === renderedPlan.dateKey).map((room) => <BreathingRoomBlock key={room.id} preview={preview} reacting={Boolean(manipulation)} room={room} />)}
        {liveEvents.map((event) => (
          <EventBlock
            anchored={renderedFeedback.anchoredIds?.includes(event.id) ?? false}
            changed={renderedFeedback.changedIds.includes(event.id)}
            event={event}
            key={event.id}
            lineageLabel={lineageLabel(event)}
            manipulationPreview={Boolean(manipulation)}
            onAction={onAction}
            onPreviewActions={previewActions}
            onSelect={onSelect}
            preview={preview}
            selected={selected?.id === event.id}
            transactionKind={renderedFeedback.transactionKind}
          />
        ))}

        {doneEvents.map((event) => (
          <motion.div
            aria-label={`${event.title} completed`}
            className={`absolute -left-2 z-30 flex min-h-6 items-center gap-2 rounded-full border border-[#B8DCCB] bg-[#EEF8F2] px-2 py-1 text-[10px] font-semibold shadow-[0_6px_16px_rgba(39,109,80,0.08)] ${tokens.timeline.done}`}
            data-event-id={event.id}
            data-event-presence="committed"
            data-life-entity-id={event.id}
            data-status="done"
            initial={reducedMotion ? false : { opacity: 1, scale: 0.82, x: -8 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            key={`done-${event.id}`}
            style={{ top: (event.start - DAY_START) * MINUTE_HEIGHT }}
            transition={reducedMotion ? { duration: 0.18 } : { duration: 0.72, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className={`grid size-4 place-items-center rounded-full border ${tokens.timeline.doneDot}`}>✓</span><span className="whitespace-nowrap">{event.title} done</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
