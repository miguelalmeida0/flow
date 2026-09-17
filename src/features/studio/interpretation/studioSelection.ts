import type { LifeContext } from "../../../domain/life-model";
import { literalValue } from "../../../shared/command/literalValue";
import { commandBoundary } from "../../day-planner/interpretation/sourceClauses";
import { parseNumberWords } from "../../day-planner/interpretation/numbers";

export type StudioObjectSelector = { ordinal: number } | { title: string } | { source: "memory" };
export type StudioSelectionIntent =
  | { type: "studio-select"; collection: "journal" | "memories"; selector: StudioObjectSelector }
  | { type: "studio-source-select"; source: "photo" | "bookmark"; ordinal: number; operation: "select" | "remove" };

const ordinals: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
const ordinal = (value: string) => ordinals[value.toLowerCase()] ?? (/^\d+$/.test(value) ? Number(value) : undefined);

/** Explicit object nouns establish a collection. Ordinals refer to the same
 * sorted collection or source ordering rendered by the editor, never seed IDs. */
export function parseStudioSelection(source: string, context: LifeContext): StudioSelectionIntent | null {
  const numberedPhoto = source.trim().match(/^use photo number (\w+) from this entry for the memory,? not a new upload[.!?]?$/i);
  if (numberedPhoto && (context.route === "memories" || context.activeMemoryId)) {
    const number = parseNumberWords(numberedPhoto[1]!);
    if (number !== null) return { type: "studio-source-select", source: "photo", ordinal: number, operation: "select" };
  }
  const raw = source.trim()
    .replace(/^use (?:the )?(.+?) bookmarked moment for (?:this|the) memory's voice$/i, "Use the $1 bookmark")
    .replace(/^switch (?:this|the) memory to (?:the )?(.+)$/i, "Use the $1");
  const byOrdinal = raw.match(/^(?:open|show|select)\s+(?:the )?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+)\s+(journal(?: entry)?|entry|memory)$/i);
  if (byOrdinal) return { type: "studio-select", collection: /memory/i.test(byOrdinal[2]!) ? "memories" : "journal", selector: { ordinal: ordinal(byOrdinal[1]!)! } };
  const byTitle = raw.match(/^(?:open|show|select)\s+(?:the )?(journal entry|journal|memory)\s+(?:(?:called|named)\s+)?(.+)$/i);
  if (byTitle) {
    const value = byTitle[2]!;
    const literal = /^["“]/.test(value) || /\b(?:called|named)\s+/i.test(raw);
    const narrative = /^(?:i|we|he|she|they|you)\s|^(?:and|then|but)\b/i.test(value);
    if ((literal || !narrative) && !commandBoundary(value)
      && !/^(?:area|space|room|page|instead|for .+|beside .+)$/i.test(value)) return { type: "studio-select", collection: /memory/i.test(byTitle[1]!) ? "memories" : "journal", selector: { title: literalValue(value) } };
  }
  const selectedSource = raw.match(/^(use|select|remove)\s+(?:the )?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+)\s+(?:attached |journal |source )?(photo|photograph|bookmark)$/i)
    ?? raw.match(/^(use|select|remove)\s+(?:the )?(?:attached |journal |source )?(photo|photograph|bookmark)\s+(\d+)$/i)?.map((value, index, all) => index === 2 ? all[3]! : index === 3 ? all[2]! : value);
  if (selectedSource && (context.route === "journal" || context.route === "memories" || context.activeJournalEntryId || context.activeMemoryId)) return {
    type: "studio-source-select", source: /bookmark/i.test(selectedSource[3]!) ? "bookmark" : "photo", ordinal: ordinal(selectedSource[2]!)!, operation: selectedSource[1]!.toLowerCase() === "remove" ? "remove" : "select",
  };
  return null;
}
