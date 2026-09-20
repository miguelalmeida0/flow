import { describe, it, expect } from "vitest";
import { deriveVoiceInputOwner } from "./voiceOwnership";

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
});
