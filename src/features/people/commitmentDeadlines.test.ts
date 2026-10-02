import { describe, expect, it } from "vitest";
import frozen from "../voice-intelligence/legacyCommitmentSlots.json";
import { resolveGlobalCommand } from "../../shared/command/globalInterpreter";
import { commitmentDeadline } from "./commitmentDeadline";

const day = "2026-09-05";
const resolve = (text: string) => resolveGlobalCommand(text, { route: "home" }, day).intent;

describe("independent commitment deadline contracts", () => {
  it.each(frozen.rows)("preserves recipient, object and deadline for $id", (row) => {
    expect(resolve(row.text)).toMatchObject({ type: "commitment-create", person: row.person, title: row.title,
      direction: "i-owe", status: "open", ...(row.dueAt ? { dueAt: row.dueAt } : { unresolvedDeadline: expect.any(String) }) });
  });
  it.each([
    "I did not tell Maya I would send the proposal by Friday",
    "I told Maya I would not send the proposal by Friday",
    "I told Maya the proposal would not be ready by Friday",
    "I told Maya 'I would send the proposal by Friday' as an example",
    "I told Maya 'the proposal would be ready by Friday' as an example",
    "I promised Maya I wouldn't send the proposal by Friday",
    "The sentence 'I promised Maya the proposal by Friday' is an example",
  ])("does not create from negated or quoted statements: %s", (text) => {
    expect(resolve(text).type).not.toBe("commitment-create");
  });
  it("keeps generic recipients unresolved", () => {
    expect(resolve("I promised someone the proposal by Friday")).toMatchObject({ type: "clarification" });
    expect(resolve("I told my manager I would send the proposal by Friday")).toMatchObject({ type: "clarification" });
  });
  it("preserves a quoted recipient name", () => {
    expect(resolve('I owe "The Team" the proposal by Friday')).toMatchObject({ type: "commitment-create", person: "The Team", title: "Proposal" });
  });
  it("keeps an ordinary have obligation intact", () => {
    expect(resolve("I promised Maya I would have lunch by Friday")).toMatchObject({ title: "Have lunch" });
  });
  it("keeps before/after words inside the delivery title", () => {
    expect(resolve("I promised Maya I would review the before/after design by Friday")).toMatchObject({ title: "Review the before/after design", dueAt: "2026-09-11T17:00:00.000Z" });
  });
  it("uses civil boundaries across the autumn clock change", () => {
    expect(commitmentDeadline("send the proposal before Monday", "2026-10-24").dueAt).toBe("2026-10-25T23:00:00.000Z");
    expect(commitmentDeadline("send the proposal by the end of Sunday", "2026-10-24").dueAt).toBe("2026-10-25T22:59:59.999Z");
  });
});
