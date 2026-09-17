import { motion } from "motion/react";
import { useReducedMotionPreference } from "../../shared/motion/useReducedMotionPreference";
import { tokens } from "../../shared/design-system/tokens";
import type { BreathingRoom } from "./model";
import { DAY_START, MINUTE_HEIGHT } from "./time";

export function BreathingRoomBlock({ room, preview = false, reacting = false }: { room: BreathingRoom; preview?: boolean; reacting?: boolean }) {
  const reducedMotion = useReducedMotionPreference();
  const top = (room.start - DAY_START) * MINUTE_HEIGHT;
  const height = Math.max((room.end - room.start) * MINUTE_HEIGHT, 28);
  const duration = room.end - room.start;
  return (
    <motion.div
      aria-label={`${room.label ?? "Breathing room"}, ${duration} minutes`}
      className={`absolute left-2 right-2 z-[5] flex items-center gap-3 px-3 sm:left-[9%] sm:right-[22%] ${tokens.breathingRoom.block} ${preview ? "opacity-60" : ""}`}
      initial={reducedMotion ? false : { opacity: 0, scaleY: 0.4 }}
      animate={reducedMotion || !reacting ? { opacity: 1, scaleY: 1 } : { opacity: 1, scaleY: [1, 0.96, 1] }}
      data-preview-reaction={reacting ? "holding" : "settled"}
      data-room-end={room.end}
      data-room-link={room.linkedEventId ?? ""}
      data-room-relation={room.relation ?? ""}
      data-room-start={room.start}
      data-testid={`breathing-room-${room.id}`}
      data-wave-motion={reducedMotion ? "reduced" : reacting ? "responding" : "settled"}
      style={{ top, height }}
      transition={reducedMotion ? { duration: 0.18 } : { duration: 0.72, ease: "easeInOut" }}
    >
      <span aria-hidden="true" className="relative flex h-full min-h-6 flex-1 items-center">
        <svg className="absolute inset-0 size-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 16">
          <motion.path animate={reducedMotion || !reacting ? { pathLength: 1 } : { pathLength: [0.68, 1] }} className={tokens.timeline.tidePath} d="M 0 8 C 28 2, 68 14, 100 8" fill="none" initial={false} strokeWidth="1" transition={{ duration: reducedMotion ? 0.1 : 0.62, ease: [0.22, 1, 0.36, 1] }} vectorEffect="non-scaling-stroke" />
        </svg>
      </span>
      <span className="flex shrink-0 items-baseline gap-2 text-[10px] font-semibold uppercase tracking-[0.15em]">
        {room.label ?? "Breathing room"}<span className={`font-medium ${tokens.breathingRoom.duration}`}>{duration}m</span>
      </span>
    </motion.div>
  );
}
