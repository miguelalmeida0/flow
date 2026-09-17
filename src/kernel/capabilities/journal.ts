import { applyLifeTransaction } from "../../domain/life-transaction";
import type { JournalEntry } from "../../domain/studio-model";
import { fail, ok, type Capability, type CapabilityResult } from "../types";

function findEntry(entries: JournalEntry[], query: { entryId?: string; title?: string }): JournalEntry | undefined {
  if (query.entryId) return entries.find((entry) => entry.id === query.entryId);
  if (query.title) return entries.find((entry) => entry.title.toLowerCase().includes(query.title!.toLowerCase()));
  return undefined;
}

function latestEntry(entries: JournalEntry[]): JournalEntry | undefined {
  return [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export interface JournalCreateArgs {
  title?: string;
}

export interface JournalOpenArgs {
  entryId?: string;
  title?: string;
  which?: "latest" | "bookmarked";
}

export interface JournalRenameArgs {
  entryId?: string;
  title?: string;
  newTitle: string;
}

export interface JournalSearchArgs {
  query: string;
}

export interface JournalBookmarkArgs {
  entryId?: string;
  timestampMs?: number;
}

let sequence = 0;
function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

export const journalCreate: Capability<JournalCreateArgs> = {
  id: "journal.create",
  domain: "journal",
  description: "Create a new journal entry.",
  mutates: true,
  undoable: true,
  riskLevel: "low",
  requiresConfirmation: () => false,
  validate: () => null,
  execute: (args, ctx): CapabilityResult => {
    const now = ctx.clock.now().toISOString();
    const entry: JournalEntry = {
      id: nextId("journal"),
      kind: "journal-entry",
      title: args.title ?? "Untitled entry",
      text: "",
      status: "draft",
      recordingState: "idle",
      recordingDurationMs: 0,
      photoAssetIds: [],
      bookmarks: [],
      transcriptSegments: [],
      drawings: [],
      tags: [],
      createdAt: now,
      updatedAt: now,
    };
    const result = applyLifeTransaction(ctx.document, [{ type: "journal.create", entry }], ctx.clock.now);
    if (result.status !== "success") return fail("journal-create-failed", result.detail);
    return ok(
      `Created journal entry "${entry.title}".`,
      { document: result.document, navigation: { route: "journal", previousRoute: ctx.navigation.route } },
      { entityId: entry.id, entityKind: "journal-entry" },
    );
  },
};

export const journalOpen: Capability<JournalOpenArgs> = {
  id: "journal.open",
  domain: "journal",
  description: "Open a journal entry.",
  mutates: false,
  undoable: false,
  riskLevel: "low",
  requiresConfirmation: () => false,
  validate: () => null,
  execute: (args, ctx): CapabilityResult => {
    const entries = ctx.document.studio.journalEntries;
    const entry = args.which === "bookmarked" ? entries.find((item) => item.bookmarks.length > 0) : args.entryId || args.title ? findEntry(entries, args) : latestEntry(entries);
    if (!entry) return fail("not-found", "Couldn't find that journal entry.");
    return ok(
      `Opened "${entry.title}".`,
      { navigation: { route: "journal", previousRoute: ctx.navigation.route } },
      { entityId: entry.id, entityKind: "journal-entry", data: entry },
    );
  },
};

export const journalRename: Capability<JournalRenameArgs> = {
  id: "journal.rename",
  domain: "journal",
  description: "Rename a journal entry.",
  mutates: true,
  undoable: true,
  riskLevel: "low",
  requiresConfirmation: () => false,
  validate: (args) => (!args.newTitle ? "Say the new name." : null),
  execute: (args, ctx): CapabilityResult => {
    const entry = findEntry(ctx.document.studio.journalEntries, args) ?? latestEntry(ctx.document.studio.journalEntries);
    if (!entry) return fail("not-found", "Couldn't find that journal entry.");
    const result = applyLifeTransaction(ctx.document, [{ type: "journal.update", entryId: entry.id, patch: { title: args.newTitle } }], ctx.clock.now);
    if (result.status !== "success") return fail("journal-rename-failed", result.detail);
    return ok(`Renamed "${entry.title}" to "${args.newTitle}".`, { document: result.document }, { entityId: entry.id, entityKind: "journal-entry" });
  },
};

export const journalBookmark: Capability<JournalBookmarkArgs> = {
  id: "journal.bookmark",
  domain: "journal",
  description: "Bookmark a moment in a journal entry.",
  mutates: true,
  undoable: true,
  riskLevel: "low",
  requiresConfirmation: () => false,
  validate: () => null,
  execute: (args, ctx): CapabilityResult => {
    const entry = findEntry(ctx.document.studio.journalEntries, args) ?? latestEntry(ctx.document.studio.journalEntries);
    if (!entry) return fail("not-found", "Couldn't find that journal entry.");
    const now = ctx.clock.now().toISOString();
    const bookmark = { id: nextId("bookmark"), timestampMs: args.timestampMs ?? entry.recordingDurationMs, createdAt: now };
    const result = applyLifeTransaction(ctx.document, [{ type: "journal.bookmark.add", entryId: entry.id, bookmark }], ctx.clock.now);
    if (result.status !== "success") return fail("journal-bookmark-failed", result.detail);
    return ok(`Bookmarked "${entry.title}".`, { document: result.document }, { entityId: entry.id, entityKind: "journal-entry" });
  },
};

export const journalSearch: Capability<JournalSearchArgs> = {
  id: "journal.search",
  domain: "journal",
  description: "Search journal entries by text.",
  mutates: false,
  undoable: false,
  riskLevel: "low",
  requiresConfirmation: () => false,
  validate: (args) => (!args.query ? "Say what to search for." : null),
  execute: (args, ctx): CapabilityResult => {
    const needle = args.query.toLowerCase();
    const matches = ctx.document.studio.journalEntries.filter((entry) => entry.title.toLowerCase().includes(needle) || entry.text.toLowerCase().includes(needle));
    return ok(
      matches.length === 0 ? `No journal entries mention "${args.query}".` : `Found ${matches.length} journal entr${matches.length === 1 ? "y" : "ies"} mentioning "${args.query}".`,
      {},
      { data: matches.map((entry) => ({ entryId: entry.id, title: entry.title })) },
    );
  },
};

export const journalCapabilities = [journalCreate, journalOpen, journalRename, journalBookmark, journalSearch];
