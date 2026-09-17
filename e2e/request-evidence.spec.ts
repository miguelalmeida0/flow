import { expect, test } from "@playwright/test";
import { correlateNativeFailures } from "./native-request-clock";
import { classifyAcceptanceRequests } from "./media-request-observer";
import { mergeEvidenceRows } from "./motion-evidence-merge";

test("motion evidence survives worker replacement without inventing missing checkpoints or replacing provenance", () => {
  const firstWorker = [{ path: "desktop/00.png", at: 100 }, { path: "desktop/20.png", at: 120 }];
  const failedWorker = [{ path: "laptop/00.png", at: 200 }];
  const lastWorker = [{ path: "mobile/00.png", at: 300 }, { path: "mobile/20.png", at: 320 }];
  const partial = mergeEvidenceRows(firstWorker, failedWorker, (row) => row.path);
  const complete = mergeEvidenceRows(partial, lastWorker, (row) => row.path);
  expect(complete).toEqual([...firstWorker, ...failedWorker, ...lastWorker]);
  expect(mergeEvidenceRows(complete, lastWorker, (row) => row.path)).toEqual(complete);
  expect(complete.some((row) => row.path === "laptop/20.png")).toBe(false);
  expect(() => mergeEvidenceRows(complete, [{ path: "laptop/00.png", at: 900 }], (row) => row.path)).toThrow("Conflicting motion evidence");
  expect(firstWorker).toEqual([{ path: "desktop/00.png", at: 100 }, { path: "desktop/20.png", at: 120 }]);
});

test("native request timing rejects ambiguous range identities instead of assuming FIFO", () => {
  const observed = { url: "blob:http://127.0.0.1/audio", error: "net::ERR_ABORTED", resourceType: "media", at: 1240, deliveredAt: 1240 };
  const native = { ...observed, at: 1003, requestId: "native-1", startedAt: 980, epochOffsetMs: 100, timestampSource: "CDP Network.loadingFailed" as const };
  expect(correlateNativeFailures([observed], [native])).toEqual([{ ...observed, at: 1003, nativeRequestId: "native-1", timestampSource: "CDP Network.loadingFailed" }]);
  expect(correlateNativeFailures([observed], [native, { ...native, requestId: "native-2", at: 1004 }])).toEqual([observed]);
  expect(correlateNativeFailures([observed, { ...observed, at: 1250 }], [native])).toEqual([observed, { ...observed, at: 1250 }]);
  for (const unmatched of [{ ...native, url: "blob:another" }, { ...native, resourceType: "fetch" }, { ...native, error: "net::ERR_FAILED" }]) {
    expect(correlateNativeFailures([observed], [unmatched])).toEqual([observed]);
  }
  expect(correlateNativeFailures([observed], [])).toEqual([observed]);
});

test("native media exceptions require proven healthy preload or preceding exact-source disposal", () => {
  const failure = { url: "blob:http://127.0.0.1/audio", error: "net::ERR_ABORTED", resourceType: "media", at: 1001, deliveredAt: 1240, nativeRequestId: "native-1" };
  const healthy = { url: failure.url, type: "suspend", at: 1000, preload: "metadata", paused: true, readyState: 4, networkState: 1, error: null };
  const events = [healthy, { ...healthy, type: "canplay" }];
  expect(classifyAcceptanceRequests([failure], [], events)).toMatchObject({ requests: [], expectedAborts: [{ reason: "metadata-preload-suspended" }] });
  for (const patch of [{ error: "decode failed" }, { networkState: 2 }, { readyState: 1 }, { preload: "auto" }, { paused: false }, { url: "blob:unrelated" }, { at: 0 }]) {
    expect(classifyAcceptanceRequests([failure], [], events.map((event) => ({ ...event, ...patch })))).toMatchObject({ requests: [expect.any(String)], expectedAborts: [] });
  }
  for (const patch of [{ nativeRequestId: undefined }, { resourceType: "fetch" }, { error: "net::ERR_FAILED" }]) {
    expect(classifyAcceptanceRequests([{ ...failure, ...patch }], [], events)).toMatchObject({ requests: [expect.any(String)], expectedAborts: [] });
  }
  const disposal = { url: failure.url, type: "source-detached" as const, at: 1000 };
  expect(classifyAcceptanceRequests([failure], [disposal], [])).toMatchObject({ requests: [], expectedAborts: [{ reason: "source-disposal" }] });
  for (const patch of [{ at: 1200 }, { at: 0 }, { url: "blob:unrelated" }]) {
    expect(classifyAcceptanceRequests([failure], [{ ...disposal, ...patch }], [])).toMatchObject({ requests: [expect.any(String)], expectedAborts: [] });
  }
  expect(classifyAcceptanceRequests([failure], [disposal], [{ ...healthy, type: "error", error: "decode failed" }])).toMatchObject({ requests: [expect.any(String)], expectedAborts: [] });
});
