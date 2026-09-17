import { afterEach, expect, it } from "vitest";
import { setJournalRuntimePosition, beginRecordingUtterance, sampleRecordingUtterance, finishRecordingUtterance, recordingTranscriptRanges } from "./journalRuntimeClock";
afterEach(() => setJournalRuntimePosition(undefined, 0));
it("uses measured onset and interim boundaries for a long multi-sentence final", () => {
  setJournalRuntimePosition("note", 12_000); beginRecordingUtterance();
  setJournalRuntimePosition("note", 20_000); sampleRecordingUtterance("Dinner is Friday.");
  setJournalRuntimePosition("note", 35_000); sampleRecordingUtterance("Dinner is Friday. Bring the camera.");
  setJournalRuntimePosition("note", 45_000); finishRecordingUtterance("Dinner is Friday. Bring the camera. Are you free?");
  expect(recordingTranscriptRanges("note", "Dinner is Friday. Bring the camera. Are you free?", 45_000, "voice")).toEqual([
    { text: "Dinner is Friday.", startMs: 12_000, endMs: 20_000, alignment: "segment-estimate" },
    { text: "Bring the camera.", startMs: 20_000, endMs: 35_000, alignment: "segment-estimate" },
    { text: "Are you free?", startMs: 35_000, endMs: 45_000, alignment: "segment-estimate" },
  ]);
});
it("does not invent duration for typed text or reuse another source's timing", () => {
  setJournalRuntimePosition("private", 9000); beginRecordingUtterance();
  setJournalRuntimePosition("other", 0); finishRecordingUtterance("Other text");
  expect(recordingTranscriptRanges("private", "Other text", 9000)[0]).toMatchObject({ startMs: 9000, endMs: 9000, alignment: "untimed" });
});
it("preserves measured topic boundaries when Chrome omits all punctuation", () => {
  setJournalRuntimePosition("note", 12000); beginRecordingUtterance();
  setJournalRuntimePosition("note", 20000); sampleRecordingUtterance("dinner is Friday");
  setJournalRuntimePosition("note", 35000); sampleRecordingUtterance("dinner is Friday bring the camera");
  setJournalRuntimePosition("note", 45000); finishRecordingUtterance("dinner is Friday bring the camera are you free Saturday");
  expect(recordingTranscriptRanges("note", "dinner is Friday bring the camera are you free Saturday", 45000, "voice").map(({ text, startMs, endMs }) => ({ text, startMs, endMs }))).toEqual([
    { text: "dinner is Friday", startMs: 12000, endMs: 20000 }, { text: "bring the camera", startMs: 20000, endMs: 35000 }, { text: "are you free Saturday", startMs: 35000, endMs: 45000 },
  ]);
});
it("keeps typed copies of a previous final untimed", () => {
  setJournalRuntimePosition("note", 1000); beginRecordingUtterance();
  setJournalRuntimePosition("note", 5000); finishRecordingUtterance("Bring the camera.");
  expect(recordingTranscriptRanges("note", "Bring the camera.", 5000, "voice")[0]?.alignment).toBe("segment-estimate");
  expect(recordingTranscriptRanges("note", "Bring the camera.", 5000, "typed")[0]).toMatchObject({ alignment: "untimed", startMs: 5000, endMs: 5000 });
});
