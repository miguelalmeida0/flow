import { expect, it } from "vitest";
import { interpretTranscript } from "./parser";
import { applyLifeTransaction } from "../../domain/life-transaction";
import { acceptanceClock, acceptanceFixture } from "../voice-intelligence/acceptanceFixtures";
import { resolveGlobalCommand } from "../../shared/command/globalInterpreter";

it.each([
  ["Move Deep Work to four; keep the scheduling unchanged", ["start", "end", "dateKey"]],
  ["Rename this event to Blue, but leave its title unchanged", ["title"]],
  ["Rename Deep Work to Blue, but leave its title unchanged", ["title"]],
] as const)("validates the preservation guard instead of discarding it: %s", (text, fields) => {
  const before = acceptanceFixture("calendar-reference").snapshot.document;
  const parsed = interpretTranscript(text, "2026-09-08");
  expect(parsed).toMatchObject({ status: "ready", request: { constraints: [{ type: "preserve", fields }] } });
  if (parsed.status !== "ready") return;
  const frozen = structuredClone(before);
  const result = applyLifeTransaction(before, [{ type: "calendar.request", request: parsed.request, selectedId: "E1" }], () => acceptanceClock);
  expect(result.status).toBe("conflict"); expect(before).toEqual(frozen);
});
it("permits metadata-only changes under an actual scheduling guard", () => {
  const before = acceptanceFixture("calendar-reference").snapshot.document;
  const parsed = interpretTranscript("Make the selected event green and critical; keep the scheduling unchanged.", "2026-09-08");
  expect(parsed).toMatchObject({ status: "ready", request: { actions: [{ type: "update", patch: { color: "green", importance: "critical" } }], constraints: [{ type: "preserve", fields: ["start", "end", "dateKey"] }] } });
  if (parsed.status !== "ready") return;
  const result = applyLifeTransaction(before, [{ type: "calendar.request", request: parsed.request, selectedId: "E1" }], () => acceptanceClock);
  const expected = structuredClone(before);
  for (const day of [expected.calendar, expected.calendars["2026-09-08"]!]) Object.assign(day.events.find(({ id }) => id === "E1")!, { color: "green", importance: "critical" });
  expect(result).toMatchObject({ status: "success", document: expected }); expect(before.calendar.events[0]!.color).not.toBe("green");
});
it.each([
  ['Rename this to "Move to four and keep scheduling unchanged"', "Move to four and keep scheduling unchanged"],
  ["Rename this to 'Blue, but leave its title unchanged'", "Blue, but leave its title unchanged"],
] as const)("leaves quoted guard words as literal title data: %s", (text, title) => {
  expect(interpretTranscript(text, "2026-09-08")).toMatchObject({ status: "ready", request: { actions: [{ type: "update", patch: { title } }], constraints: [] } });
});
it("ends a single-quoted value at its real boundary, not at the following comma", () => {
  const parsed = interpretTranscript("Call the two PM block 'Deep Work — no interruptions', and make it blue.", "2026-09-08");
  expect(parsed).toMatchObject({ status: "ready", request: { actions: [{ type: "update", patch: { title: "Deep Work — no interruptions" } }, { type: "update", patch: { color: "blue" } }] } });
});
it("preserves duration across a stable-ID date transfer without adding protection", () => {
  const before = acceptanceFixture("calendar-reference").snapshot.document;
  const parsed = interpretTranscript("Move Deep Work to tomorrow; keep its duration unchanged", "2026-09-08");
  expect(parsed.status).toBe("ready");
  if (parsed.status !== "ready") return;
  const result = applyLifeTransaction(before, [{ type: "calendar.request", request: parsed.request, selectedId: "E1" }], () => acceptanceClock);
  expect(result.status).toBe("success");
  if (result.status !== "success") return;
  const source = before.calendar.events.find(({ id }) => id === "E2")!;
  expect(result.document.calendars["2026-09-09"]!.events.find(({ id }) => id === "E2")).toEqual({ ...source, dateKey: "2026-09-09" });
  expect(result.document.calendar.events).toEqual(before.calendar.events.filter(({ id }) => id !== "E2"));
});
it.each([
  "Move Deep Work to tomorrow and don't move Deep Work",
  "Move Deep Work to tomorrow; keep the scheduling unchanged",
])("does not permit a forbidden date transfer: %s", (text) => {
  const before = acceptanceFixture("calendar-reference").snapshot.document;
  const parsed = interpretTranscript(text, "2026-09-08");
  expect(parsed.status).toBe("ready");
  if (parsed.status !== "ready") return;
  const frozen = structuredClone(before);
  expect(applyLifeTransaction(before, [{ type: "calendar.request", request: parsed.request, selectedId: "E1" }], () => acceptanceClock).status).toBe("conflict");
  expect(before).toEqual(frozen);
});
it("does not discard an unknown preserved property", () => {
  expect(interpretTranscript("Make this green; keep its organizer unchanged", "2026-09-08").status).toBe("unsupported");
});
it("enforces an excluded destination even when the requested delta would reach it", () => {
  const before = acceptanceFixture("calendar-near").snapshot.document;
  for (const day of [before.calendar, before.calendars["2026-09-08"]!]) Object.assign(day.events[0]!, { start: 590, end: 620 });
  const parsed = interpretTranscript("Shift Shareholders later by ten minutes, not to ten o'clock", "2026-09-08");
  expect(parsed).toMatchObject({ status: "ready", request: { actions: [{ type: "shift", selector: { type: "title", query: "shareholders" }, deltaMinutes: 10 }], constraints: [{ type: "avoidTime", minutes: 600 }] } });
  if (parsed.status !== "ready") return;
  const frozen = structuredClone(before);
  expect(applyLifeTransaction(before, [{ type: "calendar.request", request: parsed.request }], () => acceptanceClock).status).toBe("conflict");
  expect(before).toEqual(frozen);
});
it("checks the explicitly stated length instead of ignoring its number", () => {
  const before = acceptanceFixture("calendar-reference").snapshot.document;
  const parsed = interpretTranscript("Put this back at eleven thirty; leave the forty-minute length alone", "2026-09-08");
  expect(parsed).toMatchObject({ status: "ready", request: { constraints: [{ type: "preserve", fields: ["duration"], expectedDurationMinutes: 40 }] } });
  if (parsed.status !== "ready") return;
  expect(applyLifeTransaction(before, [{ type: "calendar.request", request: parsed.request, selectedId: "E1" }], () => acceptanceClock).status).toBe("conflict");
});
it("keeps a recognized leading field guard in the global Calendar candidate", () => {
  const fixture = acceptanceFixture("calendar-reference"), text = "The name is fine; just color this one orange.";
  expect(interpretTranscript(text, "2026-09-08")).toMatchObject({ status: "ready", request: { actions: [{ type: "update", patch: { color: "orange" } }], constraints: [{ type: "preserve", fields: ["title"] }] } });
  const resolved = resolveGlobalCommand(text, fixture.context, "2026-09-08", [], undefined, fixture.snapshot.document.calendar);
  expect(resolved.intent, JSON.stringify(resolved.candidates)).toMatchObject({ type: "calendar" });
});
