import { expect, it } from "vitest";
import { manualVoiceMarker, resolveVoiceMarkers } from "./voiceMarkers";
import { suggestVoiceMarkers } from "./markerSuggestions";
import { resolveGlobalCommand } from "../../shared/command/globalInterpreter";
const at = "2026-09-12T10:00:00Z";
const segments = [
  { id: "s1", text: "We should get dinner Friday.", startMs: 12000, endMs: 18000, alignment: "segment-estimate" as const, source: "voice" as const },
  { id: "s2", text: "Bring your camera.", startMs: 42000, endMs: 48000, alignment: "segment-estimate" as const, source: "voice" as const },
  { id: "s3", text: "Are you free Saturday?", startMs: 66000, endMs: 71000, alignment: "segment-estimate" as const, source: "voice" as const },
];
it("keeps manual marks on the narrowest recorded passage, with original literal words", () => {
  expect(manualVoiceMarker("n1", segments.slice(0, 2), 49000, "m1", at)).toMatchObject({ startMs: 41650, endMs: 49000, excerpt: "Bring your camera.", segmentIds: ["s2"], status: "kept" });
});
it("suggests only literal meaningful segments, caps volume, and never duplicates manual decisions", () => {
  const suggestions = suggestVoiceMarkers("n1", segments, [], 90000, at);
  expect(suggestions.map(({ kind }) => kind)).toEqual(["plan", "task", "question"]);
  expect(suggestions.every(({ status }) => status === "suggested")).toBe(true);
  const dismissed = { ...suggestions[0]!, status: "dismissed" as const };
  expect(suggestVoiceMarkers("n1", segments, [dismissed], 90000, at)).toHaveLength(2);
  expect(suggestVoiceMarkers("n1", [{ ...segments[0]!, text: "It was an ordinary quiet afternoon." }], [], 90000, at)).toHaveLength(0);
  expect(suggestVoiceMarkers("n1", [{ ...segments[0]!, alignment: "untimed" }], [], 90000, at)).toHaveLength(0);
  for (const text of ["I'll never send you the photos.", "We should not meet Friday.", 'We should meet "Friday".']) expect(suggestVoiceMarkers("n1", [{ ...segments[0]!, text }], [], 90000, at)).toHaveLength(0);
  expect(suggestVoiceMarkers("n1", [{ ...segments[2]!, text: "Are you free Saturday" }], [], 90000, at)[0]?.kind).toBe("question");
});
it("resolves ordinal and literal marker references without fuzzy substitution", () => {
  const markers = suggestVoiceMarkers("n1", segments, [], 90000, at);
  expect(resolveVoiceMarkers(markers, "second")[0]?.excerpt).toBe("Bring your camera.");
  expect(resolveVoiceMarkers(markers, "camera")[0]?.id).toBe(markers[1]?.id);
  expect(resolveVoiceMarkers(markers, "camcorder")).toHaveLength(0);
  expect(resolveVoiceMarkers(markers, "question")[0]?.id).toBe(markers[2]?.id);
});
it.each(["journal-longform", "voice-note-longform"] as const)("classifies exact moment controls and preserves narrative in %s", (voiceMode) => {
  const context = { route: voiceMode === "journal-longform" ? "journal" as const : "people" as const, voiceMode, activeJournalEntryId: "j1", activeVoiceNoteId: "n1" };
  for (const text of ["Mark that", "Keep that part", "Play the second marker", "Play the question", "Play the second one"]) expect(resolveGlobalCommand(text, context, "2026-09-12").segment?.classification).toBe("CONTROL");
  expect(resolveGlobalCommand("Dismiss the first marker.", context, "2026-09-12").intent).toMatchObject({ type: "recording-marker", operation: "dismiss" });
  expect(resolveGlobalCommand("Keep the first marker.", context, "2026-09-12").intent).toMatchObject({ type: "recording-marker", operation: "keep" });
  expect(resolveGlobalCommand("He told me to stop and go home.", context, "2026-09-12").segment?.classification).toBe("CONTENT");
});
