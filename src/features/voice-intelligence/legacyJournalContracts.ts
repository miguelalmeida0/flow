import dictation from "./legacyJournalDictationSlots.json";
import other from "./legacyJournalOtherSlots.json";
import source from "./curatedLanguageSeeds.json";
import { acceptanceFixture } from "./acceptanceFixtures";
import type { AcceptanceFixtureId } from "./acceptanceFixtures";
import type { JournalEntry } from "../../domain/studio-model";
import type { GlobalIntent } from "../../shared/command/globalInterpreter";
import type { SemanticExpectation } from "./semanticExpectation";

interface Declaration { text: string; line: number; intent: GlobalIntent["type"]; fixtureId: AcceptanceFixtureId; semantic: SemanticExpectation }
export const legacyJournalContracts = new Map<string, Declaration>();
const before = acceptanceFixture("legacy-journal-recording").snapshot.document.studio.journalEntries[0]!;
const base = { historyDelta: 1, commitCount: 1, feedbackPhase: "completed", noPending: true, noCreation: true } as const;
const records = new Map(source.map((row) => [row.id, row.utterance]));
function add(suffix: string, line: number, fixtureId: AcceptanceFixtureId, intent: GlobalIntent["type"], semantic: SemanticExpectation) {
  const id = `curated-${suffix}`, text = records.get(id);
  if (!text) throw new Error(`Missing immutable Journal text: ${id}`);
  legacyJournalContracts.set(id, { text, line, fixtureId, intent, semantic });
}
for (const row of dictation.rows) {
  const slug = `journal-curated-60000-${row.text}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  // Typed prose has no acoustic duration. Preserve the original stable ID;
  // the schema now says explicitly that this zero-width position is untimed.
  const segment = { id: `passage-${slug.slice(0, 30).replace(/-+$/, "")}-${row.hash}`, text: row.text, startMs: 60000, endMs: 60000, alignment: "untimed" as const, source: "typed" as const };
  const text = `${before.text} ${row.text.replace(/^[a-z]/, (letter) => letter.toUpperCase())}`;
  legacyJournalContracts.set(row.id, { text: row.text, line: row.line, fixtureId: "legacy-journal-recording", intent: "journal-append",
    semantic: { ...base, intent: { type: "journal-append", text: row.text }, actions: [{ type: "journal.segment.add", entryId: before.id, segment }], journalChanges: [{ id: before.id, patch: { text, transcriptSegments: [...before.transcriptSegments, segment] } }] } });
}
for (const tuple of other.rename.rows) {
  const [suffix, line, start, end, title] = tuple as [string, number, number, number, string];
  if (records.get(`curated-${suffix}`)?.slice(start, end) !== title) throw new Error(`Changed title span: ${suffix}`);
  add(suffix, line, "legacy-journal-editing", "journal-rename", { ...base, intent: { type: "journal-rename", title }, actions: [{ type: "journal.update", entryId: before.id, patch: { title } }], journalChanges: [{ id: before.id, patch: { title } }] });
}
for (const tuple of other.bookmark.rows) {
  const [suffix, line, anchor] = tuple as [string, number, "current" | "recent" | "last-sentence"];
  const bookmark = anchor === "last-sentence" ? other.bookmark.lastSentenceBookmark : other.bookmark.ordinaryBookmark;
  add(suffix, line, "legacy-journal-recording", "journal-bookmark", { ...base, intent: { type: "journal-bookmark", anchor }, actions: [{ type: "journal.bookmark.add", entryId: before.id, bookmark }], journalChanges: [{ id: before.id, patch: { bookmarks: [...before.bookmarks, bookmark] } }] });
}
for (const tuple of other.control.rows) {
  const [suffix, line, mode] = tuple as [string, number, "pause" | "resume" | "stop"];
  // Request-boundary evidence only. Native callback/history oracles are a
  // separate assertion of these same ten cases, not extra language count.
  add(suffix, line, "legacy-journal-recording", "journal-recording", { ...base, historyDelta: 0, commitCount: 0, intent: { type: "journal-recording", mode }, actions: [], runtimeCommands: [{ target: "journal", mode, entryId: before.id }] });
}
for (const tuple of other.create.rows) {
  const [suffix, line, beginRecording] = tuple as [string, number, boolean];
  const creationBefore = acceptanceFixture("legacy-journal-creation").snapshot.document.studio;
  const entry = structuredClone(other.create.newEntry) as JournalEntry;
  add(suffix, line, "legacy-journal-creation", "journal-create", { ...base, noCreation: false, intent: { type: "journal-create", beginRecording },
    actions: [{ type: "journal.create", entry }, { type: "workspace.update", patch: { primary: "journal" } }],
    studioCollections: { journalEntries: [...creationBefore.journalEntries, entry] }, studioState: { workspace: { primary: "journal", minimized: [], quiet: false } },
    runtimeCommands: beginRecording ? [{ target: "journal", mode: "start", entryId: entry.id, origin: { transactionId: "evaluation-1", revision: 1 } }] : [] });
}
