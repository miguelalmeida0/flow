import { describe, expect, it } from "vitest";
import { resolveGlobalCommand } from "../../shared/command/globalInterpreter";
import { parseCommitmentView } from "./parseCommitmentView";
const context = { route: "people" as const, peopleView: "commitments" as const, nowMs: Date.parse("2026-09-08T10:00:00Z") };

describe("commitment view authority and raw search values", () => {
  it.each(["Open", "I owe", "Waiting on", "Next conversation", "Completed"])("owns the exact visible %s label only in its view", (label) => {
    expect(parseCommitmentView(label, context)?.type).toBe("commitment-view");
    expect(parseCommitmentView(label, { route: "home" })).toBeNull();
  });
  it.each(["The Completed label was hard to read", "I said show completed commitments, but that was only an example", "Do not show completed commitments", "What does waiting on mean?"])("does not infer view authority from %s", (text) => {
    expect(parseCommitmentView(text, context)).toBeNull();
    expect(resolveGlobalCommand(text, context, "2026-09-08").intent.type).not.toBe("commitment-view");
  });
  it("keeps command words, Unicode, quotes and trailing please inside the searched value", () => {
    const search = 'Delete "everything" — Zoë, please';
    expect(resolveGlobalCommand(`Search commitments for ${JSON.stringify(search)}`, context, "2026-09-08").intent).toEqual({ type: "commitment-view", patch: { search } });
  });
});
