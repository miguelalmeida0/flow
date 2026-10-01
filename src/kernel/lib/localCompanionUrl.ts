/** Credential-bearing companion traffic is limited to literal loopback hosts. */
export function localCompanionUrl(value: string, protocol: "http:" | "ws:"): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== protocol || !["127.0.0.1", "localhost"].includes(url.hostname)
      || url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    return url.origin;
  } catch { return null; }
}

/** Public Pages is an unpaired demo until production pairing is verified. */
export function localCompanionsAllowed(): boolean {
  return typeof window === "undefined" || ["localhost", "127.0.0.1"].includes(window.location.hostname);
}
