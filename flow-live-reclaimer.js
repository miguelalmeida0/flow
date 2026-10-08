const RECLAIM_MESSAGE = "flow-live-reclaim-stale-clients";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("message", (event) => {
  if (event.data?.type !== RECLAIM_MESSAGE) return;
  const sourceId = event.source?.id;
  const requestId = event.data.requestId;
  event.waitUntil((async () => {
    if (!sourceId) {
      event.ports[0]?.postMessage({ type: RECLAIM_MESSAGE, requestId, reclaimedClients: 0 });
      return;
    }
    const windows = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
    let reclaimedClients = 0;
    for (const client of windows) {
      if (client.id === sourceId) continue;
      const url = new URL(client.url);
      if (url.origin !== self.location.origin) continue;
      url.searchParams.set("flow-live-yield", requestId);
      try {
        await client.navigate(url.href);
        reclaimedClients += 1;
      } catch {
        // A client may close between enumeration and navigation.
      }
    }
    event.ports[0]?.postMessage({ type: RECLAIM_MESSAGE, requestId, reclaimedClients });
  })());
});
