import { outsideQuotedRanges } from "./sourceClauses";
import { protectCreationValue } from "./creationValue";

/** Explicit Calendar request framing, not generic aspiration removal. */
export function calendarCommandSource(source: string, today: string) {
  let raw = source.replace(/^i\s+(?:want|need)\s+to\s+(?=(?:schedule|book|block)\b)/i, "");
  raw = raw.replace(/^(?:(?:please|actually|uh|um)[, ]+|(?:can|could|would)\s+you\s+(?:please\s+)?|i\s+(?:need|want)\s+you\s+to\s+)+/i, "");
  const named = raw.match(/\b(?:called|named)\s+/i), value = named && protectCreationValue(raw, today);
  const valueStart = named?.index === undefined ? -1 : named.index + named[0].length;
  const inNamedValue = (offset: number) => Boolean(value && offset >= valueStart && offset < valueStart + value.value.length);
  // Recognition can omit a space at a structural slot boundary. Quoted titles
  // remain opaque, as do ordinary words containing these letters.
  return raw.replace(/\b(at|an?)(?=\d{1,2}(?::|\s*(?:am|pm|a\.?m\.?|p\.?m\.?))\b)|\b(on)(?=(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b)/gi,
    (match, _clock: string, _date: string, offset: number) => outsideQuotedRanges(raw, offset) && !inNamedValue(offset) ? `${match} ` : match);
}
