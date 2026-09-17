import { literalValue } from "../../../shared/command/literalValue";
import type { JournalEditingIntent } from "./journalCapabilities";
import type { StudioSelectionIntent } from "./studioSelection";

// This is a relationship selector, not a title search or a fallback to the
// most recently edited Journal. Only the grammatical target owns these words.
const target = "(?:the )?(?:source journal|(?:journal(?: entry)?|entry) (?:behind|underlying) (?:this|the) memory|(?:journal(?: entry)?|entry) (?:this|the) memory (?:came from|uses))";
const rename = new RegExp(`^(?:rename|call|name)\\s+${target}\\s+(?:to\\s+)?([\\s\\S]+)$`, "i");
const remove = new RegExp(`^(?:delete|remove)\\s+${target}$`, "i");
const open = new RegExp(`^(?:open|show|take me to)\\s+${target}$`, "i");

export function parseLinkedJournal(source: string): JournalEditingIntent | StudioSelectionIntent | null {
  const raw = source.trim();
  const title = raw.match(rename)?.[1];
  if (title) return { type: "journal-rename", title: literalValue(title), journalSource: "memory" };
  if (remove.test(raw)) return { type: "journal-delete", journalSource: "memory" };
  if (open.test(raw)) return { type: "studio-select", collection: "journal", selector: { source: "memory" } };
  return null;
}
