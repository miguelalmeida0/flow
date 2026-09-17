import { normalizeTranscript } from "../../features/day-planner/interpretation/normalize";
import { commandBoundary, outsideQuotedRanges } from "../../features/day-planner/interpretation/sourceClauses";

/** A repair cue edits a compatible slot; it is not a second request. Quoted
 * values and unpunctuated words inside a free-form title are untouched. */
export function correctedTranscript(source: string): string {
  if (/\bno thanks\b/i.test(source)) return source;
  const clause = commandBoundary(source, true);
  if (clause?.index !== undefined) {
    const split = clause.index + clause[0].length;
    return `${correctedTranscript(source.slice(0, clause.index))}${clause[0]}${correctedTranscript(source.slice(split))}`;
  }
  const cue = [...source.matchAll(/(?:\s*[—–;]\s*|,\s*|\s+)(actually|sorry(?:,? i mean)?|wait|no)\s*,?\s+/gi)]
    .find((candidate) => outsideQuotedRanges(source, candidate.index));
  const match = cue ? [source, source.slice(0, cue.index), cue[1], source.slice(cue.index + cue[0].length)] : undefined;
  if (!match) return source;
  const first = match[1]!.trim();
  const correction = match[3]!.trim();
  const isRename = /^(?:rename|call|name|change .+ (?:name|title)|edit .+ (?:name|title)|(?:edit|change) (?:this |that |the )?capture(?: .+)? to)\b/i.test(first);
  if (isRename && !/[—–;]\s*(?:actually|sorry|wait|no)\b|,\s*(?:sorry|wait|no)\b/i.test(source)) return source;
  // Bare `no` is a correction only with punctuation, avoiding “no later than”.
  if (match[2]?.toLowerCase() === "no" && !/[—–;,]\s*no\b/i.test(source)) return source;
  const normalized = normalizeTranscript(correction);
  if (/^(?:red|blue|green|orange|yellow|cyan|indigo|neutral|gr[ae]y)$/.test(normalized)
    && /\b(?:red|blue|green|orange|yellow|cyan|indigo|neutral|gr[ae]y)\s*$/i.test(first)) {
    return first.replace(/\b(?:red|blue|green|orange|yellow|cyan|indigo|neutral|gr[ae]y)\s*$/i, correction);
  }
  if (isRename) {
    const boundary = first.match(/^(.*?\b(?:to|as)\s+).+$/i)
      ?? first.match(/^((?:rename|call|name)\s+(?:it|this(?: one| event| meeting| journal| entry)?|that(?: one| event| meeting| journal| entry)?)\s+).+$/i);
    if (boundary) return `${boundary[1]}${correction}`;
  }
  if (/^(?:open|show|go|take|bring|return|rename|delete|cancel|move|make|change|play|stop|pause)\b/.test(normalized)) return correction;
  if (/^(?:\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?::\d{2})?(?:\s*(?:am|pm))?$/.test(normalized)) {
    if (/\b(?:to|at|for)\s+[^,;—–]+$/i.test(first)) return first.replace(/\b(to|at|for)\s+[^,;—–]+$/i, `$1 ${correction}`);
  }
  if (/^(?:today|tomorrow|(?:this |next )?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))$/.test(normalized)) {
    const previousDate = /\b(?:today|tomorrow|(?:this |next )?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b\s*$/i;
    return previousDate.test(first) ? first.replace(previousDate, correction) : correction;
  }
  if (/^(?:journal|calendar|capture|outcomes|commitments|home)$/.test(normalized)) return correction;
  return source;
}
