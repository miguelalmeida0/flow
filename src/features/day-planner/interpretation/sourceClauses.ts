/** Structural delimiters are read outside literal quotes. Apostrophes inside
 * words are not quote delimiters; original offsets are retained. */
export function outsideQuotedRanges(source: string, position: number) {
  let close: string | undefined;
  for (let index = 0; index < position; index += 1) {
    const char = source[index];
    if (close) { if (char === close && !((char === "'" || char === "’") && /\p{L}/u.test(source[index - 1] ?? "") && /\p{L}/u.test(source[index + 1] ?? ""))) close = undefined; }
    else if (char === '"' || char === "“") close = char === "“" ? "”" : '"';
    else if ((char === "'" || char === "‘") && !/[\p{L}\p{N}]/u.test(source[index - 1] ?? "")) close = char === "‘" ? "’" : "'";
  }
  return !close;
}

export function commandBoundary(source: string, contextualOnly = false) {
  const action = contextualOnly
    ? "(?:(?:move|put|shift|push|reschedule|resize|protect|unprotect|make|mark|color|paint|delete|remove)\\s+(?:it|this|that)\\b|(?:keep|leave)\\s+(?:its|the)\\s+(?:name|title|start|length|duration|time|scheduling)\\b|(?:rename|call|name)\\s+.+?\\s+(?:to|as)\\s+)"
    : "(?:move|put|shift|push|reschedule|resize|protect|unprotect|make|mark|color|paint|delete|remove|rename|call|name|open|show|go|play|pause|resume|keep|bookmark|save|add|create|schedule|end|finish|stop|turn|mute)\\b";
  const pattern = new RegExp(`(?:\\s+(?:and then|and|then|but)\\s+|[,;]\\s*)(?=${action})`, "gi");
  return [...source.matchAll(pattern)].find((match) => outsideQuotedRanges(source, match.index));
}
