import { expect, it } from "vitest";
import { echoPrefixLength } from "./speechEcho";

it("permits one small recognition variation only inside a long known echo prefix", () => {
  const expected = "say confirm to continue or cancel";
  expect(echoPrefixLength("say confirmed to continue or cancel", expected)).toBe(expected.length);
  expect(echoPrefixLength("the reminder was cancelled this morning", "the reminder was canceled this morning next sentence")).toBe("the reminder was canceled this morning".length);
});
it("never consumes closed replies or materially different instructions", () => {
  for (const text of ["confirm", "no", "wait", "never mind", "undo that", "redo that"]) expect(echoPrefixLength(text, text)).toBe(0);
  expect(echoPrefixLength("say cancel to continue or cancel", "say confirm to continue or cancel")).toBe(0);
  expect(echoPrefixLength("the entry will be restored", "the entry will be removed")).toBe(0);
});
