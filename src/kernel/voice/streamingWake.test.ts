import { describe, expect, it } from "vitest";
import { StreamingWake } from "./streamingWake";

describe("streaming lexical wake evidence", () => {
  it.each(["flower", "flowers", "flowchart", "workflow", "overflow", "the flow is steady", "hey flowers", "Flow's timing"])("never activates while %s evolves", text => {
    const wake = new StreamingWake();
    for (let i = 1; i <= text.length; i++) expect(wake.observe(text.slice(0, i))).not.toBe("WAKE_CONFIRMED");
    expect(wake.observe(text, true)).not.toBe("WAKE_CONFIRMED");
  });
  it.each(["Flow,", "Flow.", "Flow can", "Hey Flow, what's on today?", "  hey   Flow, open Calendar"])("accepts an observed boundary in %s", text => {
    const wake = new StreamingWake();
    for (let i = 1; i <= text.length; i++) wake.observe(text.slice(0, i));
    expect(wake.state).toBe("WAKE_CONFIRMED");
  });
  it("does not promote repeated bare prefixes into a lexical boundary", () => {
    const wake = new StreamingWake();
    for (const text of ["F", "Flo", "Flow", "Flow", "Flow", "Flowers"]) expect(wake.observe(text)).not.toBe("WAKE_CONFIRMED");
  });
  it("accepts a bare wake only at authoritative final", () => {
    const wake = new StreamingWake();
    expect(wake.observe("Flow")).toBe("PREFIX_CANDIDATE");
    expect(wake.observe("Flow", true)).toBe("WAKE_CONFIRMED");
  });
  it("re-evaluates corrected partial history and isolates subsequent utterances", () => {
    const wake = new StreamingWake();
    wake.observe("Flowers");
    expect(wake.observe("Flow,")).toBe("WAKE_CONFIRMED");
    wake.reset();
    expect(wake.observe("overflow", true)).toBe("WAKE_REJECTED");
  });
});
