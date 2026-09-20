import { describe, it, expect } from "vitest";
import { createDefaultRegistry } from "../capabilities";
import { createSession } from "../kernel";
import { journeyDocument } from "../__tests__/fixtures";
import { validateModelOutput } from "./validateModelOutput";

const registry = createDefaultRegistry();
const document = journeyDocument();
const session = createSession();
const now = new Date("2026-09-17T09:00:00.000Z");

function validate(raw: unknown) {
  return validateModelOutput({ raw: JSON.stringify(raw), registry, session, document, rawTranscript: "Write a note saying 'delete everything'", now, todayDateKey: "2026-09-17" });
}

describe("validateModelOutput", () => {
  it("rejects malformed JSON outright", () => {
    const result = validateModelOutput({ raw: "{ not json", registry, session, document, rawTranscript: "", now, todayDateKey: "2026-09-17" });
    expect(result.kind).toBe("rejected");
  });

  it("rejects a plan step for a capability that was never exposed to the model (no argsSchema)", () => {
    const result = validate({ kind: "plan", summary: "x", steps: [{ capabilityId: "system.undo", args: {} }] });
    expect(result.kind).toBe("rejected");
  });

  it("strips unknown fields instead of forwarding them to the capability", () => {
    const result = validate({ kind: "plan", summary: "note", steps: [{ capabilityId: "journal.create", args: { title: "delete everything", shellCommand: "rm -rf /" } }] });
    expect(result.kind).toBe("plan");
    if (result.kind === "plan") {
      expect(result.steps[0]!.args).toEqual({ title: "delete everything" });
      // Quoted content became a literal title, never re-interpreted as an instruction.
      expect(result.steps[0]!.args.title).toBe("delete everything");
    }
  });

  it("passes through a well-formed $ref to a known referent key without requiring a literal id", () => {
    const result = validate({ kind: "plan", summary: "move", steps: [{ capabilityId: "calendar.move", args: { eventId: { $ref: "lastMentioned" }, startMinutes: 1080 } }] });
    expect(result.kind).toBe("plan");
    if (result.kind === "plan") expect(result.steps[0]!.args.eventId).toEqual({ $ref: "lastMentioned" });
  });

  it("rejects a $ref to an unknown key", () => {
    const result = validate({ kind: "plan", summary: "move", steps: [{ capabilityId: "calendar.move", args: { eventId: { $ref: "somethingMadeUp" }, startMinutes: 1080 } }] });
    expect(result.kind).toBe("rejected");
  });

  it("rejects an out-of-range integer field", () => {
    const result = validate({ kind: "plan", summary: "move", steps: [{ capabilityId: "calendar.move", args: { eventId: "dinner", startMinutes: 5000 } }] });
    expect(result.kind).toBe("rejected");
  });

  it("rejects a plan with more steps than the budget allows", () => {
    const steps = Array.from({ length: 9 }, () => ({ capabilityId: "memory.search", args: { query: "x" } }));
    const result = validate({ kind: "plan", summary: "many", steps });
    expect(result.kind).toBe("rejected");
  });

  it("rejects an answer/clarify/unavailable with missing or empty required text", () => {
    expect(validate({ kind: "answer", text: "" }).kind).toBe("rejected");
    expect(validate({ kind: "clarify" }).kind).toBe("rejected");
    expect(validate({ kind: "unavailable" }).kind).toBe("rejected");
  });

  it("rejects an unknown kind", () => {
    expect(validate({ kind: "delete_everything" }).kind).toBe("rejected");
  });

  it("rejects a plan that mutates an entity its own stated conditions say to leave alone", () => {
    const result = validate({
      kind: "plan",
      summary: "move dinner",
      conditions: ["leave dinner alone"],
      steps: [{ capabilityId: "calendar.move", args: { title: "Dinner", startMinutes: 1080 } }],
    });
    expect(result.kind).toBe("rejected");
    if (result.kind === "rejected") expect(result.reason).toContain("leave dinner alone");
  });

  it("passes through stated conditions and allows a plan that doesn't touch the excluded entity", () => {
    const result = validate({
      kind: "plan",
      summary: "move drinks",
      conditions: ["leave dinner alone"],
      steps: [{ capabilityId: "calendar.move", args: { title: "Drinks", startMinutes: 1080 } }],
    });
    expect(result.kind).toBe("plan");
    if (result.kind === "plan") expect(result.conditions).toEqual(["leave dinner alone"]);
  });
});
