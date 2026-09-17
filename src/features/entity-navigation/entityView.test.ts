import { describe, expect, it } from "vitest";
import { parseEntityView } from "./parseEntityView";
import { planEntityView } from "./planEntityView";
import { acceptanceFixture } from "../voice-intelligence/acceptanceFixtures";

describe("entity presentation authority and identity", () => {
  it.each([
    "I wanted to edit Boiler receipt capture", "Don't select the first recommendation", "Could selecting a commitment help?",
    "Edit this capture to My new capture", "Rename Measure shelves step to Next step", "Rename this capture to Open the first recommendation",
  ])("does not acquire editor/selection authority from %s", (text) => expect(parseEntityView(text)).toBeNull());
  it("preserves quoted targets containing a structural-looking delimiter", () => {
    expect(parseEntityView('Edit "Receipt to keep" capture')).toEqual({ type: "entity-view", kind: "capture", operation: "edit", target: { query: "Receipt to keep" } });
  });
  it("uses exact title precedence, not a selected distractor or a partial title", () => {
    const { snapshot, context } = acceptanceFixture("capture-reference");
    snapshot.document.captures[1]!.title = "Boiler receipt copy";
    context.selected = { kind: "capture", id: "C2", at: context.nowMs! };
    const result = planEntityView({ type: "entity-view", kind: "capture", operation: "edit", target: { query: "Boiler receipt" } }, snapshot.document, context, []);
    expect(result).toMatchObject({ status: "ready", id: "C1", editor: { kind: "capture", id: "C1" } });
  });
  it("clarifies duplicate exact titles rather than opening the first editor", () => {
    const { snapshot, context } = acceptanceFixture("capture-reference"), before = structuredClone(snapshot.document);
    snapshot.document.captures[1]!.title = "Boiler receipt"; before.captures[1]!.title = "Boiler receipt";
    expect(planEntityView({ type: "entity-view", kind: "capture", operation: "select", target: { query: "Boiler receipt" } }, snapshot.document, context, [])).toEqual({ status: "clarification", title: "Which capture?", detail: "Boiler receipt (C1) · Boiler receipt (C2)" });
    expect(snapshot.document).toEqual(before);
  });
  it("does not invent a recommendation or restore a missing linked reservation", () => {
    const { snapshot, context } = acceptanceFixture("outcome-scheduled");
    expect(planEntityView({ type: "entity-view", kind: "recommendation", operation: "open", target: { ordinal: 1 } }, snapshot.document, context, [])).toMatchObject({ status: "clarification" });
    snapshot.document.calendar.events = []; snapshot.document.calendars["2026-09-08"]!.events = [];
    expect(planEntityView({ type: "entity-view", kind: "step", operation: "select", target: { id: "S2" } }, snapshot.document, context, [])).toMatchObject({ status: "clarification", title: "That step has no available Calendar reservation" });
  });
  it.each(["capture", "commitment", "plan-step"] as const)("rejects an acquired %s recommendation whose source no longer exists", (source) => {
    const { snapshot, context } = acceptanceFixture("empty-home");
    expect(planEntityView({ type: "entity-view", kind: "recommendation", operation: "open", target: { ordinal: 1 } }, snapshot.document, context,
      [{ id: "deleted-source", title: "Previously visible", source, minutes: 10, reason: "Earlier view" }])).toMatchObject({ status: "clarification" });
  });
});
