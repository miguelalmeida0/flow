import { describe, it, expect } from "vitest";
import { localCompanionUrl } from "./localCompanionUrl";
describe("local companion destinations", () => {
  it("accepts exact loopback origins and rejects remote hosts, credentials, paths and query strings", () => {
    expect(localCompanionUrl("http://127.0.0.1:8765", "http:")).toBe("http://127.0.0.1:8765");
    expect(localCompanionUrl("ws://localhost:8766", "ws:")).toBe("ws://localhost:8766");
    for (const url of ["https://example.com", "http://127.0.0.1.evil.com", "http://127.0.0.1@evil.com", "http://127.0.0.1:8765/path", "http://127.0.0.1:8765/?token=secret", "http://user:pass@localhost"]) expect(localCompanionUrl(url, "http:")).toBeNull();
  });
});
