import { useLayoutEffect, useRef } from "react";
import type { LifeContext, LifeDocument, PeopleView } from "../domain/life-model";

export interface PageNavigation { id: number; kind: "open" | "back" }
type Position = { top: number; left: number };

export function pageTaskEntity(document: LifeDocument, route: string, context: LifeContext, focusedId?: string, planId?: string, peopleView?: PeopleView) {
  if (route === "people") {
    if (peopleView === "commitments") return document.commitments.some(({ id }) => id === focusedId) ? focusedId : undefined;
    const recipient = context.focusedGroupId ?? context.focusedPersonId;
    if (!recipient) return context.friendsCollection && context.friendsCollection !== "Recent" ? `friends-collection:${context.friendsCollection}` : undefined;
    const note = document.friends?.voiceNotes.find(({ id, recipient: target }) => id === context.activeVoiceNoteId && target.id === recipient);
    return note?.id ?? recipient;
  }
  if (route === "memories") return document.studio.memories.some(({ id }) => id === focusedId) ? focusedId : context.activeMemoryId;
  if (route === "journal") return context.activeJournalEntryId;
  if (route === "outcomes") return planId ?? (document.plans.some(({ id }) => id === focusedId) ? focusedId : undefined);
  if (route === "capture") return document.captures.some(({ id }) => id === focusedId) ? focusedId : undefined;
}

/** Calculate against the actual content viewport, which excludes header/dock. */
export function taskScrollTop(viewport: DOMRect, task: DOMRect, current: number, firstAction?: DOMRect) {
  if (firstAction && firstAction.bottom - task.top > viewport.height) {
    return firstAction.top >= viewport.top && firstAction.bottom <= viewport.bottom ? undefined : Math.max(0, current + firstAction.top - viewport.top - 16);
  }
  const end = firstAction?.bottom ?? Math.min(task.bottom, task.top + 120);
  if (task.top >= viewport.top && end <= viewport.bottom) return undefined;
  return Math.max(0, current + task.top - viewport.top - 16);
}

/** One bounded presentation owner. Entity identity changes are meaningful;
 * transcript, audio position, persistence, and media loading are not tokens. */
export function usePageTaskReveal(route: string, entityId: string | undefined, navigation: PageNavigation, reduced: boolean) {
  const mounted = useRef(false);
  const previousNavigation = useRef(navigation.id);
  const reducedPreference = useRef(reduced); reducedPreference.current = reduced;
  useLayoutEffect(() => {
    const viewport = document.querySelector<HTMLElement>("[data-primary-content-rect]");
    if (!viewport) return;
    const saved = mounted.current && previousNavigation.current !== navigation.id && navigation.kind === "back" ? window.history.state?.flowPagePosition as Position | undefined : undefined;
    previousNavigation.current = navigation.id;
    mounted.current = true;
    let cancelled = false, frame = 0, attempts = 0;
    const key = window.history.state?.flowPageKey ?? crypto.randomUUID();
    window.history.replaceState({ ...window.history.state, flowPageKey: key }, "");
    const remember = () => {
      if (window.history.state?.flowPageKey !== key) return;
      window.history.replaceState({ ...window.history.state, flowPagePosition: { top: viewport.scrollTop, left: viewport.scrollLeft } }, "");
    };
    const cancel = () => { cancelled = true; cancelAnimationFrame(frame); };
    const keyDown = (event: KeyboardEvent) => { if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " ", "Tab"].includes(event.key)) cancel(); };
    const reveal = () => {
      if (cancelled) return;
      const shell = viewport.querySelector<HTMLElement>(`[data-space-shell="${route}"]`);
      if (!shell) { if (++attempts < 12) frame = requestAnimationFrame(reveal); return; }
      // Calendar retains its existing entry behavior and separate committed
      // event owner. No generic entity effect competes with calendar movement.
      const target = entityId ? [...shell.querySelectorAll<HTMLElement>("[data-task-entity-id]")].find((element) => element.dataset.taskEntityId === entityId)
        ?? [...shell.querySelectorAll<HTMLElement>("[data-life-entity-id]")].find((element) => element.dataset.lifeEntityId === entityId) : undefined;
      if (entityId && !target && !saved && ++attempts < 24) { frame = requestAnimationFrame(reveal); return; }
      const task = target ?? shell.querySelector<HTMLElement>('[data-page-task]:not([data-page-task="body"])') ?? shell.querySelector<HTMLElement>("[data-page-task]");
      if (!task && route !== "home" && route !== "today" && ++attempts < 12) { frame = requestAnimationFrame(reveal); return; }
      const bounds = viewport.getBoundingClientRect();
      if (bounds.height <= 0 && ++attempts < 12) { frame = requestAnimationFrame(reveal); return; }
      const first = task && [...task.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),audio[controls]')].find((element) => {
        const rect = element.getBoundingClientRect(); return rect.height > 0 && rect.width > 0 && window.getComputedStyle(element).visibility !== "hidden";
      });
      const top = saved ? saved.top : task ? taskScrollTop(bounds, task.getBoundingClientRect(), viewport.scrollTop, first?.getBoundingClientRect()) : route === "home" || route === "today" ? 0 : undefined;
      if (top !== undefined && Math.abs(viewport.scrollTop - top) > 1) viewport.scrollTo?.({ top, left: saved?.left ?? viewport.scrollLeft, behavior: reducedPreference.current || saved ? "instant" : "auto" });
      remember();
    };
    viewport.addEventListener("scroll", remember, { passive: true });
    viewport.addEventListener("wheel", cancel, { passive: true });
    viewport.addEventListener("touchstart", cancel, { passive: true });
    viewport.addEventListener("pointerdown", cancel, { passive: true });
    viewport.addEventListener("flow-manual-scroll", cancel);
    document.addEventListener("keydown", keyDown);
    const restoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    reveal();
    return () => {
      cancel(); viewport.removeEventListener("scroll", remember); viewport.removeEventListener("wheel", cancel); viewport.removeEventListener("touchstart", cancel); viewport.removeEventListener("pointerdown", cancel); viewport.removeEventListener("flow-manual-scroll", cancel); document.removeEventListener("keydown", keyDown);
      window.history.scrollRestoration = restoration;
    };
  }, [route, entityId, navigation.id, navigation.kind]);
}
