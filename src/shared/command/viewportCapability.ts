export interface ScrollIntent { type: "scroll"; direction: "up" | "down" | "top" | "bottom"; fraction: number }

export function parseScrollCommand(text: string): ScrollIntent | null {
  if (/^(?:scroll to|go to|back to|take me to) (?:the )?(?:top|beginning)$|^top of (?:the )?page$/.test(text)) return { type: "scroll", direction: "top", fraction: 0 };
  if (/^(?:scroll to|go to|take me to) (?:the )?(?:bottom|end)$|^bottom of (?:the )?page$/.test(text)) return { type: "scroll", direction: "bottom", fraction: 1 };
  const down = /^(?:(?:scroll|go|move|page|continue) (?:the page )?(?:down|lower)(?: a (?:bit|little))?|down a bit|scroll a (?:little|bit lower)|show me what(?:'s| is) below|take me further down|keep going down|next section)$/;
  const up = /^(?:(?:scroll|go|move|page) (?:the page )?(?:back )?(?:up|higher)(?: a (?:bit|little))?|up a little|show me what(?:'s| is) above|keep going up|previous section)$/;
  return down.test(text) || up.test(text) ? { type: "scroll", direction: down.test(text) ? "down" : "up", fraction: /^page /.test(text) ? 0.85 : 0.45 } : null;
}

/** The shell owns the scrolling viewport; navigation must not accidentally
 * scroll a non-scrollable window while the main region stays still. */
export function executeViewportScroll(intent: ScrollIntent, reduced: boolean) {
  const surface = document.querySelector<HTMLElement>("[data-primary-content-rect]") ?? document.scrollingElement;
  if (!surface) return;
  surface.dispatchEvent(new Event("flow-manual-scroll"));
  const top = intent.direction === "top" ? 0 : intent.direction === "bottom" ? surface.scrollHeight
    : surface.scrollTop + surface.clientHeight * intent.fraction * (intent.direction === "up" ? -1 : 1);
  if (typeof surface.scrollTo === "function") surface.scrollTo({ top, behavior: reduced ? "instant" : "smooth" });
  else surface.scrollTop = top;
}
