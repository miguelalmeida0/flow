import { describe, expect, it } from "vitest";
import { parseEventReference } from "../day-planner/interpretation/references";
import { readWakeEnvelope, withoutWakePrefix } from "./wakeEnvelope";

describe("Flow wake envelope", () => {
  it.each([
    ["Flow", { kind: "wake" }],
    ["Hey Flow!", { kind: "wake" }],
    ["flow, open my journal", { kind: "wake-command", command: "open my journal" }],
    ["Hey Flow — leave Sunday evening playing", { kind: "wake-command", command: "leave Sunday evening playing" }],
    ["Open my journal", { kind: "none" }],
    ["workflow review", { kind: "none" }],
  ] as const)("classifies %s without substring wake mistakes", (transcript, expected) => {
    expect(readWakeEnvelope(transcript)).toEqual(expected);
  });

  it("unwraps only a real leading wake phrase for the canonical interpreter", () => {
    expect(withoutWakePrefix("Flow, move deep work to three")).toBe("move deep work to three");
    expect(withoutWakePrefix("Hey Flow. Open my journal")).toBe("Open my journal");
    expect(withoutWakePrefix("workflow review")).toBe("workflow review");
    expect(withoutWakePrefix("Flow sleep")).toBe("Flow sleep");
    expect(withoutWakePrefix("Flow Live")).toBe("Flow Live");
  });

  it("keeps ‘the last one’ as a positional calendar reference", () => {
    expect(parseEventReference("the last one")).toEqual({ type: "position", position: "last" });
  });
});
