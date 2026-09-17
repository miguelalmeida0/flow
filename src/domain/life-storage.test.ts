import { beforeEach, describe, expect, it } from "vitest";
import { createInitialPlan } from "../features/day-planner/seed";
import { LEGACY_LIFE_STORAGE_KEY, LIFE_BACKUP_KEY, LIFE_STORAGE_KEY, createLifeDocument, loadLifeSnapshot, readLifeSnapshot, readLifeSnapshotRevision, saveLifeSnapshot } from "./life-storage";
import type { LifeSnapshot } from "./life-model";

beforeEach(() => localStorage.clear());

describe("living environment storage", () => {
  it("migrates the authoritative Calendar v4 projection without changing event IDs", () => {
    const plan = createInitialPlan("2026-09-03");
    localStorage.setItem("flow.planner.v4", JSON.stringify({ version: 4, plan, past: [], future: [] }));
    const document = createLifeDocument("2026-09-03");
    expect(document.calendar.events.map(({ id }) => id)).toEqual(plan.events.map(({ id }) => id));
    expect(document.captures).toEqual([]);
  });

  it("migrates Calendar undo and redo snapshots into global history", () => {
    const plan = createInitialPlan("2026-09-03");
    const prior = structuredClone(plan);
    prior.events = prior.events.map((event) => event.id === "roadmap" ? { ...event, start: 15 * 60, end: 16 * 60 } : event);
    localStorage.setItem("flow.planner.v4", JSON.stringify({
      version: 4,
      plan,
      past: [{ plan: prior }],
      future: [{ plan: prior }],
    }));
    const snapshot = loadLifeSnapshot("2026-09-03");
    expect(snapshot.past[0]?.document.calendar).toEqual(prior);
    expect(snapshot.future[0]?.document.calendar).toEqual(prior);
    expect(snapshot.document.captures).toEqual([]);
  });

  it("round-trips the complete global document and history", () => {
    const document = createLifeDocument("2026-09-03");
    document.captures.push({ id: "capture-a", kind: "capture", title: "A", status: "unresolved", source: "typed", createdAt: "2026-09-03T10:00:00.000Z", updatedAt: "2026-09-03T10:00:00.000Z" });
    const snapshot: LifeSnapshot = { revision: 7, document, temporal: { todayDateKey: "2026-09-03", scope: { kind: "day", dateKey: "2026-09-03" } }, past: [{ document: createLifeDocument("2026-09-03") }], future: [] };
    saveLifeSnapshot(snapshot);
    expect(loadLifeSnapshot("2026-09-03")).toEqual(snapshot);
    expect(localStorage.getItem(LIFE_STORAGE_KEY)).not.toBeNull();
    expect(localStorage.getItem(LEGACY_LIFE_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem("flow.planner.v4")).toBeNull();
  });

  it("migrates Studio drafts safely and never revives an interrupted recorder", () => {
    const document = createLifeDocument("2026-09-03");
    const at = "2026-09-03T20:00:00.000Z";
    document.studio.mediaAssets.push({ id: "audio-evening", kind: "journal-audio", name: "evening.webm", mimeType: "audio/webm", size: 42, createdAt: at });
    document.studio.journalEntries.push({
      id: "journal-evening", kind: "journal-entry", title: "Evening", text: "A quiet street.", status: "draft", recordingState: "recording", recordingDurationMs: 12_000,
      audioAssetId: "audio-evening", photoAssetIds: [], bookmarks: [], transcriptSegments: [], drawings: [], tags: [], createdAt: at, updatedAt: at,
    });
    document.studio.memories.push({
      id: "memory-evening", kind: "memory", title: "Evening", journalEntryId: "journal-evening", composition: "voice", passage: "A quiet street.",
      showDate: true, datePlacement: "inline", textScale: 1, textOffset: { x: 0, y: 0 }, audioEnabled: true, audioInMs: 0, status: "draft", createdAt: at, updatedAt: at,
    });
    const serializedV4 = JSON.stringify({ revision: 3, document, past: [], future: [] })
      .replace('"schemaVersion":6', '"schemaVersion":4')
      .replace('"datePlacement":"inline",', "");
    expect(JSON.parse(serializedV4).document.schemaVersion).toBe(4);
    localStorage.setItem(LIFE_STORAGE_KEY, serializedV4);
    const migrated = loadLifeSnapshot("2026-09-03");
    expect(migrated.document.schemaVersion).toBe(6);
    expect(migrated.document.studio.journalEntries[0]?.recordingState).toBe("interrupted");
    expect(migrated.document.studio.memories[0]?.datePlacement).toBe("inline");
    expect(migrated.document.studio.mediaAssets[0]?.id).toBe("audio-evening");
  });

  it("stores active transaction documents once and hydrates the complete runtime record", () => {
    const before = createLifeDocument("2026-09-03");
    const after = structuredClone(before);
    after.calendar.events = after.calendar.events.map((event) => event.id === "roadmap" ? { ...event, start: 13 * 60 + 30, end: 14 * 60 + 30 } : event);
    after.calendars[after.calendar.dateKey] = structuredClone(after.calendar);
    const record = {
      id: "tx-compact", at: "2026-09-03T10:00:00.000Z", source: "type" as const,
      transcript: "Move roadmap to 3", summary: "Moved roadmap", before, after,
      actionTypes: ["calendar.request"],
      calendarChange: { transactionId: "tx-compact", summary: "Moved roadmap", detail: "Tide preserved every anchor.", transcript: "Move roadmap to 3", before: before.calendar, after: after.calendar },
    };
    const snapshot: LifeSnapshot = {
      revision: 1, document: after, past: [{ document: before }], future: [], lastTransaction: record,
    };

    expect(saveLifeSnapshot(snapshot)).toBe(true);
    const persisted = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
    expect(persisted.lastTransaction).not.toHaveProperty("before");
    expect(persisted.lastTransaction).not.toHaveProperty("after");
    expect(persisted.lastTransaction?.calendarChange).not.toHaveProperty("before");
    expect(persisted.lastTransaction?.calendarChange).not.toHaveProperty("after");

    const hydrated = loadLifeSnapshot("2026-09-03");
    expect(hydrated.lastTransaction?.before).toEqual(before);
    expect(hydrated.lastTransaction?.after).toEqual(after);
    expect(hydrated.lastTransaction?.calendarChange?.before).toEqual(before.calendar);
    expect(hydrated.lastTransaction?.calendarChange?.after).toEqual(after.calendar);
  });

  it("rejects a stale expected revision instead of overwriting newer cross-tab history", () => {
    const first: LifeSnapshot = { revision: 1, document: createLifeDocument("2026-09-03"), temporal: { todayDateKey: "2026-09-03", scope: { kind: "day", dateKey: "2026-09-03" } }, past: [], future: [] };
    expect(saveLifeSnapshot(first, 0)).toBe(true);
    const stale = { ...first, revision: 1, future: [{ document: first.document }] };
    expect(saveLifeSnapshot(stale, 0)).toBe(false);
    expect(readLifeSnapshot("2026-09-03")).toEqual(first);
  });

  it("reads the revision token without accepting malformed storage", () => {
    const snapshot = loadLifeSnapshot("2026-09-03");
    expect(saveLifeSnapshot({ ...snapshot, revision: 7 })).toBe(true);
    expect(readLifeSnapshotRevision()).toBe(7);
    localStorage.setItem(LIFE_STORAGE_KEY, '{"document":{},"revision":7}');
    expect(readLifeSnapshotRevision()).toBeUndefined();
    expect(saveLifeSnapshot({ ...snapshot, revision: 8 }, 7)).toBe(false);
  });

  it("backs up invalid hydration and recovers a usable document", () => {
    localStorage.setItem(LIFE_STORAGE_KEY, '{"document":{"schemaVersion":1}}');
    const snapshot = loadLifeSnapshot("2026-09-03");
    expect(snapshot.document.calendar.events).toHaveLength(8);
    expect(localStorage.getItem(LIFE_BACKUP_KEY)).toBe('{"document":{"schemaVersion":1}}');
  });

  it("backs up a v4 snapshot with the same calendar identity on two days instead of normalizing one away", () => {
    const document = createLifeDocument("2026-09-03");
    const duplicate = { ...document.calendar.events[0]!, dateKey: "2026-09-04", start: 600, end: 660 };
    document.calendars[duplicate.dateKey] = { dateKey: duplicate.dateKey, events: [duplicate], deferred: [], breathingRooms: [] };
    const corrupt: LifeSnapshot = { revision: 4, document, past: [], future: [] };
    const serialized = JSON.stringify(corrupt);
    localStorage.setItem(LIFE_STORAGE_KEY, serialized);
    const recovered = loadLifeSnapshot("2026-09-03");
    expect(recovered.revision).toBe(0);
    expect(localStorage.getItem(LIFE_BACKUP_KEY)).toBe(serialized);
    expect(Object.values(recovered.document.calendars).flatMap(({ events }) => events).filter(({ id }) => id === duplicate.id)).toHaveLength(1);
  });

  it("rejects corruption hidden inside undo transaction before/after documents", () => {
    const document = createLifeDocument("2026-09-03");
    const corrupt = structuredClone(document);
    corrupt.calendar.events.push({ ...corrupt.calendar.events[0]!, id: corrupt.calendar.events[1]!.id });
    const record = {
      id: "tx-corrupt", at: "2026-09-03T10:00:00.000Z", source: "type" as const,
      transcript: "Move roadmap", summary: "Moved roadmap", before: corrupt, after: document,
      actionTypes: ["calendar.request"],
    };
    const snapshot: LifeSnapshot = {
      revision: 1, document, past: [{ document, lastTransaction: record }], future: [], lastTransaction: record,
    };
    const serialized = JSON.stringify(snapshot);
    localStorage.setItem(LIFE_STORAGE_KEY, serialized);
    const recovered = loadLifeSnapshot("2026-09-03");
    expect(recovered.revision).toBe(0);
    expect(localStorage.getItem(LIFE_BACKUP_KEY)).toBe(serialized);
  });

  it("rolls to a new day without discarding the previous schedule or global life data", () => {
    const old: LifeSnapshot = { revision: 3, document: createLifeDocument("2026-09-02"), past: [], future: [] };
    old.document.captures.push({ id: "capture-rollover", kind: "capture", title: "Keep me", status: "unresolved", source: "typed", createdAt: "2026-09-02T20:00:00.000Z", updatedAt: "2026-09-02T20:00:00.000Z" });
    localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(old));
    const rolled = loadLifeSnapshot("2026-09-03");
    expect(rolled.document.calendar.dateKey).toBe("2026-09-03");
    expect(rolled.document.calendars["2026-09-02"]?.events).toHaveLength(8);
    expect(rolled.document.captures).toContainEqual(expect.objectContaining({ id: "capture-rollover" }));
    expect(readLifeSnapshot("2026-09-03")?.document.captures).toContainEqual(expect.objectContaining({ id: "capture-rollover" }));
  });

  it("migrates rollover through current, undo, redo, and transaction documents without losing identities", () => {
    const before = createLifeDocument("2026-09-02");
    before.captures.push({ id: "capture-history", kind: "capture", title: "Keep the complete timeline", status: "unresolved", source: "typed", createdAt: "2026-09-02T18:00:00.000Z", updatedAt: "2026-09-02T18:00:00.000Z" });
    const after = structuredClone(before);
    after.people.push({ id: "person-maya", kind: "person", name: "Maya", createdAt: "2026-09-02T18:01:00.000Z", updatedAt: "2026-09-02T18:01:00.000Z" });
    const record = {
      id: "tx-history", at: "2026-09-02T18:01:00.000Z", source: "type" as const, transcript: "Add Maya",
      summary: "Added Maya", before, after, actionTypes: ["person.ensure"],
    };
    const legacy: LifeSnapshot = {
      revision: 9,
      document: after,
      temporal: { todayDateKey: "2026-09-02", scope: { kind: "day", dateKey: "2026-09-02" } },
      past: [{ document: before, lastTransaction: record }],
      future: [{ document: after, lastTransaction: record }],
      lastTransaction: record,
    };
    // Exercise the real persisted v3 reader without weakening the strongly
    // typed production model to admit legacy documents at runtime.
    const serializedV3 = JSON.stringify(legacy).replaceAll('"schemaVersion":6', '"schemaVersion":3');
    expect(JSON.parse(serializedV3).document.schemaVersion).toBe(3);
    expect(serializedV3).not.toContain('"schemaVersion":6');
    localStorage.setItem(LIFE_STORAGE_KEY, serializedV3);
    const migrated = loadLifeSnapshot("2026-09-03");
    const documents = [
      migrated.document,
      ...migrated.past.map(({ document }) => document),
      ...migrated.future.map(({ document }) => document),
      migrated.lastTransaction?.before,
      migrated.lastTransaction?.after,
      migrated.past[0]?.lastTransaction?.before,
      migrated.future[0]?.lastTransaction?.after,
    ].filter((document): document is NonNullable<typeof document> => Boolean(document));
    expect(documents.every(({ schemaVersion }) => schemaVersion === 6)).toBe(true);
    expect(documents.every(({ calendars }) => calendars["2026-09-02"]?.events.length === 8)).toBe(true);
    expect(documents.every(({ captures }) => captures.some(({ id }) => id === "capture-history"))).toBe(true);
    expect(migrated.document.people).toContainEqual(expect.objectContaining({ id: "person-maya" }));
    expect(migrated.document.calendar.dateKey).toBe("2026-09-03");
    expect(migrated.past).toHaveLength(1);
    expect(migrated.future).toHaveLength(1);
  });

  it("safely removes only historically proven voice navigation captures across undo and redo", () => {
    const before = createLifeDocument("2026-09-03");
    const after = structuredClone(before);
    const createdAt = "2026-09-03T10:00:00.000Z";
    after.captures.push(
      { id: "capture-bad", kind: "capture", title: "Open calendar", status: "unresolved", source: "voice", createdAt, updatedAt: createdAt },
      { id: "capture-explicit", kind: "capture", title: "open calendar", status: "unresolved", source: "voice", createdAt, updatedAt: createdAt },
      { id: "capture-unproven", kind: "capture", title: "Open inbox", status: "unresolved", source: "voice", createdAt, updatedAt: createdAt },
    );
    const badAfter = structuredClone(before); badAfter.captures.push(after.captures[0]!);
    const explicitAfter = structuredClone(before); explicitAfter.captures.push(after.captures[1]!);
    const badRecord = {
      id: "tx-bad", at: createdAt, source: "voice", transcript: "Open the calendar", summary: "Captured in Inbox.",
      before, after: badAfter, actionTypes: ["capture.create"],
    };
    const explicitRecord = {
      id: "tx-explicit", at: createdAt, source: "voice", transcript: "Remember to open calendar", summary: "Captured in Inbox.",
      before, after: explicitAfter, actionTypes: ["capture.create"],
    };
    const legacy = {
      document: { ...after, schemaVersion: 1 },
      past: [{ document: { ...before, schemaVersion: 1 }, lastTransaction: explicitRecord }],
      future: [{ document: { ...after, schemaVersion: 1 }, lastTransaction: badRecord }],
      lastTransaction: badRecord,
    };
    const serialized = JSON.stringify(legacy);
    localStorage.setItem(LEGACY_LIFE_STORAGE_KEY, serialized);

    const migrated = loadLifeSnapshot("2026-09-03");
    for (const document of [migrated.document, ...migrated.past.map(({ document }) => document), ...migrated.future.map(({ document }) => document)]) {
      expect(document.captures.some(({ id }) => id === "capture-bad")).toBe(false);
    }
    expect(migrated.document.captures.map(({ id }) => id)).toEqual(["capture-explicit", "capture-unproven"]);
    expect(localStorage.getItem(LIFE_BACKUP_KEY)).toBe(serialized);
    expect(loadLifeSnapshot("2026-09-03")).toEqual(migrated);
  });
});
