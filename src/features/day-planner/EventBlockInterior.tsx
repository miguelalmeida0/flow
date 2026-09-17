import { AnimatePresence, motion } from "motion/react";
import { Icon } from "../../shared/design-system/Icon";
import { tokens } from "../../shared/design-system/tokens";
import { cx } from "../../shared/lib/cx";
import type { CalendarEvent, PlannerFeedback } from "./model";
import { formatRange } from "./time";
import { CalendarParticipants } from "../friends/ParticipantBadges";

interface EventBlockInteriorProps {
  event: CalendarEvent;
  changed: boolean;
  reducedMotion: boolean;
  protectedEvent: boolean;
  importance: "normal" | "important" | "critical";
  mobility: "anchored" | "heavy" | "light" | "fluid";
  status: "planned" | "confirmed" | "active" | "done" | "cancelled";
  transactionKind?: PlannerFeedback["transactionKind"];
  lineageLabel?: string;
}

export function EventBlockInterior(props: EventBlockInteriorProps) {
  const { event, changed, reducedMotion, protectedEvent, importance, mobility, status, transactionKind, lineageLabel } = props;
  return (
    <>
      <AnimatePresence initial={false}>
        {protectedEvent && (
          <motion.span
            aria-hidden="true"
            animate={{ opacity: 1, scaleX: 1 }}
            className={`absolute right-full top-1/2 hidden h-px w-[11%] origin-right sm:block ${tokens.event.mooring}`}
            exit={{ opacity: reducedMotion ? 0 : 0.35, scaleX: 0 }}
            initial={reducedMotion ? false : { opacity: 0.35, scaleX: 0 }}
            key="mooring"
            transition={{ duration: reducedMotion ? 0 : 0.28 }}
          />
        )}
      </AnimatePresence>
      {changed && !reducedMotion && (transactionKind === "paint" || transactionKind === "tide") && (
        <motion.span
          aria-hidden="true"
          animate={{ opacity: 0, scaleX: 1 }}
          className={`absolute inset-0 origin-left ${tokens.event.colorWash}`}
          initial={{ opacity: 0.5, scaleX: 0 }}
          transition={{ duration: 0.38, ease: "easeOut" }}
        />
      )}
      <span className="mr-3 w-1 shrink-0 rounded-full bg-current opacity-70" />
      <span className="flex min-w-0 flex-1 flex-col justify-center py-0.5">
        <span className="flex items-center gap-2">
          {importance !== "normal" && (
            <motion.span data-importance-marker animate={reducedMotion ? { opacity: 1, scale: 1 } : { opacity: 1, rotate: [0, -10, 0], scale: [0.72, 1.12, 1] }} initial={reducedMotion ? false : { opacity: 0, scale: 0.72 }} transition={{ duration: reducedMotion ? 0 : 0.26 }}>
              <Icon className="shrink-0" name="star" size={13} />
            </motion.span>
          )}
          <span className={cx("truncate text-sm tracking-[-0.01em]", importance === "critical" ? "font-bold" : importance === "important" ? "font-semibold" : "font-medium")}>{event.title}</span>
          {status === "done" && <span className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${tokens.event.doneLabel}`}>Done</span>}
          {lineageLabel && <span className={`text-[9px] font-semibold uppercase tracking-[0.1em] ${tokens.event.lineage}`}>{lineageLabel}</span>}
        </span>
        <span className={`mt-0.5 flex items-center gap-2 text-[11px] font-medium tabular-nums ${tokens.event.meta}`}>
          {formatRange(event)}
          {(event.bufferBeforeMinutes ?? 0) > 0 && <span>← {event.bufferBeforeMinutes}m</span>}
          {(event.bufferAfterMinutes ?? 0) > 0 && <span>{event.bufferAfterMinutes}m →</span>}
          {event.labels?.slice(0, 2).map((label) => <span className="rounded-full border border-current/20 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em]" key={label}>{label}</span>)}
        </span>
      </span>
      <span className={`ml-2 flex shrink-0 items-center gap-1 ${tokens.event.meta}`}>
        <CalendarParticipants event={event} />
        {mobility === "anchored" && <Icon className={tokens.event.fixedIcon} name="clock" size={15} />}
        <AnimatePresence initial={false}>
          {protectedEvent && (
            <motion.span
              animate={reducedMotion ? { opacity: 1, y: 0 } : { opacity: 1, y: [-5, 1, 0] }}
              data-protection-marker="anchored"
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -5 }}
              initial={reducedMotion ? false : { opacity: 0, y: -5 }}
              key="anchor"
              transition={{ duration: reducedMotion ? 0 : 0.28 }}
            >
              <Icon className={tokens.event.protectedIcon} name="anchor" size={15} />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
    </>
  );
}
