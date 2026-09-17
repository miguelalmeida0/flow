import { useCallback, useEffect, useRef, useState } from "react";
import type { CommandFeedback } from "../../app/environment-types";

export function useCommandSurface(actionable: boolean, phase: CommandFeedback["phase"], resultKey: string, compact = false, revealResult = true, request?: { open: boolean; sequence: number }, requestSurface?: (open: boolean) => void) {
  const [expanded, setExpanded] = useState(!compact);
  const inputRef = useRef<HTMLInputElement>(null);
  const recedeTimer = useRef<number | undefined>(undefined);
  const lastResult = useRef(resultKey);
  const dismissedResult = useRef<string | undefined>(undefined);
  const stayOpen = useCallback((focus = false) => {
    window.clearTimeout(recedeTimer.current); recedeTimer.current = undefined;
    setExpanded(true);
    // The shell owns its scrollable main region. Focusing the reserved dock
    // must not ask the browser to scroll the outer document while it expands.
    if (focus) window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  }, []);
  useEffect(() => {
    if (!request) return;
    if (request.open) { dismissedResult.current = undefined; stayOpen(true); }
    else { dismissedResult.current = resultKey; setExpanded(false); }
    // A request is a one-shot effect. Later results must be allowed to reveal
    // themselves without replaying an earlier close request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, stayOpen]);
  useEffect(() => {
    if (phase === "completed" && resultKey !== lastResult.current) {
      if (revealResult && dismissedResult.current !== resultKey) setExpanded(true);
      lastResult.current = resultKey;
    }
    if (["completed", "ready", "listening"].includes(phase) && !actionable) {
      window.clearTimeout(recedeTimer.current);
      recedeTimer.current = window.setTimeout(() => {
        if (document.activeElement !== inputRef.current) setExpanded(false);
      }, phase === "completed" ? 1_500 : 850);
    } else if (actionable) {
      window.clearTimeout(recedeTimer.current); recedeTimer.current = undefined; setExpanded(true);
    }
  }, [actionable, phase, resultKey, revealResult]);
  useEffect(() => {
    function reopen(event: KeyboardEvent) {
      const editing = event.target instanceof Element && event.target.matches("input, textarea, [contenteditable='true']");
      if ((event.key === "/" && !editing) || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k")) {
        event.preventDefault(); if (requestSurface) requestSurface(true); else stayOpen(true);
      } else if (event.key === "Escape" && expanded && !actionable) { if (requestSurface) requestSurface(false); else setExpanded(false); }
    }
    window.addEventListener("keydown", reopen);
    return () => window.removeEventListener("keydown", reopen);
  }, [actionable, expanded, stayOpen, requestSurface]);
  useEffect(() => () => window.clearTimeout(recedeTimer.current), []);

  return { expanded, inputRef, stayOpen };
}
