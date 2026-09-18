import { describe, expect, it } from "vitest";
import { classifySegmentText, segmentRecording, type DerivedItem } from "../earmark";
import type { JournalTranscriptSegment } from "../../domain/studio-model";

function segment(partial: Partial<JournalTranscriptSegment> & Pick<JournalTranscriptSegment, "id" | "text" | "startMs" | "endMs">): JournalTranscriptSegment {
  return { source: "voice", ...partial };
}

const NOW = "2026-09-17T09:00:00.000Z";

describe("classifySegmentText", () => {
  it("classifies a commitment", () => {
    expect(classifySegmentText("I promised Sofia I'd book dinner.")?.kind).toBe("commitment");
  });
  it("classifies a task", () => {
    expect(classifySegmentText("I need to send the portfolio to Daniel tomorrow.")?.kind).toBe("task");
  });
  it("classifies a decision", () => {
    expect(classifySegmentText("I'm going with the dark version.")?.kind).toBe("decision");
  });
  it("classifies a question", () => {
    expect(classifySegmentText("Is the role remote?")?.kind).toBe("question");
  });
  it("returns null for plain statements with no cue phrase (documented false negative)", () => {
    expect(classifySegmentText("The weather was nice today.")).toBeNull();
  });
  it("returns null for an empty segment", () => {
    expect(classifySegmentText("   ")).toBeNull();
  });
  it("documented false positive: a quoted cue phrase still matches", () => {
    // Earmark has no speaker/quotation model; this is a known, tested limit.
    expect(classifySegmentText("She said 'I need to leave early' during the call.")?.kind).toBe("task");
  });
});

describe("segmentRecording", () => {
  const recording = { id: "rec-1", kind: "voice-note" as const, durationMs: 90_000 };

  it("extracts one derived item per matching segment with real timestamps", () => {
    const segments = [
      segment({ id: "s1", text: "I need to send the portfolio to Daniel tomorrow.", startMs: 0, endMs: 4200 }),
      segment({ id: "s2", text: "I'm going with the dark version.", startMs: 4200, endMs: 7100 }),
      segment({ id: "s3", text: "I should ask whether the role is remote.", startMs: 7100, endMs: 10500 }),
      segment({ id: "s4", text: "I promised Sofia I'd book dinner.", startMs: 10500, endMs: 14000 }),
      segment({ id: "s5", text: "Anyway, it was a good day overall.", startMs: 14000, endMs: 17000 }),
    ];

    const items = segmentRecording(segments, recording, NOW);

    expect(items).toHaveLength(4);
    const [task, decision, , commitment] = items as [DerivedItem, DerivedItem, DerivedItem, DerivedItem];
    expect(task.kind).toBe("task");
    expect(task.text.toLowerCase()).toContain("send the portfolio to daniel");
    expect(task.sourceMoment.recording).toEqual({ recordingId: "rec-1", atMs: 0, endAtMs: 4200 });
    expect(task.timestampConfidence).toBe("exact");
    expect(task.confidence).toBeGreaterThan(0);
    expect(task.createdAt).toBe(NOW);

    expect(decision.kind).toBe("decision");
    expect(commitment.kind).toBe("commitment");
    expect(commitment.sourceMoment.recording.atMs).toBe(10500);
  });

  it("marks estimated segment boundaries as estimated, never exact", () => {
    const segments = [segment({ id: "s1", text: "I need to call the landlord.", startMs: 0, endMs: 3000, alignment: "segment-estimate" })];
    const [item] = segmentRecording(segments, recording, NOW);
    expect(item?.timestampConfidence).toBe("estimated");
  });

  it("excludes untimed segments from playback-seekable output", () => {
    const segments = [segment({ id: "s1", text: "I need to call the landlord.", startMs: 0, endMs: 3000, alignment: "untimed" })];
    expect(segmentRecording(segments, recording, NOW)).toHaveLength(0);
  });

  it("links a matched person id when a matcher is provided", () => {
    const segments = [segment({ id: "s1", text: "I promised Sofia I'd book dinner.", startMs: 0, endMs: 3000 })];
    const [item] = segmentRecording(segments, recording, NOW, (text) => (text.includes("Sofia") ? ["person-sofia"] : undefined));
    expect(item?.personIds).toEqual(["person-sofia"]);
  });

  it("produces stable, unique ids per segment", () => {
    const segments = [
      segment({ id: "s1", text: "I need to call the landlord.", startMs: 0, endMs: 3000 }),
      segment({ id: "s2", text: "I need to call the bank.", startMs: 3000, endMs: 6000 }),
    ];
    const items = segmentRecording(segments, recording, NOW);
    expect(new Set(items.map((item) => item.id)).size).toBe(2);
  });
});
