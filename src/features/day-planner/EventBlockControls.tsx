import type { KeyboardEventHandler, PointerEventHandler } from "react";
import { Icon } from "../../shared/design-system/Icon";
import { tokens } from "../../shared/design-system/tokens";
import { primaryWorldUiActions } from "../../shared/command/uiActionDescriptors";
import type { CalendarAction, CalendarEvent, TransactionSource } from "./model";

interface EventBlockControlsProps {
  event: CalendarEvent;
  selected: boolean;
  preview?: boolean;
  protectedEvent: boolean;
  status: "planned" | "confirmed" | "active" | "done" | "cancelled";
  dispatch: (actions: CalendarAction[], source: TransactionSource, transcript: string) => void;
  onCancel: () => void;
  onResizeKeyDown: KeyboardEventHandler<HTMLButtonElement>;
  onResizePointerDown: PointerEventHandler<HTMLButtonElement>;
  onResizePointerMove: PointerEventHandler<HTMLButtonElement>;
  onResizePointerUp: PointerEventHandler<HTMLButtonElement>;
}

export function EventBlockControls(props: EventBlockControlsProps) {
  const { event, selected, preview, protectedEvent, status, dispatch, onCancel, onResizeKeyDown, onResizePointerDown, onResizePointerMove, onResizePointerUp } = props;
  const protectionAction = primaryWorldUiActions.today.protectEvent(event.title, protectedEvent);
  return (
    <>
      {selected && !preview && (
        <div className={`absolute right-2 top-1/2 z-20 flex -translate-y-1/2 items-center gap-1 rounded-full border p-1 ${tokens.event.quickShell}`}>
          <button data-action-id="today.protect-event" className={`grid size-11 place-items-center rounded-full ${tokens.event.quickButton}`} data-flow-action={protectionAction.label} onClick={() => dispatch([{ type: protectedEvent ? "unprotect" : "protect", selector: { type: "id", id: event.id } }], "quick", protectionAction.phrase)} title={protectedEvent ? "Unprotect" : "Protect"} type="button"><Icon name="anchor" size={15} /></button>
          <button data-action-id="calendar.complete" className={`grid size-11 place-items-center rounded-full ${tokens.event.completeButton}`} data-flow-action="Complete or reopen event" onClick={() => dispatch([{ type: status === "done" ? "reopen" : "complete", selector: { type: "id", id: event.id } }], "quick", `${status === "done" ? "Reopen" : "Complete"} ${event.title}`)} title={status === "done" ? "Reopen" : "Complete"} type="button"><Icon name="check" size={15} /></button>
        </div>
      )}
      {!preview && (
        <button data-action-id="calendar.resize"
          aria-label="Resize event"
          className={`absolute -bottom-7 right-2 z-20 grid size-11 cursor-ns-resize place-items-center rounded-full transition focus:pointer-events-auto focus:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 ${selected ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"} ${tokens.event.resizeHandle}`}
          data-flow-action="Resize event"
          onKeyDown={onResizeKeyDown}
          onLostPointerCapture={onCancel}
          onPointerCancel={onCancel}
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
          title="Resize event"
          type="button"
        ><span className="mx-auto block h-0.5 w-6 rounded-full bg-current" /></button>
      )}
    </>
  );
}
