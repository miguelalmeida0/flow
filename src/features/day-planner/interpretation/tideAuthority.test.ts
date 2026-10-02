import { describe, expect, it } from "vitest";
import { parseTideClause } from "./tideInterpreter";
import { interpretTranscript } from "../parser";

describe("explicit let movement authority", () => {
  it.each(["Let's discuss a red fox in the garden", "Let's imagine a red fox tomorrow", "Let someone discuss a red fox"])("does not infer an event update from prose: %s", (text) => {
    expect(parseTideClause(text.toLowerCase(), "2026-09-05")).toBeNull();
    expect(interpretTranscript(text, "2026-09-05").status).not.toBe("ready");
  });
  it("retains the supported let email flow command", () => {
    expect(parseTideClause("let email flow", "2026-09-05")).toMatchObject({ actions: [{ type: "update", patch: { mobility: "fluid" } }] });
  });
});
