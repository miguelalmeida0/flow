export function journalBookmarkAnchor(text: string) {
  return /last sentence/.test(text) ? "last-sentence" as const : /what i just said|that line|part i just said/.test(text) ? "recent" as const : "current" as const;
}

/** Readable sentence identity is separate from a native transcript segment. */
export function lastJournalSentence(text: string) {
  return [...text.matchAll(/[^.!?]+(?:[.!?]+|$)/g)].at(-1)?.[0].trim();
}
