import { describe, expect, it } from "vitest";
import { interpretTranscript } from "./interpreter";

const day = "2026-09-08";
describe("September 8 geometry capability slots", () => {
  it.each([
    ["Add Deep Work from nine to eleven", [{ type: "create", title: "deep work", durationMinutes: 120, destination: { type: "absolute", minutes: 540 } }]],
    ["Tomorrow at three add Walk Dog", [{ type: "create", title: "walk dog", destination: { type: "absolute", minutes: 900, date: "tomorrow" } }]],
    ["Make a focus block at two thirty for twenty-five minutes", [{ type: "create", title: "focus block", durationMinutes: 25, destination: { type: "absolute", minutes: 870 } }]],
    ["Finish it at four", [{ type: "resize", selector: { type: "anaphor" }, mode: "end", minutes: 960 }]],
    ["Start it at three and end at four", [{ type: "move", selector: { type: "anaphor" }, destination: { type: "absolute", minutes: 900 } }, { type: "resize", selector: { type: "anaphor" }, mode: "end", minutes: 960 }]],
    ["Add fifteen minutes", [{ type: "resize", selector: { type: "anaphor" }, mode: "add", minutes: 15 }]],
    ["Extend by fifteen minutes", [{ type: "resize", selector: { type: "anaphor" }, mode: "add", minutes: 15 }]],
    ["Flag this as important", [{ type: "update", selector: { type: "selected" }, patch: { importance: "important" } }]],
    ["This is important", [{ type: "update", selector: { type: "selected" }, patch: { importance: "important" } }]],
    ["Add work label", [{ type: "update", selector: { type: "anaphor" }, patch: { addLabels: ["work"] } }]],
    ["Tag this personal", [{ type: "update", selector: { type: "selected" }, patch: { addLabels: ["personal"] } }]],
    ["Never move lunch", [{ type: "protect", selector: { type: "title", query: "lunch" } }]],
    ["This can move now", [{ type: "unprotect", selector: { type: "selected" } }]],
  ])("has exact action slots: %s", (utterance, actions) => {
    const result = interpretTranscript(String(utterance), day);
    expect(result).toMatchObject({ status: "ready", request: { actions } });
    if (result.status === "ready") expect(result.request.actions).toHaveLength(actions.length);
  });
});
