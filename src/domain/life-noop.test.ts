import { expect, it } from "vitest";
import { acceptanceClock, acceptanceFixture, type AcceptanceFixtureId } from "../features/voice-intelligence/acceptanceFixtures";
import type { LifeAction } from "./life-actions";
import type { LifeDocument } from "./life-model";
import { applyLifeTransaction } from "./life-transaction";

const old = "2026-01-01T00:00:00.000Z";
const cases: { name: string; fixture: AcceptanceFixtureId; actions: (document: LifeDocument) => LifeAction[] }[] = [
  { name: "Capture title", fixture: "capture-reference", actions: () => [{ type: "capture.update", captureId: "C1", title: "Boiler receipt" }] },
  { name: "Capture archive", fixture: "capture-reference", actions: () => [{ type: "capture.archive", captureId: "C3" }] },
  { name: "Outcome title", fixture: "outcome-reference", actions: () => [{ type: "plan.update", planId: "O1", patch: { title: "Home library" } }] },
  { name: "Outcome step", fixture: "outcome-reference", actions: () => [{ type: "plan.step.update", stepId: "S1", patch: { estimatedMinutes: 25 } }] },
  { name: "Outcome order", fixture: "outcome-reference", actions: () => [{ type: "plan.step.reorder", planId: "O1", stepId: "S1", beforeStepId: "S2" }] },
  { name: "Commitment status", fixture: "commitment-reference", actions: () => [{ type: "commitment.update", commitmentId: "K1", patch: { status: "open" } }] },
  { name: "Journal text and cloned tags", fixture: "memory-source", actions: (document) => [{ type: "journal.update", entryId: "J1", patch: { text: document.studio.journalEntries[0]!.text, tags: ["travel", "family"] } }] },
  { name: "Memory offset with reversed property order", fixture: "memory-source", actions: () => [{ type: "memory.update", memoryId: "M1", patch: { textOffset: { y: 0, x: 0 } } }] },
  { name: "Preset save with cloned layers", fixture: "atmosphere", actions: (document) => { const preset = document.studio.atmospherePresets[0]!; return [{ type: "atmosphere.preset.update", presetId: preset.id, patch: { layers: structuredClone(preset.layers), masterVolume: preset.masterVolume } }]; } },
  { name: "Ritual steps", fixture: "empty-home", actions: (document) => { const ritual = document.studio.rituals[0]!; return [{ type: "ritual.update", ritualId: ritual.id, patch: { steps: structuredClone(ritual.steps) } }]; } },
  { name: "Already attached photo", fixture: "memory-source", actions: () => [{ type: "journal.photo.attach", entryId: "J1", assetId: "P1" }] },
  { name: "Already empty drawing", fixture: "memory-source", actions: () => [{ type: "journal.drawing.replace", entryId: "J1", strokes: [] }] },
];

it.each(cases)("does not timestamp an identical $name after the clock advances", ({ fixture, actions }) => {
  const before = acceptanceFixture(fixture).snapshot.document;
  for (const collection of [before.captures, before.plans, before.steps, before.commitments, before.studio.journalEntries, before.studio.memories, before.studio.atmospherePresets, before.studio.rituals]) {
    for (const entity of collection) entity.updatedAt = old;
  }
  const frozen = structuredClone(before);
  const result = applyLifeTransaction(before, actions(before), () => acceptanceClock);
  expect(result.status).toBe("success");
  if (result.status !== "success") return;
  expect(result.document).toEqual(frozen);
  expect(JSON.stringify(result.document)).toBe(JSON.stringify(frozen));
  expect(before).toEqual(frozen);
});

it("timestamps real nested edits and optional-field removal, but leaves absent fields absent", () => {
  const before = acceptanceFixture("memory-source").snapshot.document;
  before.studio.memories[0]!.updatedAt = old;
  const result = applyLifeTransaction(before, [{ type: "memory.update", memoryId: "M1", patch: { textOffset: { x: 1, y: 0 }, photoAssetId: undefined } }], () => acceptanceClock);
  expect(result.status).toBe("success");
  if (result.status !== "success") return;
  expect(result.document.studio.memories[0]).toEqual({ ...before.studio.memories[0], textOffset: { x: 1, y: 0 }, photoAssetId: undefined, updatedAt: acceptanceClock.toISOString() });
  const repeated = applyLifeTransaction(result.document, [{ type: "memory.update", memoryId: "M1", patch: { photoAssetId: undefined, textOffset: { y: 0, x: 1 } } }], () => new Date(acceptanceClock.getTime() + 60000));
  expect(repeated).toMatchObject({ status: "success", document: result.document });
});

it("saving a draft is a real status change with a current timestamp", () => {
  const before = acceptanceFixture("journal-editing").snapshot.document;
  before.studio.journalEntries[0]!.updatedAt = old;
  const result = applyLifeTransaction(before, [{ type: "journal.update", entryId: "J1", patch: { status: "saved" } }], () => acceptanceClock);
  expect(result).toMatchObject({ status: "success", document: { studio: { journalEntries: [{ ...before.studio.journalEntries[0], status: "saved", updatedAt: acceptanceClock.toISOString() }] } } });
});

it("uses the final atomic entity value, not intermediate edits, to determine no-op metadata", () => {
  const before = acceptanceFixture("capture-reference").snapshot.document;
  before.captures[0]!.updatedAt = old;
  const result = applyLifeTransaction(before, [
    { type: "capture.update", captureId: "C1", title: "Intermediate title" },
    { type: "capture.update", captureId: "C1", title: "Boiler receipt" },
  ], () => acceptanceClock);
  expect(result).toMatchObject({ status: "success", document: before });
});

it("preserves byte-equivalent history input when a no-op only reorders calendar object keys", () => {
  const before = acceptanceFixture("calendar-reference").snapshot.document;
  const original = before.calendar;
  before.calendar = { events: original.events, deferred: original.deferred, dateKey: original.dateKey, breathingRooms: original.breathingRooms };
  before.calendars[before.calendar.dateKey] = structuredClone(before.calendar);
  const serialized = JSON.stringify(before);
  const result = applyLifeTransaction(before, [{ type: "calendar.request", request: { transcript: "Keep the existing duration", normalized: "keep the existing duration", actions: [{ type: "resize", selector: { type: "id", id: "E1" }, mode: "set", minutes: 30 }], constraints: [] } }], () => acceptanceClock);
  expect(result.status).toBe("success");
  if (result.status !== "success") return;
  expect(result.document).toEqual(before);
  expect(JSON.stringify(result.document)).toBe(serialized);
});
