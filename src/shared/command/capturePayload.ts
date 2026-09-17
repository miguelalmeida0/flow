import { normalizeTranscript } from "../../features/day-planner/interpretation/normalize";
import { annotatedLiteralValue } from "./literalValue";

/** Read the longest complete capture frame before its literal payload. */
export function parseExplicitCapture(transcript: string): string | null {
  if (/^remember\s+(?:is|was|means|refers to)\b/i.test(transcript)) return null;
  const remember = transcript.match(/^remember\s+that\s+([\s\S]+)$/i);
  // “that address” is a demonstrative noun phrase; “that Maya likes tea”
  // introduces a clause. Preserve that when no bounded clause cue exists.
  const clause = remember && /^.+\s(?:is|are|was|were|has|have|had|will|would|can|could|should|must|changed|arrived|expired|likes|needs|starts|ends|means|works)(?:\s|$)/i.test(remember[1]!);
  const match = transcript.match(/^add to (?:inbox|capture):\s*([\s\S]+)$/i)
    ?? transcript.match(/^(?:add|save|put|log)\s+([\s\S]+?)\s+(?:to|in)\s+(?:my\s+)?(?:inbox|capture)$/i)
    ?? transcript.match(/^note that i should\s+([\s\S]+)$/i)
    ?? transcript.match(/^save for later:?\s+([\s\S]+)$/i)
    ?? transcript.match(/^(?:capture|remember(?: to)?|note(?: that)?|jot down|write down|log):?\s+([\s\S]+)$/i)
    ?? transcript.match(/^keep (?:this|that) for later:\s*([\s\S]+)$/i)
    ?? transcript.match(/^save\s+([\s\S]+?)\s+for later$/i)
    ?? transcript.match(/^save\s+([\s\S]+)$/i);
  const value = clause ? remember[1]! : match?.[1];
  const title = value ? annotatedLiteralValue(value.replace(/[.!?]+$/g, "").trim()) : null;
  return title && (/^["“'‘]/.test(value?.trim() ?? "") || !/^(?:this|that|it|area|page|screen|section|view|space|inbox)$/.test(normalizeTranscript(title))) ? title : null;
}
