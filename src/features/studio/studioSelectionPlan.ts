import type { LifeContext, LifeDocument } from "../../domain/life-model";
import type { JournalEntry, MemoryArtifact } from "../../domain/studio-model";
import { referenceFor } from "../../app/conversationContext";
import type { StudioSelectionIntent } from "./interpretation/studioSelection";
import type { StudioCommandPlan } from "./studioCommandPlan";

export function planStudioSelection(intent: StudioSelectionIntent, document: LifeDocument, context: LifeContext, atMs: number, entry?: JournalEntry, memory?: MemoryArtifact): StudioCommandPlan {
  if (intent.type === "studio-select") {
    const collection = [...(intent.collection === "journal" ? document.studio.journalEntries : document.studio.memories)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const selector = intent.selector;
    const matches = "source" in selector ? collection.filter(({ id }) => id === memory?.journalEntryId)
      : "ordinal" in selector ? collection.slice(selector.ordinal - 1, selector.ordinal)
      : "bookmarked" in selector ? collection.filter((item): item is JournalEntry => "bookmarks" in item && item.bookmarks.length > 0).slice(0, 1)
      : collection.filter(({ title }) => title.toLocaleLowerCase() === selector.title.toLocaleLowerCase());
    if (matches.length !== 1 || "ordinal" in selector && selector.ordinal < 1) {
      if (!matches.length && !collection.length) {
        return intent.collection === "journal"
          ? { status: "clarification", title: "There is no journal entry yet.", detail: "Say “start a new entry” to begin one." }
          : { status: "clarification", title: "There is no memory yet.", detail: "Create one from a journal entry first." };
      }
      return { status: "clarification", title: matches.length ? "Which one should I open?" : "I couldn't find that item.", detail: (matches.length ? matches : collection).slice(0, 3).map(({ title }) => title).join(" · ") || "Nothing was created or changed." };
    }
    const item = matches[0]!;
    // Selecting a Journal entry/memory is legacy's own "open X" mechanism —
    // it must also stamp the shared selected/lastReferenced referent (the
    // same fields navigateConversation/restoreConversationFromTransaction
    // already read) so a kernel follow-up like "bookmark it" can resolve the
    // entry the user just opened, without a second bridge-local store.
    const reference = referenceFor(document, item.id, atMs);
    return { status: "ready", actions: [], summary: `Opened ${item.title}.`, navigateTo: intent.collection, focusId: item.id, runtimeCommands: [], contextPatch: { ...(intent.collection === "journal" ? { activeJournalEntryId: item.id, topic: "journal", voiceMode: "command" } : { activeMemoryId: item.id, topic: "memory", voiceMode: "command" }), ...(reference ? { selected: reference, lastReferenced: reference } : {}) } };
  }
  const useInMemory = Boolean(memory && (context.route === "memories" || context.topic === "memory"));
  // A Memory's source controls refer to its linked entry, not whichever
  // unrelated Journal happened to be edited most recently.
  if (useInMemory) entry = document.studio.journalEntries.find(({ id }) => id === memory!.journalEntryId);
  if (!entry) return { status: "clarification", title: "Which Journal source should I use?", detail: "Open an entry or a memory with a source first. Nothing changed." };
  const sourceId = intent.source === "photo" ? entry.photoAssetIds[intent.ordinal - 1] : entry.bookmarks[intent.ordinal - 1]?.id;
  if (!sourceId || intent.ordinal < 1) return { status: "clarification", title: `There is no ${intent.source} ${intent.ordinal}.`, detail: `This entry has ${intent.source === "photo" ? entry.photoAssetIds.length : entry.bookmarks.length} ${intent.source === "photo" ? "photographs" : "bookmarks"}. Nothing changed.` };
  if (intent.operation === "remove") {
    if (intent.source === "bookmark") return { status: "clarification", title: "Bookmark removal isn't available.", detail: "Nothing was removed." };
    return { status: "confirmation", title: `Remove photograph ${intent.ordinal} from ${entry.title}?`, detail: "The entry text stays. Undo restores the photograph reference; the original remains local.", actions: [{ type: "journal.photo.remove", entryId: entry.id, assetId: sourceId }], runtimeCommands: [] };
  }
  const bookmark = entry.bookmarks.find(({ id }) => id === sourceId);
  return { status: "ready", actions: useInMemory ? [{ type: "memory.update", memoryId: memory!.id, patch: intent.source === "photo" ? { photoAssetId: sourceId } : { bookmarkId: sourceId, audioInMs: bookmark!.timestampMs, audioEnabled: Boolean(entry.audioAssetId) } }] : [], summary: `${intent.source === "photo" ? "Photograph" : "Bookmark"} ${intent.ordinal} selected.`, runtimeCommands: [], contextPatch: { ...(useInMemory ? { activeMemoryId: memory!.id, topic: "memory" as const } : { activeJournalEntryId: entry.id, topic: "journal" as const }), ...(intent.source === "photo" ? { selectedPhotoAssetId: sourceId } : { selectedBookmarkId: sourceId, journalPositionMs: bookmark!.timestampMs }) } };
}
