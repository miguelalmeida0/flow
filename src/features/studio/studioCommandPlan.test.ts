import { beforeEach, describe, expect, it } from "vitest";
import type { LifeContext, LifeDocument } from "../../domain/life-model";
import { createLifeDocument } from "../../domain/life-storage";
import { applyLifeTransaction } from "../../domain/life-transaction";
import type { JournalEntry, StudioMediaAsset } from "../../domain/studio-model";
import { cloneAtmosphereLayers } from "../../domain/studio-model";
import { interpretGlobalCommand } from "../../shared/command/globalInterpreter";
import type { StudioIntent } from "./interpretation/studioInterpreter";
import { planStudioCommand } from "./studioCommandPlan";
import { uniqueLifeId } from "../../domain/life-factories";

const now = new Date("2026-09-05T19:30:00.000Z");
const dateKey = "2026-09-05";

function context(patch: Partial<LifeContext> = {}): LifeContext {
  return { route: "home", currentWorld: "home", nowMs: now.getTime(), epoch: 0, turn: 0, ...patch };
}

function entryFixture(document: LifeDocument, patch: Partial<JournalEntry> = {}) {
  const entry: JournalEntry = {
    id: "journal-evening", kind: "journal-entry", title: "Evening walk", text: "The street was quiet after the rain.", status: "draft",
    recordingState: "idle", recordingDurationMs: 42_000, photoAssetIds: [], bookmarks: [], transcriptSegments: [], drawings: [], tags: [],
    createdAt: now.toISOString(), updatedAt: now.toISOString(), ...patch,
  };
  document.studio.journalEntries.push(entry);
  return entry;
}

function plan(transcript: string, document: LifeDocument, patch: Partial<LifeContext> = {}) {
  const intent = interpretGlobalCommand(transcript, context(patch), dateKey);
  return { intent, result: planStudioCommand(intent as StudioIntent, document, context(patch), now) };
}

beforeEach(() => localStorage.clear());

