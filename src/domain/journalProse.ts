/** Raw ASR remains on each segment. Only the readable document projection
 * receives sentence joins; an ASR final boundary is not a paragraph break. */
export function appendJournalProse(existing: string, segment: string) {
  const next = segment.trim();
  if (!next) return existing;
  if (!existing.trim()) return next;
  const paragraph = /\n\s*\n$/.test(existing);
  const separator = /[.!?…][”"']?$/.test(existing.trimEnd()) ? " " : ". ";
  const sentence = next.replace(/^([a-z])/, (letter) => letter.toUpperCase());
  return `${existing.trimEnd()}${paragraph ? "\n\n" : separator}${sentence}`;
}
