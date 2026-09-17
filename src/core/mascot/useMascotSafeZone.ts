import { useLayoutEffect, useRef, useState } from "react";

export const HOME_LAYOUT_SETTLED_EVENT = "flow:home-layout-settled";

/** A fixed character is allowed only where its actual footprint stays clear
 * of the Home lenses and persistent controls, including wrapped/short layouts. */
export function useMascotSafeZone(presentationKey: string) {
  const ref = useRef<HTMLDivElement>(null);
  const [safe, setSafe] = useState(false);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const protectedElements = [...document.querySelectorAll<HTMLElement>(
      "[data-elite-lens-grid] > div, [aria-label='Global Flow command'], [data-time-scope-control]",
    )];
    const update = () => {
      const bounds = element.getBoundingClientRect();
      const margin = 16; // Includes the bounded win/acknowledgment movement.
      const inside = bounds.width > 0 && bounds.height > 0 && bounds.left >= margin
        && bounds.right <= innerWidth - margin && bounds.top >= margin && bounds.bottom <= innerHeight - margin;
      const collision = protectedElements.some((control) => {
        const rect = control.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && bounds.left - margin < rect.right && bounds.right + margin > rect.left
          && bounds.top - margin < rect.bottom && bounds.bottom + margin > rect.top;
      });
      setSafe(inside && !collision);
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(update);
    observer?.observe(element);
    protectedElements.forEach((control) => observer?.observe(control));
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    window.addEventListener(HOME_LAYOUT_SETTLED_EVENT, update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener(HOME_LAYOUT_SETTLED_EVENT, update);
    };
  }, [presentationKey]);
  return { ref, safe };
}
