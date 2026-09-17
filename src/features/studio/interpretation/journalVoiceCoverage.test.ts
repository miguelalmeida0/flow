import { beforeEach, describe, expect, it } from "vitest";
import type { LifeContext } from "../../../domain/life-model";
import { createLifeDocument } from "../../../domain/life-storage";
import type { JournalEntry } from "../../../domain/studio-model";
import { interpretGlobalCommand } from "../../../shared/command/globalInterpreter";
import type { StudioIntent } from "./studioInterpreter";
import { planStudioCommand } from "../studioCommandPlan";
import {
  isBareJournalObject,
  isJournalCreateCommand,
  isJournalDeleteCommand,
  isJournalRenameMissingTitle,
  latestOrdinal,
} from "./journalSynonyms";

const dateKey = "2026-09-17";
const now = new Date("2026-09-17T19:30:00.000Z");
const home: LifeContext = { route: "home" };
const journal: LifeContext = { route: "journal", topic: "journal" };

function plan(transcript: string, document: ReturnType<typeof createLifeDocument>, ctx: LifeContext = home) {
  const intent = interpretGlobalCommand(transcript, ctx, dateKey);
  return { intent, result: planStudioCommand(intent as StudioIntent, document, ctx, now) };
}

function entryFixture(document: ReturnType<typeof createLifeDocument>, patch: Partial<JournalEntry> = {}) {
  const entry: JournalEntry = {
    id: patch.id ?? "journal-1", kind: "journal-entry", title: "Evening walk", text: "The street was quiet after the rain.", status: "draft",
    recordingState: "idle", recordingDurationMs: 0, photoAssetIds: [], bookmarks: [], transcriptSegments: [], drawings: [], tags: [],
    createdAt: now.toISOString(), updatedAt: now.toISOString(), ...patch,
  };
  document.studio.journalEntries.push(entry);
  return entry;
}

beforeEach(() => localStorage.clear());

describe("journal creation paraphrases", () => {
  it.each([
    "start a new note", "create a note", "make a note", "save a note", "save note",
    "start a new entry", "start a new journal entry", "create a journal entry", "new journal entry",
    "make a new entry", "another entry", "write a new entry", "begin a note", "write a note",
  ])("recognizes %s as a Journal creation command", (utterance) => {
    expect(interpretGlobalCommand(utterance, home, dateKey)).toMatchObject({ type: "journal-create" });
  });

  it("never treats an Inbox capture with real content as a Journal creation command", () => {
    expect(interpretGlobalCommand("Note buy sunscreen", home, dateKey)).toMatchObject({ type: "capture-create", title: "buy sunscreen" });
    expect(interpretGlobalCommand("Note that the passport expires soon", home, dateKey)).toMatchObject({ type: "capture-create" });
    expect(interpretGlobalCommand("Save pack adapters", home, dateKey)).toMatchObject({ type: "capture-create", title: "pack adapters" });
  });

  it("does not misroute a bare journal creation phrase into Calendar or capture-convert", () => {
    expect(interpretGlobalCommand("start a new note", home, dateKey).type).not.toBe("calendar");
    expect(interpretGlobalCommand("make a note", home, dateKey).type).not.toBe("capture-convert");
  });
});

describe("journal deletion paraphrases", () => {
  it.each(["delete this entry", "remove this entry", "erase this entry", "discard this entry", "throw this entry away", "get rid of this entry"])(
    "recognizes %s as a Journal deletion regardless of surface", (utterance) => {
      expect(interpretGlobalCommand(utterance, home, dateKey)).toMatchObject({ type: "journal-delete" });
      expect(interpretGlobalCommand(utterance, journal, dateKey)).toMatchObject({ type: "journal-delete" });
    },
  );

  it.each(["delete this note", "remove this note", "erase this note"])(
    "recognizes %s as a Journal deletion only while on a Journal surface", (utterance) => {
      expect(interpretGlobalCommand(utterance, journal, dateKey)).toMatchObject({ type: "journal-delete" });
      expect(interpretGlobalCommand(utterance, home, dateKey).type).not.toBe("journal-delete");
    },
  );

  it("plans a destructive confirmation with an undo-safe message, and undoes cleanly", () => {
    const document = createLifeDocument(dateKey);
    const entry = entryFixture(document, { title: "Evening walk" });
    const before = structuredClone(document);
    const { result } = plan("delete this entry", document, { ...journal, activeJournalEntryId: entry.id });
    expect(result).toMatchObject({
      status: "confirmation",
      title: "Delete Evening walk?",
      actions: [{ type: "journal.delete", entryId: entry.id }],
    });
    expect(result.status === "confirmation" && result.detail).toMatch(/undo restores the entry/i);
    // Planning a confirmation never mutates data by itself; only an applied
    // confirm action would remove the entry.
    expect(document).toEqual(before);
  });
});