describe("Living Studio command planning", () => {
  it.each([
    ["Start the Hidden piano sound", "short"],
    ['Start "The Hidden piano sound"', "literal"],
  ])("distinguishes a sound descriptor from a fully quoted preset name: %s", (utterance, target) => {
    const document = createLifeDocument(dateKey), original = document.studio.atmospherePresets[0]!;
    document.studio.atmospherePresets.push({ ...structuredClone(original), id: "short", name: "Hidden piano", builtIn: false }, { ...structuredClone(original), id: "literal", name: "The Hidden piano sound", builtIn: false });
    const before = structuredClone(document);
    const result = plan(utterance, document, { route: "atmosphere", topic: "atmosphere" }).result;
    expect(result).toMatchObject({ status: "ready", actions: [{ type: "atmosphere.activate", state: { presetId: target } }, { type: "workspace.update" }] });
    expect(document).toEqual(before);
  });
  it("never substitutes the active user preset for an explicitly named original preset", () => {
    const document = createLifeDocument(dateKey);
    const original = document.studio.atmospherePresets[0]!;
    document.studio.atmospherePresets.push({ ...original, id: "user-mix", name: "My mix", builtIn: false });
    document.studio.activeAtmosphere = { presetId: "user-mix", playing: true, muted: false, masterVolume: original.masterVolume, layers: cloneAtmosphereLayers(original.layers) };
    const before = structuredClone(document);
    const ctx: Partial<LifeContext> = { route: "atmosphere", topic: "atmosphere" };
    expect(plan("Delete the original Sunday evening preset", document, ctx).result).toMatchObject({ status: "feedback", title: "Keep the original atmosphere" });
    expect(plan("Delete the original Missing preset", document, ctx).result.status).toBe("clarification");
    expect(document).toEqual(before);
  });
  it("binds explicit source-Journal language to the Memory link rather than another active entry", () => {
    const document = createLifeDocument(dateKey); const entry = entryFixture(document);
    entryFixture(document, { id: "J2", title: "Unrelated active entry" });
    document.studio.memories.push({ id: "M1", kind: "memory", journalEntryId: entry.id, title: "Linked memory", passage: "Kept words", composition: "page", textScale: 1, textOffset: { x: 0, y: 0 }, showDate: false, datePlacement: "inline", audioEnabled: false, audioInMs: 0, status: "draft", createdAt: now.toISOString(), updatedAt: now.toISOString() });
    const before = structuredClone(document);
    const ctx: Partial<LifeContext> = { route: "memories", topic: "memory", activeMemoryId: "M1", activeJournalEntryId: "J2" };
    expect(plan('Rename the source journal to "A memory called Home"', document, ctx).result).toMatchObject({ status: "ready", actions: [{ type: "journal.update", entryId: entry.id, patch: { title: "A memory called Home" } }] });
    expect(plan("Open the journal this memory came from", document, ctx).result).toMatchObject({ status: "ready", actions: [], navigateTo: "journal", focusId: entry.id });
    expect(document).toEqual(before);
    document.studio.journalEntries = document.studio.journalEntries.filter(({ id }) => id !== entry.id);
    expect(plan('Rename the source journal to "Do not retarget"', document, ctx).result.status).toBe("clarification");
    expect(document.studio.journalEntries[0]!.title).toBe("Unrelated active entry");
  });
  it("edits the explicitly selected first paragraph instead of the last paragraph", () => {
    const document = createLifeDocument(dateKey);
    const entry = entryFixture(document, { text: "First paragraph stays here.\n\nLast paragraph is unrelated." });
    const before = structuredClone(document);
    const { result } = plan("Change this paragraph to Exact replacement.", document, { route: "journal", activeJournalEntryId: entry.id, selectedJournalPassage: "First paragraph stays here." });
    expect(result).toMatchObject({ status: "ready", actions: [{ type: "journal.update", entryId: entry.id, patch: { text: "Exact replacement.\n\nLast paragraph is unrelated." } }] });
    expect(document).toEqual(before);
  });
  it.each([undefined, "A stale selected passage", "Same paragraph."])("does not guess a paragraph from absent, stale or duplicate selection: %s", (selectedJournalPassage) => {
    const document = createLifeDocument(dateKey);
    const entry = entryFixture(document, { text: "Same paragraph.\n\nSame paragraph." });
    const before = structuredClone(document);
    const { result } = plan("Change this paragraph to Replace exactly the selected one.", document, { route: "journal", activeJournalEntryId: entry.id, selectedJournalPassage });
    expect(result.status).toBe("clarification");
    expect(document).toEqual(before);
  });
  it("plans playback of an existing Journal bookmark without starting a recorder or changing data", () => {
    const document = createLifeDocument(dateKey);
    const entry = entryFixture(document, { audioAssetId: "original-voice", bookmarks: [{ id: "B1", timestampMs: 15000, createdAt: now.toISOString() }, { id: "B2", timestampMs: 32000, createdAt: now.toISOString() }] });
    const before = structuredClone(document);
    const { intent, result } = plan("Play journal bookmark 2", document, { route: "journal", activeJournalEntryId: entry.id });
    expect(intent).toEqual({ type: "journal-playback", mode: "play", bookmarkOrdinal: 2 });
    expect(result).toMatchObject({ status: "ready", actions: [], runtimeCommands: [{ target: "journal-playback", mode: "play", entryId: entry.id, positionMs: 32000 }], contextPatch: { selectedBookmarkId: "B2", journalPositionMs: 32000 } });
    expect(document).toEqual(before);
  });
  it("uses the Memory's own source for photo and bookmark selection despite another active Journal", () => {
    const document = createLifeDocument(dateKey);
    const entry = entryFixture(document, { photoAssetIds: ["source-photo"], audioAssetId: "source-audio", bookmarks: [{ id: "source-mark", timestampMs: 7200, createdAt: now.toISOString() }] });
    entryFixture(document, { id: "other-entry", photoAssetIds: ["other-photo"], bookmarks: [{ id: "other-mark", timestampMs: 900, createdAt: now.toISOString() }] });
    document.studio.memories.push({ id: "memory-source", kind: "memory", title: "Source memory", journalEntryId: entry.id, passage: "Source words", composition: "page", showDate: true, datePlacement: "inline", textScale: 1, textOffset: { x: 0, y: 0 }, audioEnabled: false, audioInMs: 0, status: "draft", createdAt: now.toISOString(), updatedAt: now.toISOString() });
    const ctx = context({ route: "memories", topic: "memory", activeMemoryId: "memory-source", activeJournalEntryId: "other-entry" });
    const before = structuredClone(document);
    for (const [source, patch] of [["photo", { photoAssetId: "source-photo" }], ["bookmark", { bookmarkId: "source-mark", audioInMs: 7200, audioEnabled: true }]] as const) {
      const result = planStudioCommand({ type: "studio-source-select", source, ordinal: 1, operation: "select" }, document, ctx, now);
      expect(result).toMatchObject({ status: "ready", actions: [{ type: "memory.update", memoryId: "memory-source", patch }] });
    }
    document.studio.journalEntries = document.studio.journalEntries.filter(({ id }) => id !== entry.id);
    expect(planStudioCommand({ type: "studio-source-select", source: "photo", ordinal: 1, operation: "select" }, document, ctx, now).status).toBe("clarification");
    document.studio.journalEntries = before.studio.journalEntries;
    expect(document).toEqual(before);
  });
  it.each([
    { selectedJournalPassage: undefined, recentJournalSegment: undefined, expected: undefined },
    { selectedJournalPassage: "Unrelated words", recentJournalSegment: undefined, expected: undefined },
    { selectedJournalPassage: "quiet after the rain", recentJournalSegment: undefined, expected: "quiet after the rain" },
    { selectedJournalPassage: undefined, recentJournalSegment: { entryId: "other-entry", segmentId: "S1", text: "quiet after the rain", at: now.getTime() }, expected: undefined },
    { selectedJournalPassage: undefined, recentJournalSegment: { entryId: "journal-evening", segmentId: "S1", text: "quiet after the rain", at: now.getTime() }, expected: "quiet after the rain" },
  ])("grounds a demonstrative Memory passage in its own selected or recent source: $expected", ({ expected, ...selection }) => {
    const document = createLifeDocument(dateKey), entry = entryFixture(document);
    document.studio.memories.push({ id: "M1", kind: "memory", journalEntryId: entry.id, title: "Kept memory", passage: "Kept words", composition: "page", showDate: true, datePlacement: "inline", textScale: 1, textOffset: { x: 0, y: 0 }, audioEnabled: false, audioInMs: 0, status: "draft", createdAt: now.toISOString(), updatedAt: now.toISOString() });
    const before = structuredClone(document);
    const result = plan("Use this passage", document, { route: "memories", activeMemoryId: "M1", ...selection }).result;
    if (expected) expect(result).toMatchObject({ status: "ready", actions: [{ type: "memory.update", memoryId: "M1", patch: { passage: expected } }] });
    else expect(result).toMatchObject({ status: "clarification", title: "Which passage should I use?" });
    expect(document).toEqual(before);
  });
  it("selects a named Journal entry without creating or modifying data", () => {
    const document = createLifeDocument(dateKey);
    const entry = entryFixture(document, { title: "Rain and windows" });
    entryFixture(document, { id: "other-journal", title: "Other entry" });
    const before = structuredClone(document);
    const { intent, result } = plan('Open journal entry "Rain and windows"', document);
    expect(intent.type).toBe("studio-select");
    expect(result).toMatchObject({ status: "ready", actions: [], focusId: entry.id, navigateTo: "journal", contextPatch: { activeJournalEntryId: entry.id } });
    expect(document).toEqual(before);
  });

  it("resolves source ordinals against the entry's real ordered identities", () => {
    const document = createLifeDocument(dateKey);
    const entry = entryFixture(document, { photoAssetIds: ["photo-first", "photo-second"], bookmarks: [{ id: "mark-first", timestampMs: 1000, createdAt: now.toISOString() }, { id: "mark-second", timestampMs: 12500, transcriptAnchor: "Selected words", createdAt: now.toISOString() }] });
    const { result } = plan("Use the second photo", document, { route: "journal", topic: "journal", activeJournalEntryId: entry.id });
    expect(result).toMatchObject({ status: "ready", actions: [], contextPatch: { selectedPhotoAssetId: "photo-second" } });
    const missing = plan("Use the third photo", document, { route: "journal", topic: "journal", activeJournalEntryId: entry.id });
    expect(missing.result.status).toBe("clarification");
    const removal = plan("Remove the second attached photo", document, { route: "journal", topic: "journal", activeJournalEntryId: entry.id });
    expect(removal.result).toMatchObject({ status: "confirmation", actions: [{ type: "journal.photo.remove", entryId: entry.id, assetId: "photo-second" }] });
  });
  it("grounds an explicit Journal edit or deletion in the selected Memory's real source", () => {
    const document = createLifeDocument(dateKey);
    const entry = entryFixture(document);
    document.studio.memories.push({ id: "memory-linked", kind: "memory", title: "A memory", journalEntryId: entry.id, passage: "Kept words", composition: "page", showDate: true, datePlacement: "inline", textScale: 1, textOffset: { x: 0, y: 0 }, audioEnabled: false, audioInMs: 0, status: "draft", createdAt: now.toISOString(), updatedAt: now.toISOString() });
    const ctx = context({ route: "memories", topic: "memory", activeMemoryId: "memory-linked" });
    const before = structuredClone(document);
    const rename = planStudioCommand({ type: "journal-rename", title: "Exact linked title" }, document, ctx, now);
    expect(rename).toMatchObject({ status: "ready", actions: [{ type: "journal.update", entryId: entry.id, patch: { title: "Exact linked title" } }] });
    const deletion = planStudioCommand({ type: "journal-delete" }, document, ctx, now);
    expect(deletion).toMatchObject({ status: "confirmation", actions: [{ type: "journal.delete", entryId: entry.id }] });
    expect(deletion.status === "confirmation" ? deletion.detail : "").toContain("1 linked memory");
    expect(document).toEqual(before);
  });

  it("restores the named minimized surface rather than a different previous surface", () => {
    const document = createLifeDocument(dateKey);
    document.studio.workspace = { primary: "journal", previousPrimary: "memories", minimized: ["atmosphere", "memories"], quiet: false };
    const result = planStudioCommand({ type: "workspace", operation: "restore", surface: "atmosphere" }, document, context({ route: "journal" }), now);
    expect(result).toMatchObject({ status: "ready", actions: [{ type: "workspace.update", patch: { primary: "atmosphere", previousPrimary: "journal", minimized: ["memories"] } }] });
  });
  it("bookmarks the same selected passage and playback position as the visible control", () => {
    const document = createLifeDocument(dateKey);
    const entry = entryFixture(document);
    const result = planStudioCommand({ type: "journal-bookmark", anchor: "selection" }, document, context({ route: "journal", activeJournalEntryId: entry.id, selectedJournalPassage: "Chosen words", journalPositionMs: 12500 }), now);
    expect(result.status === "ready" ? result.actions : []).toEqual([expect.objectContaining({ type: "journal.bookmark.add", entryId: entry.id, bookmark: expect.objectContaining({ transcriptAnchor: "Chosen words", timestampMs: 12500 }) })]);
  });
  it("never exposes an independently executable prefix of an invalid compound", () => {
    const document = createLifeDocument(dateKey);
    entryFixture(document);
    const intent = interpretGlobalCommand("Bookmark that and teleport the moon", context({ route: "journal", topic: "journal" }), dateKey);
    expect(intent.type).toBe("unsupported");
  });

  it("keeps a destructive compound whole through confirmation and preflights its suffix", () => {
    const document = createLifeDocument(dateKey);
    const entry = entryFixture(document);
    const before = structuredClone(document);
    const intent: StudioIntent = { type: "studio-compound", steps: [{ type: "journal-rename", title: "Exact New Name" }, { type: "journal-delete" }] };
    const pending = planStudioCommand(intent, document, context({ route: "journal", activeJournalEntryId: entry.id }), now);
    expect(document).toEqual(before);
    expect(pending.status).toBe("confirmation");
    if (pending.status !== "confirmation") return;
    expect(pending.actions.map(({ type }) => type)).toEqual(["journal.update", "journal.delete"]);
    const invalid = planStudioCommand({ type: "studio-compound", steps: [{ type: "journal-delete" }, { type: "journal-rename", title: "Impossible after deletion" }] }, document, context({ route: "journal", activeJournalEntryId: entry.id }), now);
    expect(invalid.status).toBe("clarification");
    expect(document).toEqual(before);
  });
  it("reserves nested drawing identities without changing existing records", () => {
    const document = createLifeDocument(dateKey);
    const entry = entryFixture(document, { drawings: [{ id: "drawing-same", color: "ink", points: [{ x: 0, y: 0 }] }, { id: "drawing-same-2", color: "tide", points: [{ x: 1, y: 1 }] }] });
    const before = structuredClone(entry.drawings);
    expect(uniqueLifeId(document, "drawing", "same")).toBe("drawing-same-3");
    expect(entry.drawings).toEqual(before);
  });

  it("allocates distinct passage and bookmark IDs when repeated content shares one recording position", () => {
    let document = createLifeDocument(dateKey);
    const entry = entryFixture(document, { text: "", recordingDurationMs: 0 });
    const patch: Partial<LifeContext> = { topic: "journal", voiceMode: "journal-longform", activeJournalEntryId: entry.id, journalPositionMs: 0 };
    for (const transcript of ["It was cool.", "It was cool.", "Bookmark that", "Bookmark that"]) {
      const { result } = plan(transcript, document, patch);
      expect(result.status).toBe("ready");
      if (result.status !== "ready") return;
      const applied = applyLifeTransaction(document, result.actions, () => now);
      expect(applied.status).toBe("success");
      if (applied.status !== "success") return;
      document = applied.document;
    }
    const saved = document.studio.journalEntries[0]!;
    expect(saved.text).toBe("It was cool. It was cool.");
    expect(saved.transcriptSegments).toHaveLength(2);
    expect(new Set(saved.transcriptSegments.map(({ id }) => id)).size).toBe(2);
    expect(saved.transcriptSegments.map(({ startMs }) => startMs)).toEqual([0, 0]);
    expect(saved.bookmarks).toHaveLength(2);
    expect(new Set(saved.bookmarks.map(({ id }) => id)).size).toBe(2);
  });

  it("creates one journal entry and workspace placement as one pure transaction", () => {
    const document = createLifeDocument(dateKey);
    const before = structuredClone(document);
    const { result } = plan("Start a journal", document);
    expect(result).toMatchObject({ status: "ready", navigateTo: "journal" });
    if (result.status !== "ready") return;
    expect(result.actions.map(({ type }) => type)).toEqual(["journal.create", "workspace.update"]);
    const applied = applyLifeTransaction(document, result.actions, () => now);
    expect(applied.status).toBe("success");
    expect(document).toEqual(before);
    expect(applied.status === "success" ? applied.document.studio.journalEntries : []).toHaveLength(1);
  });

  it("turns long-form speech and a contextual bookmark into deterministic actions", () => {
    const document = createLifeDocument(dateKey);
    const entry = entryFixture(document);
    const speech = plan("I finally made the call", document, { topic: "journal", voiceMode: "journal-longform", activeJournalEntryId: entry.id });
    expect(speech.intent).toMatchObject({ type: "journal-append", text: "I finally made the call" });
    expect(speech.result.status === "ready" ? speech.result.actions[0] : undefined).toMatchObject({ type: "journal.segment.add", entryId: entry.id });
    const marked = plan("Bookmark what I just said", document, { topic: "journal", activeJournalEntryId: entry.id, recentJournalSegment: { entryId: entry.id, segmentId: "segment-1", text: "I finally made the call", at: now.getTime() } });
    expect(marked.result.status === "ready" ? marked.result.actions[0] : undefined).toMatchObject({ type: "journal.bookmark.add", entryId: entry.id, bookmark: { transcriptAnchor: "I finally made the call" } });
  });

  it("bookmarks a typed-only journal entry without requiring an audio asset", () => {
    const document = createLifeDocument(dateKey);
    const entry = entryFixture(document, { audioAssetId: undefined, recordingDurationMs: 0 });
    const { result } = plan("Bookmark here", document, { route: "journal", topic: "journal", activeJournalEntryId: entry.id });
    expect(result.status === "ready" ? result.actions[0] : undefined).toMatchObject({
      type: "journal.bookmark.add",
      entryId: entry.id,
      bookmark: { timestampMs: 0, transcriptAnchor: entry.text },
    });
  });

  it("records whether a long-form passage came from typed or final voice input", () => {
    const document = createLifeDocument(dateKey);
    const entry = entryFixture(document);
    const patch: Partial<LifeContext> = { topic: "journal", voiceMode: "journal-longform", activeJournalEntryId: entry.id };
    const intent = interpretGlobalCommand("A passage with a known source", context(patch), dateKey) as StudioIntent;
    const typed = planStudioCommand(intent, document, context(patch), now, "typed");
    const voice = planStudioCommand(intent, document, context(patch), now, "voice");
    expect(typed.status === "ready" ? typed.actions[0] : undefined).toMatchObject({ segment: { source: "typed" } });
    expect(voice.status === "ready" ? voice.actions[0] : undefined).toMatchObject({ segment: { source: "voice" } });
  });

  it("asks one focused question when an explicitly requested photo is ambiguous", () => {
    const document = createLifeDocument(dateKey);
    const photos: StudioMediaAsset[] = ["one", "two"].map((id) => ({ id: `photo-${id}`, kind: "journal-photo", name: `${id}.jpg`, mimeType: "image/jpeg", size: 4, createdAt: now.toISOString() }));
    document.studio.mediaAssets.push(...photos);
    const entry = entryFixture(document, { photoAssetIds: photos.map(({ id }) => id) });
    const { result } = plan("Make a memory from this photo", document, { topic: "journal", activeJournalEntryId: entry.id });
    expect(result).toMatchObject({ status: "clarification", title: "Which photograph should I use?" });
  });

  it("composes from the exact selected photograph and bookmark", () => {
    const document = createLifeDocument(dateKey);
    const asset: StudioMediaAsset = { id: "photo-one", kind: "journal-photo", name: "one.jpg", mimeType: "image/jpeg", size: 4, createdAt: now.toISOString() };
    document.studio.mediaAssets.push(asset);
    const entry = entryFixture(document, { audioAssetId: undefined, photoAssetIds: [asset.id], bookmarks: [{ id: "bookmark-one", timestampMs: 12_000, transcriptAnchor: "The street was quiet.", createdAt: now.toISOString() }] });
    const { result } = plan("Make a little piece from this photo and the bookmarked part", document, { topic: "journal", activeJournalEntryId: entry.id, selectedPhotoAssetId: asset.id, selectedBookmarkId: "bookmark-one" });
    expect(result.status === "ready" ? result.actions[0] : undefined).toMatchObject({ type: "memory.create", memory: { journalEntryId: entry.id, photoAssetId: asset.id, bookmarkId: "bookmark-one", audioInMs: 12_000 } });
  });

  it("persists constrained memory date placement and reversible photo visibility", () => {
    const document = createLifeDocument(dateKey);
    const asset: StudioMediaAsset = { id: "photo-one", kind: "journal-photo", name: "one.jpg", mimeType: "image/jpeg", size: 4, createdAt: now.toISOString() };
    document.studio.mediaAssets.push(asset);
    const entry = entryFixture(document, { photoAssetIds: [asset.id] });
    const created = plan("Make a memory from this photo", document, { topic: "journal", activeJournalEntryId: entry.id, selectedPhotoAssetId: asset.id });
    if (created.result.status !== "ready") return;
    const applied = applyLifeTransaction(document, created.result.actions, () => now);
    if (applied.status !== "success") return;
    const memory = applied.document.studio.memories[0]!;
    const corner = plan("Put the date in the corner", applied.document, { topic: "memory", activeMemoryId: memory.id });
    expect(corner.result.status === "ready" ? corner.result.actions[0] : undefined).toMatchObject({ type: "memory.update", patch: { showDate: true, datePlacement: "corner" } });
    const removed = plan("Remove the photo", applied.document, { topic: "memory", activeMemoryId: memory.id });
    expect(removed.result.status === "ready" ? removed.result.actions[0] : undefined).toMatchObject({ type: "memory.update", patch: { photoAssetId: undefined } });
    const restored = plan("Bring the photo back", applied.document, { topic: "memory", activeMemoryId: memory.id, selectedPhotoAssetId: asset.id });
    expect(restored.result.status === "ready" ? restored.result.actions[0] : undefined).toMatchObject({ type: "memory.update", patch: { photoAssetId: asset.id } });
  });

  it("plays, shapes, names, mutes, and un-mutes the same local atmosphere state", () => {
    const document = createLifeDocument(dateKey);
    const opened = plan("Play Sunday evening", document);
    expect(opened.result.status).toBe("ready");
    if (opened.result.status !== "ready") return;
    const active = applyLifeTransaction(document, opened.result.actions, () => now);
    expect(active.status).toBe("success");
    if (active.status !== "success") return;
    const quieter = plan("Less rain", active.document);
    expect(quieter.result.status === "ready" ? quieter.result.actions[0] : undefined).toMatchObject({ type: "atmosphere.layer.update", layerId: "rain" });
    const muted = applyLifeTransaction(active.document, [{ type: "atmosphere.playback", playing: false, muted: true }], () => now);
    expect(muted.status).toBe("success");
    if (muted.status !== "success") return;
    const resumed = plan("Resume the atmosphere", muted.document);
    expect(resumed.result.status === "ready" ? resumed.result.actions[0] : undefined).toEqual({ type: "atmosphere.playback", playing: true, muted: false });
  });

  it("preserves the authored casing of a named atmosphere", () => {
    const document = createLifeDocument(dateKey);
    const opened = plan("Play Sunday evening", document);
    if (opened.result.status !== "ready") return;
    const active = applyLifeTransaction(document, opened.result.actions, () => now);
    if (active.status !== "success") return;
    const named = plan("Save this as Sunday evening studio", active.document, { route: "atmosphere", topic: "atmosphere" });
    expect(named.result.status === "ready" ? named.result.actions[0] : undefined).toMatchObject({
      type: "atmosphere.preset.create",
      preset: { name: "Sunday evening studio" },
    });
  });

  it("protects the built-in atmosphere without opening a doomed confirmation", () => {
    const document = createLifeDocument(dateKey);
    const opened = plan("Play Sunday evening", document);
    if (opened.result.status !== "ready") return;
    const active = applyLifeTransaction(document, opened.result.actions, () => now);
    if (active.status !== "success") return;
    expect(plan("Delete this atmosphere", active.document, { topic: "atmosphere" }).result).toMatchObject({ status: "feedback", title: "Keep the original atmosphere" });
  });

  it("plans a navigation-plus-atmosphere compound in order", () => {
    const document = createLifeDocument(dateKey);
    const { intent, result } = plan("Open my journal and play Sunday evening", document);
    expect(intent.type).toBe("studio-compound");
    expect(result).toMatchObject({ status: "ready", navigateTo: "journal" });
    expect(result.status === "ready" ? result.actions.map(({ type }) => type) : []).toEqual(["workspace.update", "atmosphere.activate", "workspace.update"]);
    if (result.status !== "ready") return;
    const applied = applyLifeTransaction(document, result.actions, () => now);
    expect(applied.status === "success" ? applied.document.studio.workspace : undefined).toMatchObject({ primary: "journal", secondary: "atmosphere" });
  });

  it("rejects a workspace occupying the same surface twice without source mutation", () => {
    const document = createLifeDocument(dateKey);
    const before = structuredClone(document);
    const result = applyLifeTransaction(document, [{ type: "workspace.update", patch: { primary: "journal", secondary: "journal" } }], () => now);
    expect(result).toMatchObject({ status: "conflict", detail: expect.stringContaining("occupies more than one place") });
    expect(document).toEqual(before);
  });

  it("treats the visible Studio route as primary when opening sound beside it", () => {
    const document = createLifeDocument(dateKey);
    const { result } = plan("Leave the music open beside it", document, { route: "journal", currentWorld: "journal", previousRoute: "home", topic: "journal" });
    expect(result.status === "ready" ? result.actions : []).toEqual([{ type: "workspace.update", patch: { primary: "journal", secondary: "atmosphere", minimized: [] } }]);
  });

  it("puts the journal away while leaving sound open without resurrecting the journal", () => {
    const document = createLifeDocument(dateKey);
    document.studio.workspace.primary = "journal";
    const { result } = plan("Put the journal away but leave the music open", document, { route: "journal", currentWorld: "journal", previousRoute: "home", topic: "journal" });
    expect(result).toMatchObject({ status: "ready", navigateTo: "home" });
    if (result.status !== "ready") return;
    const applied = applyLifeTransaction(document, result.actions, () => now);
    expect(applied.status === "success" ? applied.document.studio.workspace : undefined).toMatchObject({ secondary: "atmosphere", minimized: ["journal"] });
    expect(applied.status === "success" ? applied.document.studio.workspace.primary : "wrong").toBeUndefined();
  });

  it("returns Home when the visible Journal is put away", () => {
    const document = createLifeDocument(dateKey);
    document.studio.workspace.primary = "journal";
    const { result } = plan("Put the journal away", document, { route: "journal", currentWorld: "journal", previousRoute: "journal", topic: "journal" });
    expect(result).toMatchObject({ status: "ready", navigateTo: "home" });
  });

  it("restores the previous primary surface and removes its minimized state", () => {
    const document = createLifeDocument(dateKey);
    document.studio.workspace = { previousPrimary: "journal", secondary: "atmosphere", minimized: ["journal"], quiet: false };
    const { result } = plan("Go back to what I was doing", document, { route: "home", currentWorld: "home", previousRoute: "journal", topic: "workspace" });
    expect(result).toMatchObject({ status: "ready", navigateTo: "journal" });
    if (result.status !== "ready") return;
    const applied = applyLifeTransaction(document, result.actions, () => now);
    expect(applied.status === "success" ? applied.document.studio.workspace : undefined).toMatchObject({ primary: "journal", secondary: "atmosphere", minimized: [] });
  });

  it("expands the editable home ritual into one ordered transaction", () => {
    const document = createLifeDocument(dateKey);
    const ritual = document.studio.rituals[0]!;
    ritual.enabled = true;
    const { result } = plan("I'm home", document);
    expect(result).toMatchObject({ status: "ready", navigateTo: "home" });
    expect(result.status === "ready" ? result.actions.map(({ type }) => type) : []).toEqual(["atmosphere.activate", "workspace.update", "workspace.update"]);
  });

  it("keeps unsupported studio-looking speech side-effect free", () => {
    const document = createLifeDocument(dateKey);
    const intent = interpretGlobalCommand("Import my Spotify playlist", context({ route: "atmosphere", currentWorld: "atmosphere", topic: "atmosphere" }), dateKey);
    expect(intent).toMatchObject({ type: "unsupported" });
    expect(document.studio.mediaAssets).toHaveLength(0);
  });
});
