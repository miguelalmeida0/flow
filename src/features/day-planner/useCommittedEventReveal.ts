import { useEffect, useRef } from "react";

/** The calendar reveals a committed card inside its real viewport. It never
 * scrolls for a preview, hydration, or an interim recognition result. */
export function useCommittedEventReveal(transactionId: string | undefined, eventId: string | undefined, applying: boolean, reduced: boolean) {
  const seen = useRef(transactionId);
  useEffect(() => {
    if (!transactionId || seen.current === transactionId || !eventId || applying) return;
    const frame = window.requestAnimationFrame(() => {
      const card = [...document.querySelectorAll<HTMLElement>("[data-week-event-id],button[data-event-id]")].find((element) => (element.dataset.weekEventId ?? element.dataset.eventId) === eventId);
      const viewport = document.querySelector<HTMLElement>("[data-primary-content-rect]");
      if (!card || !viewport) return;
      seen.current = transactionId;
      const bounds = viewport.getBoundingClientRect(), target = card.getBoundingClientRect();
      if (target.top < bounds.top || target.bottom > bounds.bottom) {
        const top = Math.max(0, viewport.scrollTop + target.top - bounds.top - 24);
        if (typeof viewport.scrollTo === "function") viewport.scrollTo({ top, behavior: reduced ? "instant" : "smooth" });
        else viewport.scrollTop = top;
      }
      const week = card.closest<HTMLElement>("[data-testid='week-calendar']");
      if (week) {
        const horizontal = week.getBoundingClientRect();
        if (target.left < horizontal.left || target.right > horizontal.right) week.scrollLeft += target.left - horizontal.left - 48;
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [transactionId, eventId, applying, reduced]);
}
