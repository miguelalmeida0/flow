const fillerPatterns = [
  /^(?:uh|um|erm),?\s+/,
  /^(?:actually|please),?\s+/,
  /^(?:could|can|would)\s+you\s+(?:please\s+)?/,
  /^i\s+(?:need|want)\s+you\s+to\s+/,
  /^i\s+need\s+to\s+/,
];

export function normalizeTranscript(input: string) {
  let text = input
    .normalize("NFKC")
    .replace(/[’‘]/g, "'")
    .replace(/[–—]/g, "-")
    .toLowerCase()
    // Canonicalize dictated meridiems before clause splitting sees their dots.
    .replace(/(?<!\p{L})([ap])\s*\.?\s*m\b(?:\.(?=\s|$))?/gu, "$1m")
    .replace(/\bi'm\b/g, "i am")
    .replace(/\bdon't\b/g, "do not")
    .replace(/\bcan't\b/g, "cannot")
    .replace(/\bo'clock\b/g, "oclock")
    .replace(/\s+/g, " ")
    .trim();

  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of fillerPatterns) {
      const next = text.replace(pattern, "");
      if (next !== text) {
        text = next.trim();
        changed = true;
      }
    }
  }

  return text.replace(/[.!?]+$/g, "").trim();
}
