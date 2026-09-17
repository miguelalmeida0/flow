import type { Page } from "@playwright/test";

/** Shift domain dates while leaving native timers, rAF and WAAPI untouched. */
export async function useNativeAnimationClock(page: Page, date = "2026-09-04T09:32:00") {
  await page.addInitScript((value) => {
    const NativeDate = Date;
    const offset = new NativeDate(value).getTime() - NativeDate.now();
    window.Date = new Proxy(NativeDate, {
      construct: (target, args) => Reflect.construct(target, args.length ? args : [target.now() + offset]),
      apply: (target) => new target(target.now() + offset).toString(),
      get: (target, property, receiver) => property === "now" ? () => target.now() + offset : Reflect.get(target, property, receiver),
    });
  }, date);
}

export async function elapseFocusFixture(page: Page, minutes: number) {
  await page.evaluate((elapsed) => {
    const key = "flow.life.v3";
    const snapshot = JSON.parse(localStorage.getItem(key)!);
    snapshot.revision += 1;
    snapshot.document.focus.active.startedAt = new Date(Date.now() - elapsed * 60 * 1_000).toISOString();
    const serialized = JSON.stringify(snapshot);
    localStorage.setItem(key, serialized);
    window.dispatchEvent(new StorageEvent("storage", { key, newValue: serialized }));
  }, minutes);
}
