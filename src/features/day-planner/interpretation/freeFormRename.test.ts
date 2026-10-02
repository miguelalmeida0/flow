import { expect, it } from "vitest";
import { protectRenameValue } from "./freeFormRename";
import { interpretTranscript } from "../parser";

it.each(["this one", "that one"])("keeps the complete reference %s outside a property value", target => {
  expect(protectRenameValue(`Make ${target} blue`, "2026-10-02")).toBeNull();
  const result = interpretTranscript(`Make ${target} blue`, "2026-10-02");
  expect(result).toMatchObject({ status: "ready", request: { actions: [{ type: "update", patch: { color: "blue" } }] } });
});

it.each(["this one", "that one"])("preserves literal rename text after the complete reference %s", target => {
  expect(protectRenameValue(`Make ${target} Fish and Chips`, "2026-10-02")).toMatchObject({ values: { flowliteralvalue0: "Fish and Chips" } });
});