describe("journal rename recovery", () => {
  it.each(["rename this entry", "rename my entry", "rename this note", "rename this journal", "call this entry", "name this entry"])(
    "asks for the missing title instead of failing silently on %s", (utterance) => {
      expect(interpretGlobalCommand(utterance, home, dateKey)).toMatchObject({
        type: "clarification",
        title: "What should I rename it to?",
      });
    },
  );

  it("still renames immediately once a title is given", () => {
    expect(interpretGlobalCommand("rename this entry to Morning pages", home, dateKey)).toMatchObject({
      type: "journal-rename",
      title: "Morning pages",
    });
  });

  it("never lets a bare rename request fall through to a Calendar clarification", () => {
    const result = interpretGlobalCommand("rename this entry", home, dateKey);
    expect(result).not.toMatchObject({ title: "Which Today event do you mean?" });
  });
});

describe("opening entries by recency and bookmark", () => {
  it("opens the latest entry for latest/last/most recent, and the ordinal for first", () => {
    const document = createLifeDocument(dateKey);
    entryFixture(document, { id: "older", title: "Older entry", updatedAt: "2026-09-10T00:00:00.000Z" });
    entryFixture(document, { id: "newer", title: "Newer entry", updatedAt: "2026-09-16T00:00:00.000Z" });
    for (const utterance of ["open my latest entry", "open the last entry", "open the most recent entry"]) {
      expect(plan(utterance, document).result).toMatchObject({ status: "ready", focusId: "newer" });
    }
    expect(plan("open the first entry", document).result).toMatchObject({ status: "ready", focusId: "newer" });
  });

  it("continues the latest entry for continuation phrases", () => {
    const document = createLifeDocument(dateKey);
    entryFixture(document, { id: "only", title: "Only entry" });
    for (const utterance of ["continue my journal entry", "continue writing", "add to journal", "keep writing"]) {
      expect(plan(utterance, document).result).toMatchObject({ status: "ready", focusId: "only" });
    }
  });

  it("opens the bookmarked entry when one exists", () => {
    const document = createLifeDocument(dateKey);
    entryFixture(document, { id: "no-bookmark", title: "Plain entry", updatedAt: "2026-09-16T00:00:00.000Z" });
    entryFixture(document, { id: "bookmarked", title: "Marked entry", updatedAt: "2026-09-12T00:00:00.000Z", bookmarks: [{ id: "b1", timestampMs: 1000, createdAt: now.toISOString() }] });
    expect(plan("open the bookmarked entry", document).result).toMatchObject({ status: "ready", focusId: "bookmarked" });
  });

  it("recovers gracefully when the journal is empty instead of a generic failure", () => {
    const document = createLifeDocument(dateKey);
    const { result } = plan("continue my journal entry", document);
    expect(result).toMatchObject({ status: "clarification", title: "There is no journal entry yet." });
  });
});

describe("navigation reaches the Journal through possessive phrasing", () => {
  it.each(["open my journal", "show today's journal", "show todays journal", "open journal"])("routes %s to the journal surface", (utterance) => {
    expect(interpretGlobalCommand(utterance, home, dateKey)).toEqual({ type: "navigate", route: "journal" });
  });
});

describe("conversational follow-ups after a Journal action", () => {
  it("resolves confirm/cancel/undo while parked on the Journal surface", () => {
    expect(interpretGlobalCommand("yes", journal, dateKey).type).toBe("confirm");
    expect(interpretGlobalCommand("confirm", journal, dateKey).type).toBe("confirm");
    expect(interpretGlobalCommand("no", journal, dateKey).type).toBe("cancel");
    expect(interpretGlobalCommand("never mind", journal, dateKey).type).toBe("cancel");
    expect(interpretGlobalCommand("undo that", journal, dateKey).type).toBe("history");
  });
});

describe("journalSynonyms primitives", () => {
  it("isJournalCreateCommand accepts the bare verb+object grammar and nothing more", () => {
    expect(isJournalCreateCommand("start a new note")).toBe(true);
    expect(isJournalCreateCommand("create a journal entry")).toBe(true);
    expect(isJournalCreateCommand("note buy milk")).toBe(false);
    expect(isJournalCreateCommand("start a new project")).toBe(false);
  });

  it("isJournalDeleteCommand only accepts note when the journal surface is active", () => {
    expect(isJournalDeleteCommand("delete this entry", false)).toBe(true);
    expect(isJournalDeleteCommand("delete this note", false)).toBe(false);
    expect(isJournalDeleteCommand("delete this note", true)).toBe(true);
  });

  it("isJournalRenameMissingTitle only matches a titleless rename", () => {
    expect(isJournalRenameMissingTitle("rename this entry")).toBe(true);
    expect(isJournalRenameMissingTitle("rename this entry to Morning pages")).toBe(false);
  });

  it("isBareJournalObject matches only the object phrase, never real content", () => {
    expect(isBareJournalObject("a note")).toBe(true);
    expect(isBareJournalObject("the journal entry")).toBe(true);
    expect(isBareJournalObject("a note about the trip")).toBe(false);
  });

  it("latestOrdinal maps recency words to ordinal 1 and nothing else", () => {
    expect(latestOrdinal("latest")).toBe(1);
    expect(latestOrdinal("most recent")).toBe(1);
    expect(latestOrdinal("second")).toBeUndefined();
  });
});
