import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { eventProtected, eventStatus } from "./eventDefaults";
import type { CalendarAction, CalendarEvent, TransactionSource } from "./model";
import { MINUTE_HEIGHT, duration, formatTime } from "./time";

interface EventInteractionOptions {
  event: CalendarEvent;
  preview?: boolean;
  onSelect: (event: CalendarEvent) => void;
  onAction: (actions: CalendarAction[], source: TransactionSource, transcript: string) => void;
  onPreviewActions?: (actions: CalendarAction[] | undefined) => void;
}

export function useEventBlockInteractions(options: EventInteractionOptions) {
  const { event, preview, onSelect, onAction, onPreviewActions } = options;
  const dragStart = useRef<{ y: number; start: number } | undefined>(undefined);
  const resizeStart = useRef<{ y: number; duration: number } | undefined>(undefined);
  const [dragPreview, setDragPreview] = useState<number>();
  const [resizePreview, setResizePreview] = useState<number>();

  function dispatch(actions: CalendarAction[], source: TransactionSource, transcript: string) {
    if (!preview) onAction(actions, source, transcript);
  }

  function cancelInteraction() {
    dragStart.current = undefined;
    resizeStart.current = undefined;
    setDragPreview(undefined);
    setResizePreview(undefined);
    onPreviewActions?.(undefined);
  }

  function onDragPointerDown(pointer: PointerEvent<HTMLButtonElement>) {
    if (resizeStart.current) return;
    dragStart.current = { y: pointer.clientY, start: event.start };
    pointer.currentTarget.setPointerCapture?.(pointer.pointerId);
  }

  function onDragPointerMove(pointer: PointerEvent<HTMLButtonElement>) {
    if (resizeStart.current) return;
    const start = dragStart.current;
    if (!start) return;
    const clientY = Number.isFinite(pointer.clientY) ? pointer.clientY : start.y;
    const destination = start.start + Math.round((clientY - start.y) / MINUTE_HEIGHT / 5) * 5;
    setDragPreview(destination);
    onPreviewActions?.([{ type: "move", selector: { type: "id", id: event.id }, destination: { type: "absolute", minutes: destination } }]);
  }

  function onDragPointerUp(pointer: PointerEvent<HTMLButtonElement>) {
    const start = dragStart.current;
    dragStart.current = undefined;
    setDragPreview(undefined);
    onPreviewActions?.(undefined);
    if (!start) return;
    const clientY = Number.isFinite(pointer.clientY) ? pointer.clientY : start.y;
    const destination = dragPreview ?? start.start + Math.round((clientY - start.y) / MINUTE_HEIGHT / 5) * 5;
    if (Math.abs(destination - start.start) < 5) return onSelect(event);
    dispatch(
      [{ type: "move", selector: { type: "id", id: event.id }, destination: { type: "absolute", minutes: destination } }],
      "drag",
      `Move ${event.title} to ${formatTime(destination)}`,
    );
  }

  function onResizePointerDown(pointer: PointerEvent<HTMLButtonElement>) {
    pointer.stopPropagation();
    dragStart.current = undefined;
    resizeStart.current = { y: pointer.clientY, duration: duration(event) };
    pointer.currentTarget.setPointerCapture?.(pointer.pointerId);
  }

  function onResizePointerMove(pointer: PointerEvent<HTMLButtonElement>) {
    pointer.stopPropagation();
    const start = resizeStart.current;
    if (!start) return;
    const clientY = Number.isFinite(pointer.clientY) ? pointer.clientY : start.y;
    const next = Math.max(15, start.duration + Math.round((clientY - start.y) / MINUTE_HEIGHT / 5) * 5);
    setResizePreview(next);
    onPreviewActions?.([{ type: "resize", selector: { type: "id", id: event.id }, mode: "set", minutes: next }]);
  }

  function onResizePointerUp(pointer: PointerEvent<HTMLButtonElement>) {
    pointer.stopPropagation();
    const start = resizeStart.current;
    resizeStart.current = undefined;
    setResizePreview(undefined);
    onPreviewActions?.(undefined);
    if (!start) return;
    const clientY = Number.isFinite(pointer.clientY) ? pointer.clientY : start.y;
    const next = resizePreview ?? Math.max(15, start.duration + Math.round((clientY - start.y) / MINUTE_HEIGHT / 5) * 5);
    dispatch([{ type: "resize", selector: { type: "id", id: event.id }, mode: "set", minutes: next }], "resize", `Make ${event.title} ${next} minutes`);
  }

  function onKeyDown(key: KeyboardEvent<HTMLButtonElement>) {
    const protectedEvent = eventProtected(event);
    const status = eventStatus(event);
    if (key.key === "Escape" && (dragStart.current || resizeStart.current)) {
      key.preventDefault();
      cancelInteraction();
    } else if (key.key === "ArrowUp" && key.shiftKey) {
      key.preventDefault();
      dispatch([{ type: "shift", selector: { type: "id", id: event.id }, deltaMinutes: -15 }], "keyboard", `Move ${event.title} 15 minutes earlier`);
    } else if (key.key === "ArrowDown" && key.shiftKey) {
      key.preventDefault();
      dispatch([{ type: "shift", selector: { type: "id", id: event.id }, deltaMinutes: 15 }], "keyboard", `Move ${event.title} 15 minutes later`);
    } else if ((key.key === "ArrowUp" || key.key === "ArrowDown") && key.altKey) {
      key.preventDefault();
      const delta = key.key === "ArrowUp" ? -15 : 15;
      dispatch([{ type: "resize", selector: { type: "id", id: event.id }, mode: "add", minutes: delta }], "keyboard", `${delta < 0 ? "Shorten" : "Extend"} ${event.title} by 15 minutes`);
    } else if (key.key.toLowerCase() === "p") {
      key.preventDefault();
      dispatch([{ type: protectedEvent ? "unprotect" : "protect", selector: { type: "id", id: event.id } }], "keyboard", `${protectedEvent ? "Unprotect" : "Protect"} ${event.title}`);
    } else if (key.key === " " || key.key === "Spacebar") {
      key.preventDefault();
      dispatch(
        status === "active"
          ? [{ type: "complete", selector: { type: "id", id: event.id } }, { type: "reflow", reason: "early-completion" }]
          : [{ type: "update", selector: { type: "id", id: event.id }, patch: { status: "active" } }],
        "keyboard",
        `${status === "active" ? "Complete" : "Start"} ${event.title}`,
      );
    } else if ((key.key === "ArrowUp" || key.key === "ArrowDown") && !key.shiftKey && !key.altKey) {
      key.preventDefault();
      const events = [...document.querySelectorAll<HTMLButtonElement>("button[data-event-id]")];
      const index = events.indexOf(key.currentTarget);
      events[index + (key.key === "ArrowUp" ? -1 : 1)]?.focus();
    }
  }

  return {
    cancelInteraction, dispatch, dragPreview, onDragPointerDown, onDragPointerMove,
    onDragPointerUp, onKeyDown, onResizePointerDown, onResizePointerMove,
    onResizePointerUp, resizePreview,
  };
}
