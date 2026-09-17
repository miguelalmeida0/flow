import type { Page } from "@playwright/test";

interface NativeRequest {
  requestId: string;
  url: string;
  resourceType: string;
  startedAt: number;
  epochOffsetMs: number;
}
interface NativeFailure extends NativeRequest {
  error: string;
  at: number;
  deliveredAt: number;
  timestampSource: "CDP Network.loadingFailed";
}

export interface ObservedFailedRequest { url: string; error?: string; resourceType: string; at: number; deliveredAt: number; nativeRequestId?: string; timestampSource?: string }

export function correlateNativeFailures(failures: ObservedFailedRequest[], nativeRequests: NativeFailure[]): ObservedFailedRequest[] {
  const sameRequestTuple = (a: ObservedFailedRequest, b: Pick<ObservedFailedRequest, "url" | "resourceType" | "error">) => a.url === b.url && a.resourceType === b.resourceType && a.error === b.error;
  return failures.map((failure) => {
    const matches = nativeRequests.filter((request) => sameRequestTuple(failure, request));
    // Multiple failed ranges can share a blob URL. Without a unique tuple on
    // both transports there is no proven identity; never infer one from FIFO.
    if (matches.length !== 1 || failures.filter((request) => sameRequestTuple(request, failure)).length !== 1) return failure;
    const native = matches[0]!;
    return { ...failure, at: native.at, nativeRequestId: native.requestId, timestampSource: native.timestampSource };
  });
}

/** Browser event time, not when the runner eventually receives its callback.
 * Each request provides its own wallTime/monotonic calibration. No product
 * clock, network request, playback method, or browser state is modified. */
export async function observeNativeRequestClock(page: Page) {
  const session = await page.context().newCDPSession(page);
  const requests = new Map<string, NativeRequest>();
  const failures: NativeFailure[] = [];
  session.on("Network.requestWillBeSent", (event) => requests.set(event.requestId, {
    requestId: event.requestId,
    url: event.request.url,
    resourceType: (event.type ?? "other").toLowerCase(),
    startedAt: event.wallTime * 1000,
    epochOffsetMs: (event.wallTime - event.timestamp) * 1000,
  }));
  session.on("Network.loadingFailed", (event) => {
    const request = requests.get(event.requestId);
    if (request) failures.push({ ...request, resourceType: event.type.toLowerCase(), error: event.errorText, at: request.epochOffsetMs + event.timestamp * 1000, deliveredAt: Date.now(), timestampSource: "CDP Network.loadingFailed" });
  });
  await session.send("Network.enable");
  return () => [...failures];
}
