import { describe, expect, it } from "vitest";
import { searchEverything, commitmentsFor } from "../search";
import { emptyDocument, AT } from "./fixtures";
import type { JournalEntry } from "../../domain/studio-model";
import type { PersonalMemoryFact } from "../types";
import type { DerivedItem } from "../earmark";

function journalEntryWithLisbon(): JournalEntry {
  return {
    id: "journal-lisbon",
    kind: "journal-entry",
    title: "Trip planning",
    text: "Notes about the upcoming trip.",
    status: "saved",
    recordingState: "idle",
    recordingDurationMs: 12000,
    audioAssetId: "asset-lisbon",
    photoAssetIds: [],
    bookmarks: [],
    transcriptSegments: [
      { id: "seg-1", text: "We should visit Lisbon next spring.", startMs: 0, endMs: 3000, source: "voice" },
      { id: "seg-2", text: "I already booked the hotel near the river.", startMs: 3000, endMs: 6500, source: "voice" },
    ],
    drawings: [],
    tags: [],
    createdAt: AT,
    updatedAt: AT,
  };
}

describe("searchEverything", () => {
  it("finds a journal mention with segment-level audio provenance", () => {
    const document = emptyDocument();
    document.studio.journalEntries.push(journalEntryWithLisbon());

    const hits = searchEverything(document, [], "Lisbon");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ domain: "journal", sourceId: "journal-lisbon", deepLink: "journal/journal-lisbon", audioTimestampStart: 0, audioTimestampEnd: 3000 });
  });

  it("returns the specific segment mentioning the hotel, not the trip segment", () => {
    const document = emptyDocument();
    document.studio.journalEntries.push(journalEntryWithLisbon());

    const [hit] = searchEverything(document, [], "hotel");
    expect(hit!.audioTimestampStart).toBe(3000);
    expect(hit!.audioTimestampEnd).toBe(6500);
    expect(hit!.snippet.toLowerCase()).toContain("hotel");
  });

  it("finds an explicit memory fact with provenance back to its source", () => {
    const document = emptyDocument();
    const facts: PersonalMemoryFact[] = [{ id: "fact-1", text: "Sofia is vegetarian", subjectPersonId: "person-sofia", createdAt: AT, source: "explicit" }];

    const hits = searchEverything(document, facts, "vegetarian");
    expect(hits).toEqual([expect.objectContaining({ domain: "memory", sourceId: "fact-1", personIds: ["person-sofia"], deepLink: "memory/fact-1" })]);
  });

  it("finds a calendar event and carries its participants as personIds", () => {
    const document = emptyDocument();
    document.calendars[document.calendar.dateKey]!.events.push({ id: "evt-1", title: "Reunion dinner with Sofia", dateKey: document.calendar.dateKey, start: 19 * 60, end: 20 * 60, kind: "flexible", priority: "medium", participantIds: ["person-sofia"] });

    const hits = searchEverything(document, [], "reunion dinner");
    expect(hits[0]).toMatchObject({ domain: "calendar", sourceId: "evt-1", personIds: ["person-sofia"] });
  });

  it("finds an earmarked commitment by its transcript text", () => {
    const document = emptyDocument();
    const item: DerivedItem = {
      id: "earmark-1",
      kind: "commitment",
      text: "Book dinner with Sofia",
      confidence: 0.9,
      timestampConfidence: "exact",
      personIds: ["person-sofia"],
      createdAt: AT,
      sourceMoment: { id: "moment-1", recording: { recordingId: "rec-1", atMs: 42000, endAtMs: 45000 }, transcript: "I promised Sofia I'd book dinner." },
    };
    document.earmarkItems = [item];

    const hits = searchEverything(document, [], "book dinner");
    expect(hits[0]).toMatchObject({ domain: "earmark", audioTimestampStart: 42000, audioTimestampEnd: 45000, deepLink: "earmark/rec-1" });
  });

  it("ranks an exact title match above a loose substring match", () => {
    const document = emptyDocument();
    document.plans.push({ id: "plan-exact", kind: "plan", title: "lisbon", outcome: "n/a", status: "active", stepIds: [], createdAt: AT } as never);
    document.studio.journalEntries.push(journalEntryWithLisbon());

    const hits = searchEverything(document, [], "lisbon");
    expect(hits[0]!.sourceId).toBe("plan-exact");
  });

  it("returns nothing for a query that matches no indexed data (never fabricates)", () => {
    const document = emptyDocument();
    expect(searchEverything(document, [], "atlantis")).toEqual([]);
  });
});

describe("commitmentsFor", () => {
  it("collects both a structured commitment and an earmarked commitment for the same person", () => {
    const document = emptyDocument();
    document.commitments.push({ id: "c1", kind: "commitment", personId: "person-sofia", title: "Book dinner", direction: "i-owe", status: "open", createdAt: AT, updatedAt: AT });
    document.earmarkItems = [{
      id: "earmark-1",
      kind: "commitment",
      text: "Send the venue address",
      confidence: 0.9,
      timestampConfidence: "exact",
      personIds: ["person-sofia"],
      createdAt: AT,
      sourceMoment: { id: "moment-1", recording: { recordingId: "rec-1", atMs: 1000 }, transcript: "I promised Sofia I'd send the venue address." },
    }];

    const results = commitmentsFor(document, "person-sofia");
    expect(results.map((hit) => hit.domain).sort()).toEqual(["commitments", "earmark"]);
  });
});
