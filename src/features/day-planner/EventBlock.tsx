import { motion } from "motion/react";
import { useReducedMotionPreference } from "../../shared/motion/useReducedMotionPreference";
import { tokens } from "../../shared/design-system/tokens";
import { cx } from "../../shared/lib/cx";
import { canTideMove, eventColor, eventImportance, eventMobility, eventProtected, eventStatus } from "./eventDefaults";
import type { CalendarAction, CalendarEvent, PlannerFeedback, TransactionSource } from "./model";
import { DAY_START, MINUTE_HEIGHT, duration, formatRange, formatTime } from "./time";
import { useEventBlockInteractions } from "./useEventBlockInteractions";
import { EventBlockControls } from "./EventBlockControls";
import { EventBlockInterior } from "./EventBlockInterior";

interface EventBlockProps {
  event: CalendarEvent;
  changed: boolean;
  anchored: boolean;
  selected: boolean;
  preview?: boolean;
  transactionKind?: PlannerFeedback["transactionKind"];
  lineageLabel?: string;
  onSelect: (event: CalendarEvent) => void;
  onAction: (actions: CalendarAction[], source: TransactionSource, transcript: string) => void;
  onPreviewActions?: (actions: CalendarAction[] | undefined) => void;
  manipulationPreview?: boolean;
}

export function EventBlock({ event, changed, anchored, selected, preview, transactionKind, lineageLabel, onSelect, onAction, onPreviewActions, manipulationPreview }: EventBlockProps) {
  const reducedMotion = useReducedMotionPreference();
  const {
    cancelInteraction, dispatch, dragPreview, onDragPointerDown, onDragPointerMove,
    onDragPointerUp, onKeyDown, onResizePointerDown, onResizePointerMove,
    onResizePointerUp, resizePreview,
  } = useEventBlockInteractions({ event, preview, onSelect, onAction, onPreviewActions });
  const top = (event.start - DAY_START) * MINUTE_HEIGHT;
  const height = Math.max(duration(event) * MINUTE_HEIGHT, 38);
  const protectedEvent = eventProtected(event);
  const mobility = eventMobility(event);
  const importance = eventImportance(event);
  const status = eventStatus(event);
  const color = eventColor(event);
  // Snapshot only when this absolute block can change geometry. Motion still
  // observes viewport resize; feedback/reward changes do not move the block.
  const layoutDependency = `${event.dateKey}:${top}:${height}:${mobility}:${protectedEvent}:${selected}:${dragPreview}:${resizePreview}`;

  return (
    <motion.div
      className={cx(
        "group absolute left-2 right-2 sm:left-[9%]",
        selected ? "z-30" : "z-10",
        protectedEvent ? "sm:right-[13%]" : mobility === "anchored" ? "sm:right-[22%]" : "sm:right-[28%]",
      )}
      initial={false}
      data-calendar-event-continuity={event.id}
      layoutDependency={layoutDependency}
      layoutId={reducedMotion ? undefined : `calendar-event-${event.id}`}
      style={{ top, height }}
      transition={reducedMotion ? { duration: 0.1 } : { layout: { duration: 0.48, ease: [0.22, 1, 0.36, 1] } }}
    >
      <motion.button data-action-id="calendar.inspect" data-additional-action-ids="calendar.move"
        aria-label={`${event.title}, ${formatRange(event)}, ${importance} importance, ${mobility} mobility, ${protectedEvent ? "protected" : "unprotected"}, ${status}, ${color}${event.labels?.length ? `, labels ${event.labels.join(" and ")}` : ""}`}
        aria-pressed={selected}
        className={cx(
          "relative flex size-full min-h-11 touch-none overflow-hidden text-left",
          tokens.event.base,
          tokens.event[color],
          selected && tokens.event.focused,
          preview && tokens.event.ghost,
          status === "done" && "opacity-55",
          anchored && tokens.event.anchoredRing,
        )}
        data-color={color}
        data-flow-action="Select or move event"
        data-event-id={event.id}
        data-event-presence="committed"
        data-kind={event.kind}
        data-life-entity-id={event.id}
        data-importance={importance}
        data-buffer-after={event.bufferAfterMinutes ?? 0}
        data-buffer-before={event.bufferBeforeMinutes ?? 0}
        data-linked-group={event.linkedGroupId ?? ""}
        data-merged-from={(event.mergedFromIds ?? []).join(",")}
        data-mobility={mobility}
        data-preview={String(Boolean(preview))}
        data-protected={String(protectedEvent)}
        data-status={status}
        data-interaction-state={dragPreview !== undefined ? "dragging" : resizePreview !== undefined ? "resizing" : "settled"}
        data-manipulation-preview={String(Boolean(manipulationPreview))}
        data-motion-kind={reducedMotion ? "reduced" : transactionKind ?? "settled"}
        data-transaction-kind={transactionKind ?? "settled"}
        initial={reducedMotion || !transactionKind ? false : transactionKind === "split" ? { opacity: 0, scaleX: 0.58, x: -16 } : transactionKind === "merge" ? { opacity: 0, scale: 0.82 } : { opacity: 0, scale: 0.98 }}
        animate={{
          height: resizePreview === undefined ? "100%" : Math.max(resizePreview * MINUTE_HEIGHT, 38),
          opacity: status === "done" ? 0.55 : 1,
          scale: 1,
          y: dragPreview === undefined || !canTideMove(event) ? 0 : (dragPreview - event.start) * MINUTE_HEIGHT,
        }}
        onClick={() => onSelect(event)}
        onKeyDown={onKeyDown}
        onPointerDown={onDragPointerDown}
        onPointerMove={onDragPointerMove}
        onPointerCancel={cancelInteraction}
        onLostPointerCapture={cancelInteraction}
        onPointerUp={onDragPointerUp}
        transition={reducedMotion ? { duration: 0.18 } : { type: "spring", stiffness: 330, damping: 34, mass: 0.82 }}
        type="button"
      >
        <EventBlockInterior
          changed={changed}
          event={event}
          importance={importance}
          lineageLabel={lineageLabel}
          mobility={mobility}
          protectedEvent={protectedEvent}
          reducedMotion={Boolean(reducedMotion)}
          status={status}
          transactionKind={transactionKind}
        />
      </motion.button>

      {(dragPreview !== undefined || resizePreview !== undefined) && (
        <span aria-live="polite" className={`absolute -top-7 right-2 rounded-full border px-2 py-1 text-[10px] font-semibold tabular-nums ${tokens.event.liveValue}`}>
          {dragPreview !== undefined
            ? canTideMove(event)
              ? `Moving to ${formatTime(dragPreview)}`
              : `${protectedEvent ? "Protected" : "Anchored"} — release to request ${formatTime(dragPreview)}`
            : `${resizePreview} minutes`}
        </span>
      )}

      <EventBlockControls
        dispatch={dispatch}
        event={event}
        onCancel={cancelInteraction}
        onResizeKeyDown={(key) => { if (key.key === "Escape") { key.preventDefault(); cancelInteraction(); } }}
        onResizePointerDown={onResizePointerDown}
        onResizePointerMove={onResizePointerMove}
        onResizePointerUp={onResizePointerUp}
        preview={preview}
        protectedEvent={protectedEvent}
        selected={selected}
        status={status}
      />
    </motion.div>
  );
}
