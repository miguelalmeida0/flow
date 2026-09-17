export interface ContextPhrase {
  phrase: string;
  boost: number;
}

const calendarTerms = [
  "move", "shift", "push", "reschedule", "schedule", "create", "add", "delete", "cancel",
  "protect", "unprotect", "keep", "fixed", "flexible", "tomorrow", "today", "morning",
  "afternoon", "evening", "before", "after", "later", "earlier", "minutes", "hour", "hours",
  "lunch", "dinner", "workout", "meeting", "interview", "rename", "label", "important",
  "critical", "anchored", "heavy", "light", "fluid", "red", "orange", "yellow", "green",
  "cyan", "blue", "indigo", "Breathing Room", "buffer", "split", "divide", "merge", "combine",
  "complete", "finished", "reopen", "preview", "what if", "do it", "day boundary", "rebalance", "Tide",
];

export function buildContextPhrases(eventTitles: string[], selectedTitle?: string): ContextPhrase[] {
  const phrases = new Map<string, ContextPhrase>();
  for (const title of eventTitles) {
    const clean = title.trim();
    if (clean) phrases.set(clean.toLowerCase(), { phrase: clean, boost: clean === selectedTitle ? 5 : 3 });
  }
  for (const phrase of calendarTerms) {
    if (!phrases.has(phrase.toLowerCase())) phrases.set(phrase.toLowerCase(), { phrase, boost: 2 });
  }
  return [...phrases.values()].slice(0, 64);
}
