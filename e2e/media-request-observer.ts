import type { Page } from "@playwright/test";
import { correlateNativeFailures, observeNativeRequestClock, type ObservedFailedRequest as FailedRequest } from "./native-request-clock";

interface MediaLifecycle { url: string; type: "source-detached" | "document-unloading"; at: number }
interface NativeMediaEvent { url: string; type: string; at: number; readyState: number; networkState: number; preload: string; paused: boolean; error: string | null }

/** Observe native media lifecycle without replacing a media, URL or network API. */
export async function observeAcceptanceRequests(page: Page) {
  const lifecycle: MediaLifecycle[] = [];
  const failures: FailedRequest[] = [];
  const nativeEvents: NativeMediaEvent[] = [];
  const nativeFailures = await observeNativeRequestClock(page);
  await page.exposeBinding("__acceptanceMediaLifecycle", (_source, event: MediaLifecycle) => lifecycle.push(event));
  await page.exposeBinding("__acceptanceNativeMediaEvent", (_source, event: NativeMediaEvent) => nativeEvents.push(event));
  await page.addInitScript(() => {
    const report = (url: string, type: "source-detached" | "document-unloading") => {
      if (!url.startsWith("blob:")) return;
      void (window as Window & { __acceptanceMediaLifecycle(event: { url: string; type: string; at: number }): Promise<void> }).__acceptanceMediaLifecycle({ url, type, at: Date.now() });
    };
    const mediaUnder = (node: Node) => node instanceof Element
      ? [node, ...node.querySelectorAll("audio, video")].filter((element): element is HTMLMediaElement => element instanceof HTMLMediaElement)
      : [];
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes" && mutation.target instanceof HTMLMediaElement && mutation.oldValue !== mutation.target.getAttribute("src")) report(mutation.oldValue ?? "", "source-detached");
        for (const node of mutation.removedNodes) for (const media of mediaUnder(node)) {
          if (!media.isConnected) report(media.currentSrc || media.src, "source-detached");
        }
      }
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["src"], attributeOldValue: true });
    window.addEventListener("beforeunload", () => {
      for (const media of document.querySelectorAll<HTMLMediaElement>("audio, video")) report(media.currentSrc || media.src, "document-unloading");
    });
    for (const type of ["loadstart", "loadedmetadata", "loadeddata", "canplay", "suspend", "abort", "emptied", "error", "play", "playing", "seeking", "seeked", "pause"]) document.addEventListener(type, (event) => {
      if (!(event.target instanceof HTMLMediaElement)) return;
      const media = event.target;
      void (window as Window & { __acceptanceNativeMediaEvent(event: NativeMediaEvent): Promise<void> }).__acceptanceNativeMediaEvent({ url: media.currentSrc || media.src, type, at: Date.now(), readyState: media.readyState, networkState: media.networkState, preload: media.preload, paused: media.paused, error: media.error?.message ?? null });
    }, true);
  });
  page.on("requestfailed", (request) => failures.push({ url: request.url(), error: request.failure()?.errorText, resourceType: request.resourceType(), at: Date.now(), deliveredAt: Date.now() }));
  return () => {
    const nativeRequests = nativeFailures();
    const calibrated = correlateNativeFailures(failures, nativeRequests);
    return { ...classifyAcceptanceRequests(calibrated, lifecycle, nativeEvents), allFailures: calibrated, nativeRequests, lifecycle, nativeEvents };
  };
}

export function classifyAcceptanceRequests(failures: FailedRequest[], lifecycle: MediaLifecycle[], nativeEvents: NativeMediaEvent[]) {
    const expectedAborts: Array<FailedRequest & ({ reason: "source-disposal"; disposal: MediaLifecycle } | { reason: "metadata-preload-suspended"; suspension: NativeMediaEvent; playable: NativeMediaEvent })> = [];
    const unexpected: FailedRequest[] = [];
    for (const failure of failures) {
      const disposal = lifecycle.find((event) => event.url === failure.url && failure.at >= event.at && failure.at - event.at < 500);
      const related = nativeEvents.filter((event) => event.url === failure.url);
      const healthyPreload = (event: NativeMediaEvent) => event.preload === "metadata" && event.paused && event.readyState === 4 && event.networkState === 1 && event.error === null;
      // Chromium deliberately suspends a metadata-only blob preload after it
      // has decoded enough data. Native events must prove that exact lifecycle;
      // a generic blob abort, failed decode, or active download is not excused.
      const suspension = related.find((event) => event.type === "suspend" && healthyPreload(event) && failure.at >= event.at && failure.at - event.at < 100);
      const playable = related.find((event) => event.type === "canplay" && healthyPreload(event) && Math.abs(failure.at - event.at) < 100);
      const nativeError = related.some((event) => event.type === "error" || event.error !== null);
      if (!failure.nativeRequestId || failure.resourceType !== "media" || failure.error !== "net::ERR_ABORTED" || nativeError) unexpected.push(failure);
      else if (disposal) expectedAborts.push({ ...failure, reason: "source-disposal", disposal });
      else if (failure.url.startsWith("blob:") && suspension && playable) expectedAborts.push({ ...failure, reason: "metadata-preload-suspended", suspension, playable });
      else unexpected.push(failure);
    }
    return { requests: unexpected.map(({ url, error }) => `${url}: ${error}`), expectedAborts };
}
