import { afterEach, describe, it, expect } from "vitest";
import { deriveVoiceInputOwner } from "./voiceOwnership";

afterEach(() => { delete window.__FLOW_RUNTIME__; });

describe("deriveVoiceInputOwner", () => {
  it("Kyutai ready: kyutai-local owns", () => {
    expect(deriveVoiceInputOwner(true)).toBe("kyutai-local");
  });

  it("Kyutai unavailable: browser-fallback owns", () => {
    expect(deriveVoiceInputOwner(false)).toBe("browser-fallback");
  });

  it("transitions cleanly with no intermediate state: available -> unavailable -> available", () => {
    const sequence = [true, false, true].map(deriveVoiceInputOwner);
    expect(sequence).toEqual(["kyutai-local", "browser-fallback", "kyutai-local"]);
  });

  it("hosted readiness never transfers ownership to a browser or local provider", () => {
    window.__FLOW_RUNTIME__ = { mode: "hosted", inferenceEnabled: true, releaseId: "test" };
    expect([true, false, true].map(deriveVoiceInputOwner)).toEqual(["hosted", "none", "hosted"]);
  });

  it("typed-only and disabled hosted inference have no voice owner", () => {
    window.__FLOW_RUNTIME__ = { mode: "typed-only", inferenceEnabled: true, releaseId: "test" };
    expect(deriveVoiceInputOwner(true)).toBe("none");
    window.__FLOW_RUNTIME__ = { mode: "hosted", inferenceEnabled: false, releaseId: "test" };
    expect(deriveVoiceInputOwner(true)).toBe("none");
  });
});
