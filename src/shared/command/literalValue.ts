/** Quotes around a complete value delimit it; punctuation/case inside is data. */
export function literalValue(value: string) {
  const trimmed = value.trim();
  const quoted = trimmed.match(/^(?:"([\s\S]*)"|“([\s\S]*)”|'([\s\S]*)'|‘([\s\S]*)’)$/);
  return quoted ? quoted[1] ?? quoted[2] ?? quoted[3] ?? quoted[4]! : trimmed;
}

/** Read one explicitly quoted value with its original suffix and offsets.
 * Interior apostrophes are spelling, not a closing quote. No normalization. */
export function leadingQuotedValue(source: string): { value: string; end: number; suffix: string } | null {
  const close = ({ '"': '"', "“": "”", "'": "'", "‘": "’" } as Record<string, string>)[source[0] ?? ""];
  if (!close) return null;
  for (let index = 1; index < source.length; index += 1) {
    if (source[index] !== close) continue;
    if ((close === "'" || close === "’") && /\p{L}/u.test(source[index - 1] ?? "") && /\p{L}/u.test(source[index + 1] ?? "")) continue;
    return { value: source.slice(1, index), end: index + 1, suffix: source.slice(index + 1) };
  }
  return null;
}

/** A quoted payload can have a punctuation-preservation annotation outside
 * its closing delimiter. Unknown suffixes are not silently discarded. */
export function annotatedLiteralValue(source: string): string | null {
  const text = source.trim(), quoted = leadingQuotedValue(text);
  if (!quoted) return /^["“'‘]/.test(text) ? null : text;
  return literalAnnotationValue(quoted);
}
export function literalAnnotationValue(quoted: { value: string; suffix: string }): string | null {
  const suffix = quoted.suffix.trim();
  if (!suffix || /^[.!?]$/.test(suffix)) return quoted.value;
  if (/^exactly[.!?]?$/i.test(suffix)) return quoted.value;
  const annotation = suffix.match(/^,\s*including the (comma|slash|question mark|colon|ampersand|period)[.!?]?$/i);
  const marks: Record<string, string> = { comma: ",", slash: "/", "question mark": "?", colon: ":", ampersand: "&", period: "." };
  return annotation && quoted.value.includes(marks[annotation[1]!.toLowerCase()]!) ? quoted.value : null;
}

/** Shared naming roles. The subject is structural; the value remains raw. */
export function literalAssignment(source: string): { subject: string; value: string } | null {
  const match = source.trim().match(/^(?:rename|call|name)\s+(.+?)\s+(?:to\s+)?(["“'‘][\s\S]+)$/i)
    ?? source.trim().match(/^(?:rename|change)\s+(.+?)\s+to\s+([\s\S]+)$/i)
    ?? source.trim().match(/^give\s+(.+?)\s+(?:the )?name\s+([\s\S]+)$/i);
  if (!match) return null;
  const value = annotatedLiteralValue(match[2]!);
  return value === null ? null : { subject: match[1]!, value };
}
